import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess

from app import media_pipeline


class MediaPipelineTests(unittest.TestCase):
    def metadata(self, width=720, height=1280, fps="30/1"):
        return json.dumps({
            "format": {"duration": "8.0", "format_name": "mov,mp4"},
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
                    index = int(Path(command[-1]).stem)
                    metadata = self.metadata(width=640 if index == 4 else 720)
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
                    return CompletedProcess(command, 0, self.metadata(), "")
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
