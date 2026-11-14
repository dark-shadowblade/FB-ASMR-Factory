from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
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
    if not video:
        raise MediaPipelineError(f"Clip must contain a video stream: {path.name}")
    if not video.get("width") or not video.get("height") or duration <= 0:
        raise MediaPipelineError(f"Clip has invalid dimensions or duration: {path.name}")
    return {
        "path": path,
        "duration": duration,
        "width": int(video["width"]),
        "height": int(video["height"]),
        "video_codec": video["codec_name"],
        "audio_codec": audio["codec_name"] if audio else "",
        "frame_rate": video.get("r_frame_rate", ""),
    }


def assemble_five_clips(
    clip_paths: list[str | Path],
    output_path: str | Path,
    *,
    ffmpeg: str = "ffmpeg",
    ffprobe: str = "ffprobe",
    expected_clip_duration: float = 8.0,
    output_height: int = 1280,
) -> dict[str, Any]:
    """Normalize five vertical clips to a common H.264/AAC format, then concatenate."""
    if len(clip_paths) != 5:
        raise MediaPipelineError(f"Exactly five clips are required; received {len(clip_paths)}")
    if not shutil.which(ffmpeg):
        raise MediaPipelineError(f"Required media tool not found: {ffmpeg}")
    if not shutil.which(ffprobe):
        raise MediaPipelineError(f"Required media tool not found: {ffprobe}")
    if output_height not in (1280, 1920):
        raise MediaPipelineError("Output height must be 1280 (720p vertical) or 1920 (1080p vertical)")
    output_width = output_height * 9 // 16
    clips = [probe_video(Path(path), ffprobe=ffprobe) for path in clip_paths]
    for index, clip in enumerate(clips, start=1):
        if abs(clip["duration"] - expected_clip_duration) > max(1.0, expected_clip_duration * 0.15):
            raise MediaPipelineError(f"Clip {index} duration is {clip['duration']:.2f}s; expected approximately {expected_clip_duration:g} seconds")
        ratio = clip["width"] / clip["height"]
        if clip["height"] <= clip["width"] or abs(ratio - (9 / 16)) > 0.12:
            raise MediaPipelineError(f"Clip {index} is not a portrait video suitable for 9:16 output ({clip['width']}x{clip['height']})")
    output = Path(output_path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output in {clip["path"].resolve() for clip in clips}:
        raise MediaPipelineError("Output path must not overwrite an input clip")
    if output.exists():
        raise MediaPipelineError("Output already exists; refusing to overwrite an existing video")
    manifest = output.with_name(output.stem + ".concat.txt")
    def quote_concat_path(path: Path) -> str:
        return str(path.resolve()).replace("'", "'\\''")
    try:
        with tempfile.TemporaryDirectory(prefix="asmr-normalized-", dir=str(output.parent)) as temp_dir:
            normalized: list[Path] = []
            for index, clip in enumerate(clips, start=1):
                target = Path(temp_dir) / f"clip-{index:02d}.mp4"
                video_filter = f"scale={output_width}:{output_height}:force_original_aspect_ratio=decrease,pad={output_width}:{output_height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p"
                if clip["audio_codec"]:
                    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(clip["path"]),
                        "-map", "0:v:0", "-map", "0:a:0", "-vf", video_filter,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-af", "aresample=async=1:first_pts=0",
                        "-shortest", "-movflags", "+faststart", str(target)]
                else:
                    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(clip["path"]),
                        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                        "-map", "0:v:0", "-map", "1:a:0", "-vf", video_filter,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest",
                        "-movflags", "+faststart", str(target)]
                _run(command)
                if not target.is_file() or target.stat().st_size == 0:
                    raise MediaPipelineError(f"Normalization did not produce clip {index}")
                normalized.append(target)
            manifest.write_text("".join(f"file '{quote_concat_path(path)}'\n" for path in normalized), encoding="utf-8")
            _run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                  "-i", str(manifest), "-c", "copy", "-movflags", "+faststart", str(output)])
        if not output.is_file() or output.stat().st_size == 0:
            raise MediaPipelineError("FFmpeg completed without producing a non-empty output file")
        final = probe_video(output, ffprobe=ffprobe)
        expected_duration = sum(clip["duration"] for clip in clips)
        if abs(final["duration"] - expected_duration) > max(1.0, expected_duration * 0.03):
            raise MediaPipelineError("Final video duration does not match the five source clips")
        if final["width"] != output_width or final["height"] != output_height or final["video_codec"] != "h264" or final["audio_codec"] != "aac":
            raise MediaPipelineError("Final video failed normalized 720x1280 H.264/AAC validation")
    except Exception:
        output.unlink(missing_ok=True)
        raise
    finally:
        manifest.unlink(missing_ok=True)
    return {"output": str(output), "clip_count": 5, "duration_seconds": round(final["duration"], 3),
            "width": final["width"], "height": final["height"], "video_codec": final["video_codec"],
            "audio_codec": final["audio_codec"], "size_bytes": output.stat().st_size}
