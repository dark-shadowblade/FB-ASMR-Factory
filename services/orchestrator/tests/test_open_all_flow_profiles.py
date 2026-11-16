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

    def test_open_all_opens_five_profiles_at_flow_home_when_projects_are_not_saved(self):
        async def opened(profile_id, url):
            return {"profile_id": profile_id, "login_required": False,
                    "current_url": url, "status": "project_open"}

        with patch.object(main, "FLOW_PROJECT_DISCOVERY_TIMEOUT_SECONDS", 0), \
             patch.object(main.FLOW_MANAGER, "open_profile", new=AsyncMock(side_effect=opened)) as opener:
            response = self.client.post("/api/v1/flow/profiles/open-all")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["opened"], 5)
        self.assertEqual(opener.await_count, 5)
        self.assertTrue(all(p["opened"] for p in response.json()["profiles"]))
        self.assertTrue(all(p["current_url"] == "https://flow.google.com/" for p in response.json()["profiles"]))
        self.assertTrue(all(not p["project_ready"] for p in response.json()["profiles"]))

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

    def test_open_all_waits_for_extension_created_projects_before_returning_ready(self):
        project_url = "https://flow.google.com/project/12345678-abcd"

        async def opened(profile_id, url):
            # Simulate the extension's /project-detected callback after it clicks
            # the unique New project control and Flow changes the SPA route.
            with main.connect() as conn:
                conn.execute(
                    "UPDATE flow_profiles SET project_url=?, updated_at=? WHERE profile_id=?",
                    (project_url, main.utc_now(), profile_id),
                )
            return {
                "profile_id": profile_id,
                "login_required": False,
                "project_ready": False,
                "current_url": "https://flow.google.com/",
                "status": "project_open",
            }

        with patch.object(main.FLOW_MANAGER, "open_profile", new=AsyncMock(side_effect=opened)):
            response = self.client.post("/api/v1/flow/profiles/open-all")

        self.assertEqual(response.status_code, 200, response.text)
        profiles = response.json()["profiles"]
        self.assertEqual(len(profiles), 5)
        self.assertTrue(all(item["project_ready"] for item in profiles))
        self.assertTrue(all(item["current_url"] == project_url for item in profiles))

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
