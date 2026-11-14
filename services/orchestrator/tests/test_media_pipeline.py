import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess

from app import media_pipeline


class MediaPipelineTests(unittest.TestCase):
    def test_media_command_output_is_logged(self):
        command = ["ffmpeg", "-version"]
        completed = CompletedProcess(command, 0, "", "ffmpeg diagnostic output")
        with patch.object(media_pipeline.subprocess, "run", return_value=completed):
            with self.assertLogs("asmr_factory.media", level="INFO") as captured:
                result = media_pipeline._run(command)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(any("ffmpeg diagnostic output" in line for line in captured.output))

    def test_media_command_failure_is_logged(self):
        command = ["ffmpeg", "-bad-option"]
        error = media_pipeline.subprocess.CalledProcessError(2, command, output="", stderr="invalid option")
        with patch.object(media_pipeline.subprocess, "run", side_effect=error):
            with self.assertLogs("asmr_factory.media", level="ERROR") as captured:
                with self.assertRaises(media_pipeline.MediaPipelineError):
                    media_pipeline._run(command)
        self.assertTrue(any("invalid option" in line for line in captured.output))

    def metadata(self, width=720, height=1280, fps="30/1", duration=8.0):
        return json.dumps({
            "format": {"duration": str(duration), "format_name": "mov,mp4"},
            "streams": [
                {"codec_type": "video", "codec_name": "h264", "width": width,
                 "height": height, "r_frame_rate": fps},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
        })

    def test_probe_rejects_missing_and_non_mp4_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(media_pipeline.MediaPipelineError):
                media_pipeline.probe_video(root / "missing.mp4")
            text_file = root / "clip.txt"
            text_file.write_text("not a video")
            with self.assertRaises(media_pipeline.MediaPipelineError):
                media_pipeline.probe_video(text_file)

    def test_probe_requires_audio_and_video_codecs(self):
        with tempfile.TemporaryDirectory() as directory:
            clip = Path(directory) / "clip.mp4"
            clip.write_bytes(b"fake")
            invalid = json.dumps({
                "format": {"duration": "8"},
                "streams": [{"codec_type": "video", "codec_name": "vp9",
                             "width": 720, "height": 1280, "r_frame_rate": "30/1"}],
            })
            with patch.object(media_pipeline, "_run",
                              return_value=CompletedProcess([], 0, invalid, "")):
                with self.assertRaises(media_pipeline.MediaPipelineError):
                    media_pipeline.probe_video(clip)

    def test_assembly_rejects_source_clips_far_from_eight_seconds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clips = []
            for i in range(5):
                path = root / f"{i}.mp4"
                path.write_bytes(b"fake")
                clips.append(path)

            def fake_run(command):
                if command[0] == "ffprobe":
                    duration = 12.0 if Path(command[-1]).stem == "3" else 8.0
                    return CompletedProcess(command, 0, self.metadata(duration=duration), "")
                raise AssertionError("FFmpeg must not run for invalid source durations")

            with patch.object(media_pipeline.shutil, "which", return_value="/usr/bin/tool"), patch.object(media_pipeline, "_run", side_effect=fake_run):
                with self.assertRaisesRegex(media_pipeline.MediaPipelineError, "expected approximately 8 seconds"):
                    media_pipeline.assemble_five_clips(clips, root / "final.mp4")

    def test_assembly_requires_exactly_five_clips(self):
        with self.assertRaises(media_pipeline.MediaPipelineError):
            media_pipeline.assemble_five_clips(["a.mp4"] * 4, "out.mp4")

    def test_assembly_validates_compatibility_and_creates_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clips = []
            for i in range(5):
                path = root / f"{i}.mp4"
                path.write_bytes(b"fake")
                clips.append(path)

            def fake_run(command):
                if command[0] == "ffprobe":
                    probe_path = Path(command[-1])
                    if probe_path.stem == "final":
                        return CompletedProcess(command, 0, self.metadata(duration=40.0), "")
                    index = int(probe_path.stem)
                    metadata = self.metadata(fps="24/1" if index == 4 else "30/1")
                    return CompletedProcess(command, 0, metadata, "")
                Path(command[-1]).write_bytes(b"merged")
                return CompletedProcess(command, 0, "", "")

            with patch.object(media_pipeline.shutil, "which", return_value="/usr/bin/tool"), \
                 patch.object(media_pipeline, "_run", side_effect=fake_run):
                with self.assertRaisesRegex(media_pipeline.MediaPipelineError, "incompatible"):
                    media_pipeline.assemble_five_clips(clips, root / "final.mp4")

    def test_assembly_merges_five_compatible_clips(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clips = []
            for i in range(5):
                path = root / f"{i}.mp4"
                path.write_bytes(b"fake")
                clips.append(path)

            def fake_run(command):
                if command[0] == "ffprobe":
                    duration = 40.0 if Path(command[-1]).stem == "final" else 8.0
                    return CompletedProcess(command, 0, self.metadata(duration=duration), "")
                self.assertIn("-c", command)
                self.assertIn("copy", command)
                Path(command[-1]).write_bytes(b"merged-video")
                return CompletedProcess(command, 0, "", "")

            with patch.object(media_pipeline.shutil, "which", return_value="/usr/bin/tool"), \
                 patch.object(media_pipeline, "_run", side_effect=fake_run):
                result = media_pipeline.assemble_five_clips(clips, root / "final.mp4")
            self.assertEqual(result["clip_count"], 5)
            self.assertEqual(result["duration_seconds"], 40.0)
            self.assertEqual(result["width"], 720)
            self.assertTrue((root / "final.mp4").is_file())
            self.assertFalse((root / "final.concat.txt").exists())


if __name__ == "__main__":
    unittest.main()
