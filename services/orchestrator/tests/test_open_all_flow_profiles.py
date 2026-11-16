import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

TEMP_DATA = tempfile.TemporaryDirectory()
os.environ["ASMR_FACTORY_DATA"] = TEMP_DATA.name

from fastapi.testclient import TestClient
from app import main


class OpenAllFlowProfilesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(main.app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        TEMP_DATA.cleanup()

    def setUp(self):
        with main.connect() as conn:
            conn.execute("UPDATE flow_profiles SET project_url='', updated_at=?",
                         (main.utc_now(),))

    def test_open_all_auto_creates_projects_when_profiles_have_no_saved_url(self):
        async def opened(profile_id, url):
            return {"profile_id": profile_id, "login_required": False,
                    "current_url": f"https://flow.google.com/project/{profile_id}-12345678",
                    "status": "project_open", "project_created": True}

        with patch.object(main.FLOW_MANAGER, "open_profile", new=AsyncMock(side_effect=opened)) as opener:
            response = self.client.post("/api/v1/flow/profiles/open-all")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["opened"], 5)
        self.assertEqual(opener.await_count, 5)
        with main.connect() as conn:
            saved = conn.execute("SELECT COUNT(*) AS n FROM flow_profiles WHERE length(project_url)>0").fetchone()["n"]
        self.assertEqual(saved, 5)

    def test_open_all_launches_each_isolated_profile(self):
        project_url = "https://flow.google.com/project/12345678-abcd"
        with main.connect() as conn:
            for index in range(1, 6):
                conn.execute("UPDATE flow_profiles SET project_url=? WHERE profile_id=?",
                             (project_url, f"flow-{index}"))

        async def opened(profile_id, url):
            return {"profile_id": profile_id, "login_required": False,
                    "current_url": url, "status": "project_open"}

        with patch.object(main.FLOW_MANAGER, "open_profile", new=AsyncMock(side_effect=opened)) as opener:
            response = self.client.post("/api/v1/flow/profiles/open-all")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["opened"], 5)
        self.assertEqual([p["profile_id"] for p in response.json()["profiles"]],
                         [f"flow-{i}" for i in range(1, 6)])
        self.assertEqual(opener.await_count, 5)

    def test_open_all_reports_partial_browser_launch_failure(self):
        project_url = "https://flow.google.com/project/12345678-abcd"
        with main.connect() as conn:
            for index in range(1, 6):
                conn.execute("UPDATE flow_profiles SET project_url=? WHERE profile_id=?",
                             (project_url, f"flow-{index}"))

        async def opened(profile_id, url):
            if profile_id == "flow-3":
                raise RuntimeError("Chrome failed")
            return {"profile_id": profile_id, "login_required": False, "current_url": url}

        with patch.object(main.FLOW_MANAGER, "open_profile", new=AsyncMock(side_effect=opened)):
            response = self.client.post("/api/v1/flow/profiles/open-all")

        self.assertEqual(response.status_code, 503)
        self.assertIn("flow-3", str(response.json()["detail"]))


if __name__ == "__main__":
    unittest.main()
