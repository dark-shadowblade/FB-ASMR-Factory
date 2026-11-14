from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


class MediaPipelineError(RuntimeError):
    """Raised when a downloaded clip cannot safely be included in a final video."""


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True, timeout=180)
    except FileNotFoundError as exc:
        raise MediaPipelineError(f"Required media tool not found: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise MediaPipelineError(f"Media command failed: {detail[-1200:]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaPipelineError(f"Media command timed out: {command[0]}") from exc


def probe_video(path: Path, ffprobe: str = "ffprobe") -> dict[str, Any]:
    path = Path(path)
    if not path.is_file() or path.stat().st_size == 0:
        raise MediaPipelineError(f"Clip is missing or empty: {path.name}")
    if path.suffix.lower() != ".mp4":
        raise MediaPipelineError(f"Expected an MP4 clip: {path.name}")
    result = _run([
        ffprobe, "-v", "error", "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name,width,height,r_frame_rate",
        "-of", "json", str(path),
    ])
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise MediaPipelineError(f"ffprobe returned invalid metadata for {path.name}") from exc

    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = float(data.get("format", {}).get("duration", 0) or 0)
    if not video or not audio:
        raise MediaPipelineError(f"Clip must contain both video and audio: {path.name}")
    if video.get("codec_name") != "h264" or audio.get("codec_name") != "aac":
        raise MediaPipelineError(f"Clip must use H.264 video and AAC audio: {path.name}")
    if not video.get("width") or not video.get("height") or duration <= 0:
        raise MediaPipelineError(f"Clip has invalid dimensions or duration: {path.name}")
    return {
        "path": path,
        "duration": duration,
        "width": int(video["width"]),
        "height": int(video["height"]),
        "video_codec": video["codec_name"],
        "audio_codec": audio["codec_name"],
        "frame_rate": video.get("r_frame_rate", ""),
    }


def assemble_five_clips(
    clip_paths: list[str | Path],
    output_path: str | Path,
    *,
    ffmpeg: str = "ffmpeg",
    ffprobe: str = "ffprobe",
) -> dict[str, Any]:
    """Validate five compatible MP4 clips and concatenate them without re-encoding."""
    if len(clip_paths) != 5:
        raise MediaPipelineError(f"Exactly five clips are required; received {len(clip_paths)}")
    if not shutil.which(ffmpeg):
        raise MediaPipelineError(f"Required media tool not found: {ffmpeg}")
    if not shutil.which(ffprobe):
        raise MediaPipelineError(f"Required media tool not found: {ffprobe}")

    clips = [probe_video(Path(path), ffprobe=ffprobe) for path in clip_paths]
    reference = clips[0]
    for index, clip in enumerate(clips, start=1):
        if abs(clip["duration"] - 8.0) > 1.0:
            raise MediaPipelineError(
                f"Clip {index} duration is {clip['duration']:.2f}s; expected approximately 8 seconds"
            )
        ratio = clip["width"] / clip["height"]
        if clip["height"] <= clip["width"] or abs(ratio - (9 / 16)) > 0.03:
            raise MediaPipelineError(f"Clip {index} is not vertical 9:16 video ({clip['width']}x{clip['height']})")
        for key in ("width", "height", "video_codec", "audio_codec", "frame_rate"):
            if clip[key] != reference[key]:
                raise MediaPipelineError(
                    f"Clip {index} is incompatible ({key}: {clip[key]} vs {reference[key]})"
                )

    output = Path(output_path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output in {clip["path"].resolve() for clip in clips}:
        raise MediaPipelineError("Output path must not overwrite an input clip")
    if output.exists():
        raise MediaPipelineError("Output already exists; refusing to overwrite an existing video")

    # The concat demuxer manifest is kept beside the output and removed even on failure.
    manifest = output.with_name(output.stem + ".concat.txt")
    def quote_concat_path(path: Path) -> str:
        return str(path.resolve()).replace("'", "'\\''")

    manifest.write_text(
        "".join(f"file '{quote_concat_path(clip['path'])}'\n" for clip in clips),
        encoding="utf-8",
    )
    try:
        _run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(manifest),
            "-c", "copy", "-movflags", "+faststart", str(output),
        ])
        if not output.is_file() or output.stat().st_size == 0:
            raise MediaPipelineError("FFmpeg completed without producing a non-empty output file")
        final = probe_video(output, ffprobe=ffprobe)
        expected_duration = sum(clip["duration"] for clip in clips)
        if abs(final["duration"] - expected_duration) > max(0.75, expected_duration * 0.02):
            raise MediaPipelineError("Final video duration does not match the five source clips")
        for key in ("width", "height", "video_codec", "audio_codec"):
            if final[key] != reference[key]:
                raise MediaPipelineError(f"Final video failed validation ({key} mismatch)")
    except Exception:
        output.unlink(missing_ok=True)
        raise
    finally:
        manifest.unlink(missing_ok=True)

    return {
        "output": str(output),
        "clip_count": len(clips),
        "duration_seconds": round(final["duration"], 3),
        "width": final["width"],
        "height": final["height"],
        "video_codec": final["video_codec"],
        "audio_codec": final["audio_codec"],
        "size_bytes": output.stat().st_size,
    }
