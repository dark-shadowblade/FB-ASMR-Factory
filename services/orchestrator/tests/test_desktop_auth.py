from __future__ import annotations

import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def test_opaque_origin_cannot_access_local_api_without_desktop_token():
    client = TestClient(app)
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("ASMR_FACTORY_DESKTOP_TOKEN", None)
        response = client.get("/api/v1/health", headers={"Origin": "null"})
    assert response.status_code == 403


def test_opaque_origin_can_access_local_api_with_desktop_token():
    client = TestClient(app)
    with patch.dict(os.environ, {"ASMR_FACTORY_DESKTOP_TOKEN": "launch-secret"}):
        response = client.get("/api/v1/health", headers={
            "Origin": "null", "X-ASMR-Desktop-Token": "launch-secret"
        })
    assert response.status_code == 200
