import os
import tempfile
import unittest
from pathlib import Path

TEMP_DATA = tempfile.TemporaryDirectory()
os.environ["ASMR_FACTORY_DATA"] = TEMP_DATA.name

from fastapi.testclient import TestClient
from app.main import app


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

    def test_prompt_pack_requires_all_five_before_approval(self):
        created = self.client.post("/api/v1/jobs", json={"topic": "Citrus", "theme": "fruits"}).json()["job"]
        response = self.client.post(f"/api/v1/jobs/{created['id']}/approve-prompts")
        self.assertEqual(response.status_code, 409)
        generated = self.client.post(f"/api/v1/jobs/{created['id']}/generate-prompts").json()["job"]
        approved = self.client.post(f"/api/v1/jobs/{created['id']}/approve-prompts")
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["job"]["status"], "prompts_approved")

if __name__ == "__main__":
    unittest.main()