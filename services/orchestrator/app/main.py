from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("ASMR_FACTORY_DATA", APP_DIR.parent / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "asmr_factory.sqlite3"

app = FastAPI(title="ASMR Factory Local Orchestrator", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "file://"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

FRUIT_SUBJECTS = ["Mango", "Apple", "Kiwi", "Dragon fruit", "Orange"]


class CreateJobRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=120)
    theme: str = "fruits"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            theme TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clips (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            subject TEXT NOT NULL,
            prompt TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            clip_order INTEGER NOT NULL,
            UNIQUE(job_id, clip_order)
        );
        CREATE TABLE IF NOT EXISTS job_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            event TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """)


def serialize_job(conn: sqlite3.Connection, job_id: str) -> dict[str, Any]:
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    clips = conn.execute(
        "SELECT id, subject, prompt, status, clip_order AS 'order' FROM clips WHERE job_id = ? ORDER BY clip_order",
        (job_id,),
    ).fetchall()
    result = dict(job)
    result["clips"] = [dict(row) for row in clips]
    return result


def safe_topic_slug(topic: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")
    return slug[:60] or "untitled"


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "asmr-factory-orchestrator", "database": "sqlite"}


@app.get("/api/v1/jobs")
def list_jobs() -> dict[str, list[dict[str, Any]]]:
    with connect() as conn:
        rows = conn.execute("SELECT id FROM jobs ORDER BY created_at DESC").fetchall()
        return {"jobs": [serialize_job(conn, row["id"]) for row in rows]}


@app.post("/api/v1/jobs")
def create_job(request: CreateJobRequest) -> dict[str, Any]:
    topic = request.topic.strip()
    if not topic:
        raise HTTPException(status_code=422, detail="Topic cannot be empty")
    if request.theme.lower() != "fruits":
        raise HTTPException(status_code=422, detail="Only the Fruits theme is enabled in the first release")

    job_id = str(uuid.uuid4())
    now = utc_now()
    with connect() as conn:
        conn.execute(
            "INSERT INTO jobs (id, topic, theme, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (job_id, topic, "fruits", "draft", now, now),
        )
        for index, subject in enumerate(FRUIT_SUBJECTS, start=1):
            clip_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO clips (id, job_id, subject, prompt, status, clip_order) VALUES (?, ?, ?, '', 'planned', ?)",
                (clip_id, job_id, subject, index),
            )
        conn.execute(
            "INSERT INTO job_events (job_id, event, created_at) VALUES (?, ?, ?)",
            (job_id, "Draft job created with five planned fruit clips", now),
        )
        job = serialize_job(conn, job_id)
    return {"job": job}


@app.get("/api/v1/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with connect() as conn:
        return {"job": serialize_job(conn, job_id)}


@app.post("/api/v1/jobs/{job_id}/approve")
def approve_job(job_id: str) -> dict[str, Any]:
    now = utc_now()
    with connect() as conn:
        job = conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only draft jobs can be approved")
        clip_count = conn.execute("SELECT COUNT(*) AS n FROM clips WHERE job_id = ?", (job_id,)).fetchone()["n"]
        if clip_count != 5:
            raise HTTPException(status_code=409, detail="A Fruits job must contain exactly five clip tasks")
        conn.execute("UPDATE jobs SET status = 'approved', updated_at = ? WHERE id = ?", (now, job_id))
        conn.execute(
            "INSERT INTO job_events (job_id, event, created_at) VALUES (?, ?, ?)",
            (job_id, "Placeholder five-clip plan approved; generation is not connected", now),
        )
        return {"job": serialize_job(conn, job_id)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=True)