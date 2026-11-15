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
        CREATE TABLE flow_profiles(profile_id TEXT PRIMARY KEY, project_url TEXT, updated_at TEXT DEFAULT 'now');
        CREATE TABLE job_events(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, event TEXT, created_at TEXT);
        INSERT INTO jobs VALUES('job-a','prompts_approved','now');
        INSERT INTO flow_profiles(profile_id,project_url) VALUES('flow-1','https://flow.google.com/project/12345678-abcd');
        INSERT INTO flow_profiles(profile_id,project_url) VALUES('flow-2','https://flow.google.com/project/23456789-abcd');
        INSERT INTO flow_profiles(profile_id,project_url) VALUES('flow-3','https://flow.google.com/project/34567890-abcd');
        INSERT INTO flow_profiles(profile_id,project_url) VALUES('flow-4','https://flow.google.com/project/45678901-abcd');
        INSERT INTO flow_profiles(profile_id,project_url) VALUES('flow-5','https://flow.google.com/project/56789012-abcd');
        """)
        for i in range(1, 6):
            conn.execute("INSERT INTO clips(id,job_id,prompt,clip_order) VALUES(?,?,?,?)",
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
        client.post("/api/v1/extension/project-detected", headers=headers, json={
            "protocolVersion": 1, "profileId": f"flow-{index}",
            "instanceId": f"instance-flow-{index}",
            "projectUrl": f"https://flow.google.com/project/{['12345678','23456789','34567890','45678901','56789012'][index-1]}-abcd",
            "projectTitle": "Ready test project",
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
        task_status, prompt = conn.execute(
            "SELECT status,prompt FROM extension_tasks WHERE task_id=?", (task["taskId"],)
        ).fetchone()
        event_count = conn.execute(
            "SELECT COUNT(*) FROM extension_events WHERE task_id=?", (task["taskId"],)
        ).fetchone()[0]
    assert status == "downloaded"
    assert task_status == "downloaded"
    assert prompt == ""
    assert event_count == 1


def test_bridge_requires_local_secret(tmp_path):
    client, _, _ = make_client(tmp_path)
    assert client.get("/api/v1/extension/health").status_code == 401


def test_dispatch_queues_tasks_when_some_workers_are_offline(tmp_path):
    client, headers, db = make_client(tmp_path)
    with sqlite3.connect(db) as conn:
        conn.execute("DELETE FROM extension_instances WHERE profile_id='flow-5'")
    response = client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    assert response.status_code == 200
    assert response.json()["dispatched"] == 5
    assert response.json()["tasks"][-1]["profileId"] == "flow-5"
    queued = client.get(
        "/api/v1/extension/next-task?profile_id=flow-5&instance_id=instance-flow-5",
        headers=headers,
    )
    assert queued.status_code == 409


def test_failed_task_can_be_retried_on_its_live_profile(tmp_path):
    client, headers, _ = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    task = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1",
        headers=headers,
    ).json()["task"]
    failure = {
        "protocolVersion": 1, "messageId": "message-failed-001", "type": "TASK_FAILED",
        "taskId": task["taskId"], "jobId": task["jobId"], "clipId": task["clipId"],
        "profileId": "flow-1", "instanceId": "instance-flow-1",
        "timestamp": "2026-11-14T00:00:00Z", "payload": {"error": "Test failure"},
    }
    assert client.post("/api/v1/extension/events", json=failure, headers=headers).status_code == 200
    retried = client.post(f"/api/v1/extension/tasks/{task['taskId']}/retry", headers=headers, json={})
    assert retried.status_code == 200
    assert retried.json()["profileId"] == "flow-1"
    next_task = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1",
        headers=headers,
    ).json()["task"]
    assert next_task["taskId"] == task["taskId"]


def test_failed_task_can_be_reassigned_to_an_idle_live_profile(tmp_path):
    client, headers, db = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    task = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1",
        headers=headers,
    ).json()["task"]
    failure = {
        "protocolVersion": 1, "messageId": "message-failed-reassign-001", "type": "TASK_FAILED",
        "taskId": task["taskId"], "jobId": task["jobId"], "clipId": task["clipId"],
        "profileId": "flow-1", "instanceId": "instance-flow-1",
        "timestamp": "2026-11-14T00:00:00Z", "payload": {"error": "Test failure"},
    }
    assert client.post("/api/v1/extension/events", json=failure, headers=headers).status_code == 200
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE extension_tasks SET status='downloaded' WHERE profile_id='flow-2'")
    retried = client.post(
        f"/api/v1/extension/tasks/{task['taskId']}/retry",
        headers=headers, json={"profileId": "flow-2"},
    )
    assert retried.status_code == 200
    assert retried.json()["profileId"] == "flow-2"
    next_task = client.get(
        "/api/v1/extension/next-task?profile_id=flow-2&instance_id=instance-flow-2",
        headers=headers,
    ).json()["task"]
    assert next_task["taskId"] == task["taskId"]


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



def test_extension_auto_detects_and_saves_its_own_flow_project(tmp_path):
    client, headers, db = make_client(tmp_path)
    response = client.post("/api/v1/extension/project-detected", headers=headers, json={
        "protocolVersion": 1,
        "profileId": "flow-3",
        "instanceId": "instance-flow-3",
        "projectUrl": "https://flow.google.com/project/98765432-dcba",
        "projectTitle": "My Flow project",
    })
    assert response.status_code == 200
    assert response.json()["saved"] is True
    with sqlite3.connect(db) as conn:
        saved = conn.execute("SELECT project_url FROM flow_profiles WHERE profile_id='flow-3'").fetchone()[0]
    assert saved == "https://flow.google.com/project/98765432-dcba"


def test_extension_cannot_save_a_project_for_another_profile(tmp_path):
    client, headers, db = make_client(tmp_path)
    response = client.post("/api/v1/extension/project-detected", headers=headers, json={
        "protocolVersion": 1,
        "profileId": "flow-3",
        "instanceId": "instance-flow-2",
        "projectUrl": "https://flow.google.com/project/98765432-dcba",
    })
    assert response.status_code == 409
    with sqlite3.connect(db) as conn:
        saved = conn.execute("SELECT project_url FROM flow_profiles WHERE profile_id='flow-3'").fetchone()[0]
    assert saved == "https://flow.google.com/project/34567890-abcd"



def test_diagnostic_logs_are_persisted_and_readable_by_desktop(tmp_path):
    client, headers, _ = make_client(tmp_path)
    response = client.post("/api/v1/extension/diagnostics/log", headers=headers, json={
        "source": "FLOW_EXTENSION", "level": "error", "message": "Flow page script failed",
        "profileId": "flow-2", "taskId": "task-2"
    })
    assert response.status_code == 200
    logs = client.get("/api/v1/extension/diagnostics/logs", headers={"origin": "http://127.0.0.1:5173"})
    assert logs.status_code == 200
    assert logs.json()["logs"][-1]["message"] == "Flow page script failed"
    assert logs.json()["logs"][-1]["profile_id"] == "flow-2"


def test_diagnostic_log_ingestion_requires_bridge_secret(tmp_path):
    client, _, _ = make_client(tmp_path)
    response = client.post("/api/v1/extension/diagnostics/log", json={
        "source": "FLOW_EXTENSION", "level": "error", "message": "should be rejected"
    })
    assert response.status_code == 401


def test_worker_cannot_claim_until_its_flow_project_page_is_ready(tmp_path):
    client, headers, db = make_client(tmp_path)
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE extension_instances SET project_ready=0,ready_project_url=NULL WHERE profile_id='flow-1'")
    response = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["task"] is None
    assert response.json()["waitingForProjectPage"] is True


def test_worker_only_claims_task_for_its_detected_project(tmp_path):
    client, headers, db = make_client(tmp_path)
    client.post("/api/v1/extension/dispatch/job-a", headers=headers)
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE extension_instances SET ready_project_url='https://flow.google.com/project/not-the-assigned-project' WHERE profile_id='flow-1'")
    response = client.get(
        "/api/v1/extension/next-task?profile_id=flow-1&instance_id=instance-flow-1", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["task"] is None
    assert response.json()["waitingForProjectPage"] is True
