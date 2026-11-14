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



# --- AI Director / Prompt Studio ---
DEFAULT_STYLE_BIBLE = """Premium photorealistic fruit-cutting ASMR. Macro close-up, locked camera,
vertical 9:16, shallow depth of field, clean dark charcoal or warm neutral surface,
soft directional studio light, natural fruit color and realistic moisture. One continuous
8-second shot: one deliberate controlled knife cut, believable resistance and clean separation.
Intimate natural cutting audio only; no music, speech, text, logos, jump cuts or surreal physics."""
FRUIT_DETAILS = {
    "Mango": "ripe golden mango, natural pores, orange flesh and a visible flat stone",
    "Apple": "crisp red-and-gold apple, taut skin, pale flesh and a small seed chamber",
    "Kiwi": "brown fuzzy kiwi, vivid emerald flesh, pale center and tiny black seeds",
    "Dragon fruit": "magenta dragon fruit with green-tipped scales, white flesh and tiny black seeds",
    "Orange": "textured bright-orange peel, translucent juicy segments and delicate white pith",
}

class StyleBibleRequest(BaseModel):
    content: str = Field(min_length=40, max_length=5000)

class PromptUpdateRequest(BaseModel):
    prompt: str = Field(min_length=40, max_length=5000)

def style_bible(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key='style_bible'").fetchone()
    return row["value"] if row else DEFAULT_STYLE_BIBLE

def ai_provider_config() -> dict[str, str]:
    return {
        "base_url": os.environ.get("ASMR_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "api_key": os.environ.get("ASMR_AI_API_KEY", ""),
        "model": os.environ.get("ASMR_AI_MODEL", ""),
    }

def compose_builtin_prompts(topic: str, bible: str) -> list[dict[str, str]]:
    output = []
    for fruit, detail in FRUIT_DETAILS.items():
        prompt = (
            f"{bible.strip()}\\n\\nSCENE: {topic.strip()}. Feature only {fruit}: {detail}. "
            "Show one fresh fruit on a clean cutting board. A realistic chef knife enters naturally "
            "and makes one slow, controlled continuous cut. The two pieces visibly separate with "
            "physically accurate contact, gravity and texture. End on a still macro view of the "
            "freshly cut surface. No extra fruit, props, hands in unsafe positions, transitions or "
            "camera movement. Vertical 9:16, exactly one standalone 8-second shot."
        )
        output.append({"subject": fruit, "prompt": prompt})
    return output

def compose_ai_prompts(topic: str, bible: str) -> list[dict[str, str]]:
    cfg = ai_provider_config()
    response = httpx.post(
        f"{cfg['base_url']}/chat/completions",
        headers={"Authorization": f"Bearer {cfg['api_key']}"},
        json={"model": cfg["model"], "temperature": 0.65,
              "response_format": {"type": "json_object"},
              "messages": [
                  {"role": "system", "content": "Return only JSON: {prompts:[{subject,prompt}...]}. Exactly five prompts in this order: Mango, Apple, Kiwi, Dragon fruit, Orange. Each prompt is a distinct, standalone, photorealistic vertical 9:16 fruit-cutting ASMR shot lasting 8 seconds. Keep shared camera, lighting, surface and sound style. No speech, music, text, logos or impossible physics."},
                  {"role": "user", "content": f"Topic: {topic}\\nShared style bible:\\n{bible}\\nMake the fruit-specific actions and textures distinct."}
              ]},
        timeout=90.0,
    )
    response.raise_for_status()
    parsed = json.loads(response.json()["choices"][0]["message"]["content"])
    prompts = parsed.get("prompts", [])
    expected = list(FRUIT_DETAILS)
    if len(prompts) != 5:
        raise ValueError("Provider did not return exactly five prompts")
    result = []
    for fruit, item in zip(expected, prompts):
        prompt = item.get("prompt", "").strip()
        if item.get("subject") != fruit or len(prompt) < 40:
            raise ValueError(f"Invalid provider prompt for {fruit}")
        result.append({"subject": fruit, "prompt": prompt})
    return result

@app.get("/api/v1/settings/ai")
def get_ai_settings() -> dict[str, Any]:
    cfg = ai_provider_config()
    return {"configured": bool(cfg["api_key"] and cfg["model"]),
            "model": cfg["model"], "base_url": cfg["base_url"],
            "fallback": "built-in prompt composer"}

@app.get("/api/v1/style-bible")
def get_style_bible() -> dict[str, str]:
    with connect() as conn:
        return {"content": style_bible(conn)}

@app.put("/api/v1/style-bible")
def put_style_bible(request: StyleBibleRequest) -> dict[str, str]:
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings(key,value,updated_at) VALUES('style_bible',?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
            (request.content.strip(), utc_now()),
        )
    return {"content": request.content.strip()}

@app.post("/api/v1/jobs/{job_id}/generate-prompts")
def generate_prompts(job_id: str) -> dict[str, Any]:
    with connect() as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] not in ("draft", "prompts_ready"):
            raise HTTPException(status_code=409, detail="Prompts cannot be regenerated after approval")
        cfg = ai_provider_config()
        source = "built-in"
        try:
            if cfg["api_key"] and cfg["model"]:
                prompts = compose_ai_prompts(job["topic"], style_bible(conn))
                source = "AI provider"
            else:
                prompts = compose_builtin_prompts(job["topic"], style_bible(conn))
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=502, detail=f"AI provider failed; existing prompts were not changed: {str(exc)[:200]}")
        for item in prompts:
            conn.execute("UPDATE clips SET prompt=?,status='prompt_ready' WHERE job_id=? AND subject=?",
                         (item["prompt"], job_id, item["subject"]))
        conn.execute("UPDATE jobs SET status='prompts_ready',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, f"Five prompts generated with {source}", utc_now()))
        return {"job": serialize_job(conn, job_id), "source": source}

@app.patch("/api/v1/jobs/{job_id}/clips/{clip_id}/prompt")
def edit_prompt(job_id: str, clip_id: str, request: PromptUpdateRequest) -> dict[str, Any]:
    with connect() as conn:
        job = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] not in ("draft", "prompts_ready"):
            raise HTTPException(status_code=409, detail="Approved prompts are locked")
        cur = conn.execute("UPDATE clips SET prompt=?,status='prompt_ready' WHERE id=? AND job_id=?",
                           (request.prompt.strip(), clip_id, job_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Clip not found")
        conn.execute("UPDATE jobs SET status='prompts_ready',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, f"Prompt edited for clip {clip_id}", utc_now()))
        return {"job": serialize_job(conn, job_id)}

@app.post("/api/v1/jobs/{job_id}/approve-prompts")
def approve_prompts(job_id: str) -> dict[str, Any]:
    with connect() as conn:
        job = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        count = conn.execute("SELECT COUNT(*) AS n FROM clips WHERE job_id=? AND status='prompt_ready' AND length(prompt)>=40",
                             (job_id,)).fetchone()["n"]
        if count != 5:
            raise HTTPException(status_code=409, detail="All five prompts must be generated and reviewed first")
        conn.execute("UPDATE jobs SET status='prompts_approved',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, "Five fruit prompts approved; Flow automation is next", utc_now()))
        return {"job": serialize_job(conn, job_id)}
\n\nif __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=True)