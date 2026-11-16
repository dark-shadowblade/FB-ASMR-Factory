from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from .workflow_state import InvalidTransition, validate_transition

PROFILE_IDS = tuple(f"flow-{i}" for i in range(1, 6))


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RegisterRequest(BaseModel):
    protocolVersion: int = 1
    profileId: str
    instanceId: str = Field(min_length=8, max_length=100)
    extensionVersion: str = Field(min_length=1, max_length=30)


class EventRequest(BaseModel):
    protocolVersion: int = 1
    messageId: str = Field(min_length=8, max_length=100)
    type: str = Field(min_length=2, max_length=60)
    taskId: str
    jobId: str
    clipId: str
    profileId: str
    instanceId: str
    timestamp: str
    payload: dict[str, Any] = {}


class ProjectDetectedRequest(BaseModel):
    protocolVersion: int = 1
    profileId: str
    instanceId: str = Field(min_length=8, max_length=100)
    projectUrl: str = Field(min_length=20, max_length=500)
    projectTitle: str = Field(default="", max_length=200)


class CommandRequest(BaseModel):
    command: str


class RetryTaskRequest(BaseModel):
    profileId: str | None = None


def create_extension_router(db_path: Path, data_dir: Path) -> APIRouter:
    router = APIRouter(prefix="/api/v1/extension", tags=["chrome-extension"])
    token_path = Path(data_dir) / "extension-bridge.token"
    token_path.parent.mkdir(parents=True, exist_ok=True)
    if not token_path.exists():
        token_path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        try:
            token_path.chmod(0o600)
        except OSError:
            pass
    bridge_token = token_path.read_text(encoding="utf-8").strip()

    def connect() -> sqlite3.Connection:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def require_token(value: str) -> None:
        if not value or not secrets.compare_digest(value, bridge_token):
            raise HTTPException(status_code=401, detail="Invalid local extension bridge token")

    def require_desktop_origin(value: str) -> None:
        if value not in ("http://127.0.0.1:5173", "file://", "null"):
            raise HTTPException(status_code=403, detail="Desktop-only endpoint")

    def init_tables() -> None:
        with connect() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS extension_tasks (
              task_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, clip_id TEXT NOT NULL UNIQUE,
              profile_id TEXT NOT NULL, project_url TEXT NOT NULL, prompt TEXT NOT NULL,
              settings_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL, last_error TEXT, download_path TEXT,
              UNIQUE(task_id, profile_id)
            );
            CREATE INDEX IF NOT EXISTS idx_extension_tasks_profile_status
              ON extension_tasks(profile_id, status, created_at);
            CREATE TABLE IF NOT EXISTS extension_instances (
              profile_id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, extension_version TEXT NOT NULL,
              last_seen TEXT NOT NULL, project_ready INTEGER NOT NULL DEFAULT 0,
              ready_project_url TEXT
            );
            CREATE TABLE IF NOT EXISTS extension_events (
              message_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, job_id TEXT NOT NULL,
              clip_id TEXT NOT NULL, profile_id TEXT NOT NULL, event_type TEXT NOT NULL,
              payload_json TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS extension_commands (
              id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile_id TEXT NOT NULL,
              command TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
            );
            """)
    init_tables()
    with connect() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(extension_instances)").fetchall()}
        if "project_ready" not in columns:
            conn.execute("ALTER TABLE extension_instances ADD COLUMN project_ready INTEGER NOT NULL DEFAULT 0")
        if "ready_project_url" not in columns:
            conn.execute("ALTER TABLE extension_instances ADD COLUMN ready_project_url TEXT")

    with connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS diagnostic_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, level TEXT NOT NULL,
          message TEXT NOT NULL, profile_id TEXT, task_id TEXT, created_at TEXT NOT NULL
        )""")

    @router.post("/diagnostics/log")
    def add_diagnostic_log(payload: dict[str, Any], x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        source = str(payload.get("source", "EXTENSION"))[:30]
        level = str(payload.get("level", "info")).lower()
        if level not in ("debug", "info", "warn", "error"):
            raise HTTPException(status_code=422, detail="Invalid log level")
        message = str(payload.get("message", ""))[:4000]
        if not message:
            raise HTTPException(status_code=422, detail="Log message is required")
        profile_id = str(payload.get("profileId") or "")[:20] or None
        task_id = str(payload.get("taskId") or "")[:100] or None
        with connect() as conn:
            conn.execute("INSERT INTO diagnostic_logs(source,level,message,profile_id,task_id,created_at) VALUES(?,?,?,?,?,?)",
                         (source, level, message, profile_id, task_id, now()))
            conn.execute("DELETE FROM diagnostic_logs WHERE id NOT IN (SELECT id FROM diagnostic_logs ORDER BY id DESC LIMIT 2000)")
        return {"accepted": True}

    @router.get("/diagnostics/logs")
    def get_diagnostic_logs(limit: int = Query(default=300, ge=1, le=1000), origin: str = Header(default="")):
        require_desktop_origin(origin)
        with connect() as conn:
            rows = conn.execute("SELECT id,source,level,message,profile_id,task_id,created_at FROM diagnostic_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return {"logs": [dict(row) for row in reversed(rows)]}

    @router.get("/health")
    def bridge_health(x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        return {"status": "ok", "protocolVersion": 1, "profiles": list(PROFILE_IDS)}

    @router.post("/register")
    def register(request: RegisterRequest, x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        if request.protocolVersion != 1 or request.profileId not in PROFILE_IDS:
            raise HTTPException(status_code=422, detail="Unsupported protocol version or profile ID")
        with connect() as conn:
            conn.execute("""INSERT INTO extension_instances(profile_id,instance_id,extension_version,last_seen,project_ready,ready_project_url)
              VALUES(?,?,?,?,0,NULL) ON CONFLICT(profile_id) DO UPDATE SET
              instance_id=excluded.instance_id, extension_version=excluded.extension_version,last_seen=excluded.last_seen,
              project_ready=CASE WHEN extension_instances.instance_id=excluded.instance_id THEN extension_instances.project_ready ELSE 0 END,
              ready_project_url=CASE WHEN extension_instances.instance_id=excluded.instance_id THEN extension_instances.ready_project_url ELSE NULL END""",
              (request.profileId, request.instanceId, request.extensionVersion, now()))
        return {"registered": True, "profileId": request.profileId}

    @router.post("/project-detected")
    def project_detected(request: ProjectDetectedRequest, x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        if request.protocolVersion != 1 or request.profileId not in PROFILE_IDS:
            raise HTTPException(status_code=422, detail="Unsupported protocol version or profile ID")
        from .flow_browser import validate_flow_project_url
        try:
            project_url = validate_flow_project_url(request.projectUrl)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        with connect() as conn:
            registered = conn.execute("SELECT instance_id FROM extension_instances WHERE profile_id=?", (request.profileId,)).fetchone()
            if registered is None or registered["instance_id"] != request.instanceId:
                raise HTTPException(status_code=409, detail="Extension instance/profile pairing mismatch")
            conn.execute("UPDATE flow_profiles SET project_url=?,updated_at=? WHERE profile_id=?",
                         (project_url, now(), request.profileId))
            conn.execute("UPDATE extension_instances SET project_ready=1,ready_project_url=? WHERE profile_id=? AND instance_id=?",
                         (project_url, request.profileId, request.instanceId))
        return {"saved": True, "profileId": request.profileId, "projectUrl": project_url}


    @router.get("/desktop-config")
    def desktop_config(origin: str = Header(default="")):
        require_desktop_origin(origin)
        with connect() as conn:
            rows = conn.execute("SELECT profile_id,extension_version,last_seen FROM extension_instances").fetchall()
        by_id = {r["profile_id"]: dict(r) for r in rows}
        profiles = []
        for profile_id in PROFILE_IDS:
            row = by_id.get(profile_id)
            online = False
            if row:
                try:
                    online = (datetime.now(timezone.utc) - datetime.fromisoformat(row["last_seen"])).total_seconds() <= 120
                except (ValueError, TypeError):
                    online = False
            profiles.append({"profileId": profile_id, "connected": online,
                             "extensionVersion": row["extension_version"] if row else None,
                             "lastSeen": row["last_seen"] if row else None})
        return {"bridgeToken": bridge_token, "tokenPath": str(token_path), "profiles": profiles}

    @router.post("/dispatch/{job_id}")
    def dispatch(job_id: str, x_asmr_bridge_token: str = Header(default=""), origin: str = Header(default="")):
        if x_asmr_bridge_token:
            require_token(x_asmr_bridge_token)
        else:
            require_desktop_origin(origin)
        with connect() as conn:
            job = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            if job["status"] != "prompts_approved":
                raise HTTPException(status_code=409, detail="Approve all five prompts before dispatch")
            clips = conn.execute("SELECT id,prompt,clip_order FROM clips WHERE job_id=? ORDER BY clip_order", (job_id,)).fetchall()
            if len(clips) != 5 or any(len((r["prompt"] or "").strip()) < 40 for r in clips):
                raise HTTPException(status_code=409, detail="Exactly five complete prompts are required")
            profiles = conn.execute("SELECT profile_id,project_url FROM flow_profiles ORDER BY profile_id").fetchall()
            by_id = {r["profile_id"]: r["project_url"] for r in profiles}
            if any(not by_id.get(pid) for pid in PROFILE_IDS):
                raise HTTPException(status_code=409, detail="Configure a Flow project URL for all five profiles before dispatch")
            existing = conn.execute("SELECT status FROM extension_tasks WHERE job_id=?", (job_id,)).fetchall()
            if existing and not all(row["status"] == "superseded" for row in existing):
                raise HTTPException(status_code=409, detail="This job already has a Flow attempt. Retry or supersede it before dispatch.")
            # Do not require all five workers to be online. Tasks remain queued
            # for their matching isolated profile and are claimed on heartbeat.
            settings = {"model": "Veo 3.1 Lite", "resolution": "720p", "durationSeconds": 8, "aspectRatio": "9:16"}
            created = []
            for index, clip in enumerate(clips):
                profile_id = PROFILE_IDS[index]
                task_id = secrets.token_urlsafe(18)
                conn.execute("""INSERT INTO extension_tasks(task_id,job_id,clip_id,profile_id,project_url,prompt,
                  settings_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                  (task_id, job_id, clip["id"], profile_id, by_id[profile_id], clip["prompt"],
                   json.dumps(settings), "queued", now(), now()))
                created.append({"taskId": task_id, "clipId": clip["id"], "profileId": profile_id})
            conn.execute("UPDATE jobs SET status='running',updated_at=? WHERE id=?", (now(), job_id))
            conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                         (job_id, "Queued five isolated Flow tasks; each profile claims independently when online", now()))
            return {"dispatched": len(created), "tasks": created}

    @router.get("/next-task")
    def next_task(profile_id: str = Query(...), instance_id: str = Query(...), x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        if profile_id not in PROFILE_IDS:
            raise HTTPException(status_code=422, detail="Unknown profile ID")
        with connect() as conn:
            registered = conn.execute("SELECT instance_id,project_ready,ready_project_url FROM extension_instances WHERE profile_id=?", (profile_id,)).fetchone()
            if registered is None or registered["instance_id"] != instance_id:
                raise HTTPException(status_code=409, detail="This extension instance is not paired to the selected browser profile")
            if not registered["project_ready"]:
                return {"task": None, "waitingForProjectPage": True}
            row = conn.execute("""SELECT * FROM extension_tasks WHERE profile_id=?
              AND status IN ('queued','leased') ORDER BY created_at LIMIT 1""", (profile_id,)).fetchone()
            if row is None:
                return {"task": None}
            if registered["ready_project_url"] != row["project_url"]:
                return {"task": None, "waitingForProjectPage": True}
            if row["status"] == "queued":
                conn.execute("UPDATE extension_tasks SET status='leased',updated_at=? WHERE task_id=?", (now(), row["task_id"]))
            return {"task": {
              "protocolVersion": 1, "taskId": row["task_id"], "jobId": row["job_id"],
              "clipId": row["clip_id"], "profileId": row["profile_id"], "projectUrl": row["project_url"],
              "prompt": row["prompt"], "settings": json.loads(row["settings_json"]),
              "settingsVerified": False
            }}

    @router.post("/events")
    def receive_event(request: EventRequest, x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        if request.protocolVersion != 1 or request.profileId not in PROFILE_IDS:
            raise HTTPException(status_code=422, detail="Unsupported protocol or profile")
        status_map = {
          "TASK_ACCEPTED": "leased", "PROJECT_PAGE_READY": "project_open",
          "PROMPT_SUBMITTED": "submitted", "SETTINGS_VERIFIED": "settings_verified", "GENERATION_STARTED": "generating",
          "GENERATION_COMPLETED": "generation_completed", "GENERATION_ALREADY_ACTIVE": "generating", "GENERATION_ALREADY_COMPLETE": "generation_completed", "DOWNLOAD_STARTED": "downloading",
          "DOWNLOAD_COMPLETED": "downloaded", "DOWNLOAD_FAILED": "failed", "SESSION_REQUIRED": "needs_login", "PROMPT_ALREADY_PRESENT": "blocked_ui",
          "FLOW_UI_UNVERIFIED": "blocked_ui", "DOWNLOAD_SELECTOR_UNVERIFIED": "blocked_ui", "PROJECT_URL_MISMATCH": "blocked_ui", "SETTINGS_UNVERIFIED": "blocked_settings", "PROMPT_INSERT_FAILED": "failed",
          "TASK_FAILED": "failed", "TASK_PAUSED": "paused", "TASK_RESUMED": "generating", "TASK_CANCELLED": "cancelled"
        }
        with connect() as conn:
            registered = conn.execute("SELECT instance_id FROM extension_instances WHERE profile_id=?", (request.profileId,)).fetchone()
            task = conn.execute("SELECT * FROM extension_tasks WHERE task_id=?", (request.taskId,)).fetchone()
            if registered is None or registered["instance_id"] != request.instanceId:
                raise HTTPException(status_code=409, detail="Extension instance/profile pairing mismatch")
            if task is None or task["profile_id"] != request.profileId or task["job_id"] != request.jobId or task["clip_id"] != request.clipId:
                raise HTTPException(status_code=409, detail="Task/profile/job/clip identity mismatch")
            try:
                conn.execute("""INSERT INTO extension_events(message_id,task_id,job_id,clip_id,profile_id,event_type,payload_json,created_at)
                  VALUES(?,?,?,?,?,?,?,?)""",
                  (request.messageId, request.taskId, request.jobId, request.clipId, request.profileId,
                   request.type, json.dumps(request.payload), now()))
            except sqlite3.IntegrityError:
                return {"accepted": True, "duplicate": True, "status": task["status"]}
            status = status_map.get(request.type, task["status"])
            # Validate the state change before persisting the event. A malformed
            # or out-of-order worker event must not poison the durable task log.
            try:
                validate_transition("task", task["status"], status)
            except InvalidTransition as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            error = str(request.payload.get("reason") or request.payload.get("error") or "")[:500] if request.type in ("TASK_FAILED","DOWNLOAD_FAILED","FLOW_UI_UNVERIFIED","DOWNLOAD_SELECTOR_UNVERIFIED","PROJECT_URL_MISMATCH","SETTINGS_UNVERIFIED","PROMPT_ALREADY_PRESENT") else None
            download = str(request.payload.get("filename", ""))[:1000] if request.type == "DOWNLOAD_COMPLETED" else task["download_path"]
            conn.execute("UPDATE extension_tasks SET status=?,updated_at=?,last_error=COALESCE(?,last_error),download_path=? WHERE task_id=?",
                         (status, now(), error, download, request.taskId))
            if request.type == "DOWNLOAD_COMPLETED":
                conn.execute("UPDATE clips SET status='downloaded' WHERE id=? AND job_id=?",
                             (request.clipId, request.jobId))
                # The downloaded clip is now safely recorded. Remove the active
                # prompt payload from the worker queue while retaining task/event
                # history and the clip/job records for audit and assembly.
                conn.execute(
                    "UPDATE extension_tasks SET prompt='' WHERE task_id=? AND status='downloaded'",
                    (request.taskId,),
                )
            elif request.type in ("DOWNLOAD_FAILED", "TASK_FAILED", "PROMPT_INSERT_FAILED"):
                conn.execute("UPDATE clips SET status='failed' WHERE id=? AND job_id=?",
                             (request.clipId, request.jobId))
            conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                         (request.jobId, f"Flow {request.profileId}: {request.type}", now()))
            return {"accepted": True, "duplicate": False, "status": status}


    @router.post("/tasks/{task_id}/retry")
    def retry_task(task_id: str, request: RetryTaskRequest, x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        with connect() as conn:
            task = conn.execute("SELECT * FROM extension_tasks WHERE task_id=?", (task_id,)).fetchone()
            if task is None:
                raise HTTPException(status_code=404, detail="Task not found")
            if task["status"] not in ("failed", "blocked_ui", "blocked_settings", "needs_login", "cancelled"):
                raise HTTPException(status_code=409, detail="Only failed or blocked tasks can be retried")
            profile_id = request.profileId or task["profile_id"]
            if profile_id not in PROFILE_IDS:
                raise HTTPException(status_code=422, detail="Unknown Flow profile")
            profile = conn.execute("SELECT project_url FROM flow_profiles WHERE profile_id=?", (profile_id,)).fetchone()
            if profile is None or not profile["project_url"]:
                raise HTTPException(status_code=409, detail="Save a Flow project URL for the retry profile first")
            instance = conn.execute("SELECT last_seen FROM extension_instances WHERE profile_id=?", (profile_id,)).fetchone()
            try:
                online = bool(instance and datetime.now(timezone.utc) - datetime.fromisoformat(instance["last_seen"]) <= timedelta(minutes=2))
            except (TypeError, ValueError):
                online = False
            if not online:
                raise HTTPException(status_code=409, detail=f"Flow worker {profile_id} is not connected")
            busy = conn.execute(
                """SELECT task_id FROM extension_tasks WHERE profile_id=? AND task_id<>?
                   AND status IN ('queued','leased','project_open','submitted','generating','generation_completed',
                                  'downloading','settings_verified','paused','needs_login','blocked_ui','blocked_settings')""",
                (profile_id, task_id),
            ).fetchone()
            if busy:
                raise HTTPException(status_code=409, detail=f"Flow worker {profile_id} already has an active task")
            conn.execute(
                """UPDATE extension_tasks SET profile_id=?,project_url=?,status='queued',
                   updated_at=?,last_error=NULL,download_path=NULL WHERE task_id=?""",
                (profile_id, profile["project_url"], now(), task_id),
            )
            conn.execute("DELETE FROM extension_commands WHERE task_id=? AND status='pending'", (task_id,))
            conn.execute("UPDATE clips SET status='planned' WHERE id=? AND job_id=?",
                         (task["clip_id"], task["job_id"]))
            conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                         (task["job_id"], f"Flow task retry queued on {profile_id}", now()))
            return {"queued": True, "taskId": task_id, "profileId": profile_id}

    @router.post("/tasks/{task_id}/command")
    def enqueue_command(task_id: str, request: CommandRequest, x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        command = request.command.upper()
        if command not in ("OPEN_PROJECT", "SUBMIT_PROMPT", "CHECK_STATUS", "DOWNLOAD_VIDEO", "PAUSE", "RESUME", "CANCEL"):
            raise HTTPException(status_code=422, detail="Unsupported extension command")
        with connect() as conn:
            task = conn.execute("SELECT profile_id FROM extension_tasks WHERE task_id=?", (task_id,)).fetchone()
            if task is None:
                raise HTTPException(status_code=404, detail="Task not found")
            conn.execute("INSERT INTO extension_commands(task_id,profile_id,command,created_at) VALUES(?,?,?,?)",
                         (task_id, task["profile_id"], command, now()))
            return {"queued": True, "taskId": task_id, "profileId": task["profile_id"], "command": command}

    @router.get("/commands")
    def get_commands(profile_id: str = Query(...), task_id: str = Query(...), instance_id: str = Query(...), x_asmr_bridge_token: str = Header(default="")):
        require_token(x_asmr_bridge_token)
        if profile_id not in PROFILE_IDS:
            raise HTTPException(status_code=422, detail="Unknown profile ID")
        with connect() as conn:
            registered = conn.execute("SELECT instance_id FROM extension_instances WHERE profile_id=?", (profile_id,)).fetchone()
            if registered is None or registered["instance_id"] != instance_id:
                raise HTTPException(status_code=409, detail="This extension instance is not paired to the selected browser profile")
            rows = conn.execute("SELECT id,task_id,command FROM extension_commands WHERE profile_id=? AND task_id=? AND status='pending' ORDER BY id LIMIT 10", (profile_id, task_id)).fetchall()
            ids = [r["id"] for r in rows]
            if ids:
                conn.executemany("UPDATE extension_commands SET status='delivered' WHERE id=?", [(i,) for i in ids])
            return {"commands": [dict(r) for r in rows]}

    return router
