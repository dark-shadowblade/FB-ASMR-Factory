from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class DesktopAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_opaque_origin_cannot_access_local_api_without_desktop_token(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ASMR_FACTORY_DESKTOP_TOKEN", None)
            response = self.client.get("/api/v1/health", headers={"Origin": "null"})
        self.assertEqual(response.status_code, 403)

    def test_opaque_origin_can_access_local_api_with_desktop_token(self):
        with patch.dict(os.environ, {"ASMR_FACTORY_DESKTOP_TOKEN": "launch-secret"}):
            response = self.client.get("/api/v1/health", headers={
                "Origin": "null", "X-ASMR-Desktop-Token": "launch-secret"
            })
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
