import os
import tempfile
import unittest
import sqlite3
from pathlib import Path
from unittest.mock import patch

TEMP_DATA = tempfile.TemporaryDirectory()
os.environ["ASMR_FACTORY_DATA"] = TEMP_DATA.name

from fastapi.testclient import TestClient
from app.main import app
from app import main as main_module


class JobRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
    def test_fruits_job_has_exactly_five_clip_tasks(self):
        response = self.client.post("/api/v1/jobs", json={"topic": "Tropical", "theme": "fruits"})
        self.assertEqual(response.status_code, 200)
        job = response.json()["job"]
        self.assertEqual(len(job["clips"]), 5)
        self.assertEqual([c["order"] for c in job["clips"]], [1, 2, 3, 4, 5])

    def test_all_seven_themes_create_five_clip_tasks(self):
        themes = ["fruits", "soaps", "clay", "kinetic_sand", "slime", "satisfying_objects", "mixed_asmr"]
        for theme in themes:
            response = self.client.post("/api/v1/jobs", json={"topic": "Test " + theme, "theme": theme})
            self.assertEqual(response.status_code, 200, theme)
            self.assertEqual(len(response.json()["job"]["clips"]), 5, theme)

    def test_unknown_theme_is_rejected(self):
        response = self.client.post("/api/v1/jobs", json={"topic": "Test", "theme": "unknown"})
        self.assertEqual(response.status_code, 422)

    def test_blank_topic_is_rejected(self):
        response = self.client.post("/api/v1/jobs", json={"topic": "   ", "theme": "fruits"})
        self.assertEqual(response.status_code, 422)


    def test_prompt_generation_creates_five_distinct_prompts(self):
        created = self.client.post("/api/v1/jobs", json={"topic": "Tropical Fruits", "theme": "fruits"}).json()["job"]
        response = self.client.post(f"/api/v1/jobs/{created['id']}/generate-prompts")
        self.assertEqual(response.status_code, 200)
        job = response.json()["job"]
        self.assertEqual(job["status"], "prompts_ready")
        self.assertEqual([clip["subject"] for clip in job["clips"]], ["Watermelon", "Kiwi", "Orange", "Pineapple", "Strawberry"])
        self.assertTrue(all(len(clip["prompt"]) > 100 for clip in job["clips"]))
        self.assertEqual(len({clip["prompt"] for clip in job["clips"]}), 5)

    def test_every_theme_generates_five_subject_specific_prompts(self):
        themes = ["fruits", "soaps", "clay", "kinetic_sand", "slime", "satisfying_objects", "mixed_asmr"]
        for theme in themes:
            job = self.client.post("/api/v1/jobs", json={"topic": "Daily ASMR", "theme": theme}).json()["job"]
            response = self.client.post("/api/v1/jobs/" + job["id"] + "/generate-prompts")
            self.assertEqual(response.status_code, 200, theme)
            prompts = response.json()["job"]["clips"]
            self.assertEqual(len(prompts), 5)
            self.assertEqual(len({p["subject"] for p in prompts}), 5)
            self.assertEqual(len({p["prompt"] for p in prompts}), 5)
            self.assertTrue(all(len(p["prompt"]) > 100 for p in prompts))

    def test_style_bible_can_be_saved_and_reused(self):
        custom = "Consistent macro camera, warm studio lighting, clean slate board, crisp natural cutting audio, no music or speech."
        response = self.client.put("/api/v1/style-bible", json={"content": custom})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/style-bible").json()["content"], custom)

    def test_five_flow_profiles_are_seeded_and_persisted(self):
        response = self.client.get("/api/v1/flow/profiles")
        self.assertEqual(response.status_code, 200)
        profiles = response.json()["profiles"]
        self.assertEqual([p["profile_id"] for p in profiles], ["flow-1", "flow-2", "flow-3", "flow-4", "flow-5"])
        project_url = "https://flow.google.com/project/cc488538-59da-4ece-ba7a-6236918191a1"
        saved = self.client.put("/api/v1/flow/profiles/flow-1", json={
            "display_name": "Primary Flow", "project_url": project_url
        })
        self.assertEqual(saved.status_code, 200)
        refreshed = self.client.get("/api/v1/flow/profiles").json()["profiles"][0]
        self.assertEqual(refreshed["display_name"], "Primary Flow")
        self.assertEqual(refreshed["project_url"], project_url)
        self.assertTrue(refreshed["configured"])

    def test_flow_profile_rejects_non_project_urls(self):
        response = self.client.put("/api/v1/flow/profiles/flow-1", json={
            "display_name": "Bad URL", "project_url": "https://example.com/"
        })
        self.assertEqual(response.status_code, 422)

    def test_flow_profile_rejects_unknown_profile_id(self):
        response = self.client.put("/api/v1/flow/profiles/flow-6", json={
            "display_name": "Extra", "project_url": "https://flow.google.com/project/cc488538-59da-4ece-ba7a-6236918191a1"
        })
        self.assertEqual(response.status_code, 404)

    def test_flow_automation_status_reports_five_worker_slots(self):
        response = self.client.get("/api/v1/flow/automation/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["profiles"]), 5)
        self.assertEqual(data["registered_count"], 0)
        self.assertEqual([p["profile_id"] for p in data["profiles"]],
                         ["flow-1", "flow-2", "flow-3", "flow-4", "flow-5"])

    def test_assembly_requires_five_completed_downloads(self):
        created = self.client.post("/api/v1/jobs", json={"topic": "Citrus", "theme": "fruits"}).json()["job"]
        response = self.client.post(f"/api/v1/jobs/{created['id']}/assemble")
        self.assertEqual(response.status_code, 409)
        self.assertIn("exactly five Flow tasks", response.json()["detail"])

    def test_assembly_reconciles_downloads_and_saves_library_output(self):
        import os
        import tempfile
        from pathlib import Path
        created = self.client.post("/api/v1/jobs", json={"topic": "Citrus", "theme": "fruits"}).json()["job"]
        job_id = created["id"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clips = []
            with sqlite3.connect(main_module.DB_PATH) as conn:
                for index, clip in enumerate(created["clips"], start=1):
                    source = root / f"clip-{index}.mp4"
                    source.write_bytes(b"source")
                    clips.append(source)
                    conn.execute(
                        """INSERT INTO extension_tasks(task_id,job_id,clip_id,profile_id,project_url,prompt,
                           settings_json,status,created_at,updated_at,download_path)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (f"task-{job_id}-{index}", job_id, clip["id"], f"flow-{index}",
                         f"https://flow.google.com/project/{index:08d}-abcd", clip["prompt"],
                         "{}", "downloaded", "now", "now", str(source))
                    )
            def fake_assemble(input_paths, output_path):
                output = Path(output_path)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(b"final-mp4")
                return {"output": str(output), "clip_count": 5, "duration_seconds": 40.0,
                        "width": 720, "height": 1280, "video_codec": "h264",
                        "audio_codec": "aac", "size_bytes": output.stat().st_size}
            with patch.dict(os.environ, {"ASMR_FACTORY_DOWNLOADS_DIR": directory}), \
                 patch.object(main_module.media_pipeline, "assemble_five_clips", side_effect=fake_assemble):
                response = self.client.post(f"/api/v1/jobs/{job_id}/assemble")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["output"]["clip_count"], 5)
            self.assertEqual(self.client.get("/api/v1/library").json()["videos"][0]["job_id"], job_id)
            self.assertTrue(self.client.get("/api/v1/library").json()["videos"][0]["social_metadata"]["title"])
            output = self.client.get(f"/api/v1/jobs/{job_id}/output")
            self.assertEqual(output.status_code, 200)
            self.assertEqual(output.json()["output"]["duration_seconds"], 40.0)
            social = output.json()["output"]["metadata"]["social_metadata"]
            self.assertTrue(social["title"])
            self.assertTrue(social["caption"])
            self.assertGreaterEqual(len(social["hashtags"]), 3)

    def test_prompt_pack_requires_all_five_before_approval(self):
        created = self.client.post("/api/v1/jobs", json={"topic": "Citrus", "theme": "fruits"}).json()["job"]
        response = self.client.post(f"/api/v1/jobs/{created['id']}/approve-prompts")
        self.assertEqual(response.status_code, 409)
        generated = self.client.post(f"/api/v1/jobs/{created['id']}/generate-prompts").json()["job"]
        approved = self.client.post(f"/api/v1/jobs/{created['id']}/approve-prompts")
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["job"]["status"], "prompts_approved")

    def test_cors_allows_desktop_put_and_patch_preflights(self):
        origin = "http://127.0.0.1:5173"
        for method, path in [
            ("PUT", "/api/v1/style-bible"),
            ("PUT", "/api/v1/flow/profiles/flow-1"),
            ("PATCH", "/api/v1/jobs/example/clips/example/prompt"),
        ]:
            response = self.client.options(path, headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type",
            })
            self.assertEqual(response.status_code, 200, f"{method} {path}: {response.text}")
            self.assertIn(method, response.headers.get("access-control-allow-methods", ""))
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

if __name__ == "__main__":
    unittest.main()