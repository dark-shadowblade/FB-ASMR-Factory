import os
import tempfile
import unittest
from pathlib import Path

TEMP_DATA = tempfile.TemporaryDirectory()
os.environ["ASMR_FACTORY_DATA"] = TEMP_DATA.name

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class JobRulesTests(unittest.TestCase):
    def test_fruits_job_has_exactly_five_clip_tasks(self):
        response = client.post("/api/v1/jobs", json={"topic": "Tropical", "theme": "fruits"})
        self.assertEqual(response.status_code, 200)
        job = response.json()["job"]
        self.assertEqual(len(job["clips"]), 5)
        self.assertEqual([c["order"] for c in job["clips"]], [1, 2, 3, 4, 5])

    def test_other_themes_are_rejected(self):
        response = client.post("/api/v1/jobs", json={"topic": "Test", "theme": "slime"})
        self.assertEqual(response.status_code, 422)

    def test_blank_topic_is_rejected(self):
        response = client.post("/api/v1/jobs", json={"topic": "   ", "theme": "fruits"})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()