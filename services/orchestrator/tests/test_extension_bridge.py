from __future__ import annotations

import sqlite3
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.extension_bridge import create_extension_router


def make_client(tmp_path):
    db = tmp_path / "test.sqlite3"
    with sqlite3.connect(db) as conn:
        conn.executescript("""
        CREATE TABLE jobs(id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
        CREATE TABLE clips(id TEXT PRIMARY KEY, job_id TEXT, prompt TEXT, clip_order INTEGER, status TEXT DEFAULT 'planned');
        CREATE TABLE flow_profiles(profile_id TEXT PRIMARY KEY, project_url TEXT);
        CREATE TABLE job_events(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, event TEXT, created_at TEXT);
        INSERT INTO jobs VALUES('job-a','prompts_approved','now');
        INSERT INTO flow_profiles VALUES('flow-1','https://flow.google.com/project/12345678-abcd');
        INSERT INTO flow_profiles VALUES('flow-2','https://flow.google.com/project/23456789-abcd');
        INSERT INTO flow_profiles VALUES('flow-3','https://flow.google.com/project/34567890-abcd');
        INSERT INTO flow_profiles VALUES('flow-4','https://flow.google.com/project/45678901-abcd');
        INSERT INTO flow_profiles VALUES('flow-5','https://flow.google.com/project/56789012-abcd');
        """)
        for i in range(1, 6):
            conn.execute("INSERT INTO clips VALUES(?,?,?,?)",
                (f"clip-{i}", "job-a", "A detailed approved ASMR prompt for test clip number " + str(i) + " with realistic material texture and action.", i))
    app = FastAPI()
    app.include_router(create_extension_router(db, tmp_path))
    client = TestClient(app)
    token = (tmp_path / "extension-bridge.token").read_text().strip()
    headers = {"X-ASMR-Bridge-Token": token}
    for index in range(1, 6):
        client.post("/api/v1/extension/register", headers=headers, json={
            "protocolVersion": 1, "profileId": f"flow-{index}",
            "instanceId": f"instance-flow-{index}", "extensionVersion": "0.1.0"
        })
    return client, headers, db


def test_dispatch_assigns_one_task_to_each_profile(tmp_path):
    client, headers, _ = make_client(tmp_path)
    response = client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    assert [x["profileId"] for x in tasks] == [f"flow-{i}" for i in range(1, 6)]
    task = client.get("/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers).json()["task"]
    assert task["profileId"] == "flow-1"
    assert task["clipId"] == "clip-1"


def test_profile_cannot_poll_another_profiles_task(tmp_path):
    client, headers, _ = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    one = client.get("/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers).json()["task"]
    two = client.get("/api/v1/extension/next-task?profile_id=flow-2&instance_id=instance-flow-2", headers=headers).json()["task"]
    assert one["taskId"] != two["taskId"]
    assert client.get("/api/v1/extension/next-task?profile_id=flow-2&instance_id=instance-flow-1", headers=headers).status_code == 409
    assert one["profileId"] == "flow-1"
    assert two["profileId"] == "flow-2"


def test_event_identity_mismatch_is_rejected(tmp_path):
    client, headers, _ = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    task = client.get("/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers).json()["task"]
    payload = {
        "protocolVersion": 1, "messageId": "message-0001", "type": "GENERATION_STARTED",
        "taskId": task["taskId"], "jobId": task["jobId"], "clipId": task["clipId"],
        "profileId": "flow-2", "instanceId": "instance-flow-2", "timestamp": "2026-11-14T00:00:00Z", "payload": {}
    }
    assert client.post("/api/v1/extension/events", json=payload, headers=headers).status_code == 409


def test_download_completed_event_marks_the_matching_clip_downloaded(tmp_path):
    client, headers, _ = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    task = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1",
        headers=headers,
    ).json()["task"]
    payload = {
        "protocolVersion": 1, "messageId": "message-download-001", "type": "DOWNLOAD_COMPLETED",
        "taskId": task["taskId"], "jobId": task["jobId"], "clipId": task["clipId"],
        "profileId": "flow-1", "instanceId": "instance-flow-1",
        "timestamp": "2026-11-14T00:00:00Z",
        "payload": {"filename": "/tmp/clip-1.mp4", "fileSize": 12345},
    }
    response = client.post("/api/v1/extension/events", json=payload, headers=headers)
    assert response.status_code == 200
    with sqlite3.connect(tmp_path / "test.sqlite3") as conn:
        status = conn.execute("SELECT status FROM clips WHERE id=?", (task["clipId"],)).fetchone()[0]
    assert status == "downloaded"


def test_bridge_requires_local_secret(tmp_path):
    client, _, _ = make_client(tmp_path)
    assert client.get("/api/v1/extension/health").status_code == 401


def test_dispatch_rejects_missing_worker_heartbeat(tmp_path):
    client, headers, db = make_client(tmp_path)
    with sqlite3.connect(db) as conn:
        conn.execute("DELETE FROM extension_instances WHERE profile_id='flow-5'")
    response = client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    assert response.status_code == 409
    assert "flow-5" in response.json()["detail"]


def test_commands_are_scoped_to_exact_profile_instance_and_task(tmp_path):
    client, headers, _ = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    task_one = client.get("/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers).json()["task"]
    task_two = client.get("/api/v1/extension/next-task?profile_id=flow-2&instance_id=instance-flow-2", headers=headers).json()["task"]
    response = client.post(f"/api/v1/extension/tasks/{task_one['taskId']}/command",
                           headers=headers, json={"command": "PAUSE"})
    assert response.status_code == 200
    wrong_instance = client.get(
        f"/api/v1/extension/commands?profile_id=flow-1&task_id={task_one['taskId']}&instance_id=instance-flow-2",
        headers=headers,
    )
    assert wrong_instance.status_code == 409
    other_task = client.get(
        f"/api/v1/extension/commands?profile_id=flow-2&task_id={task_two['taskId']}&instance_id=instance-flow-2",
        headers=headers,
    )
    assert other_task.status_code == 200
    assert other_task.json()["commands"] == []
    own_task = client.get(
        f"/api/v1/extension/commands?profile_id=flow-1&task_id={task_one['taskId']}&instance_id=instance-flow-1",
        headers=headers,
    )
    assert own_task.status_code == 200
    assert own_task.json()["commands"][0]["command"] == "PAUSE"
