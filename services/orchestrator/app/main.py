from __future__ import annotations

import json
import os
import re
import sqlite3
import httpx
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.flow_browser import FlowProfileManager, PROFILE_IDS, validate_flow_project_url
from app.extension_bridge import create_extension_router

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("ASMR_FACTORY_DATA", APP_DIR.parent / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "asmr_factory.sqlite3"
FLOW_MANAGER = FlowProfileManager(DATA_DIR / "chrome-profiles")

app = FastAPI(title="ASMR Factory Local Orchestrator", version="0.1.0")
app.include_router(create_extension_router(DB_PATH, DATA_DIR))
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "file://", "null"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-ASMR-Bridge-Token"],
)

THEME_SUBJECTS = {
    "fruits": ["Watermelon", "Kiwi", "Orange", "Pineapple", "Strawberry"],
    "soaps": ["Rose soap", "Transparent soap", "Rainbow soap", "Marble soap", "Glitter soap"],
    "clay": ["Red clay", "Blue clay", "Rainbow clay", "Pastel clay", "Metallic clay"],
    "kinetic_sand": ["Golden kinetic sand", "Blue kinetic sand", "Pink kinetic sand", "Rainbow kinetic sand", "Layered kinetic sand"],
    "slime": ["Clear slime", "Crunchy slime", "Glossy slime", "Glitter slime", "Fluffy slime"],
    "satisfying_objects": ["Jelly", "Wax", "Soft foam", "Coloured blocks", "Sensory material"],
    "mixed_asmr": ["Layered sensory block", "Jelly-filled object", "Soft wax object", "Foam-and-clay object", "Multi-texture sensory object"],
}
THEME_LABELS = {"fruits":"Fruits","soaps":"Soaps","clay":"Clay","kinetic_sand":"Kinetic Sand","slime":"Slime","satisfying_objects":"Satisfying Objects / Materials","mixed_asmr":"Mixed ASMR"}
THEME_DIRECTIONS = {
    "fruits":"Photorealistic fresh fruit cutting with accurate peel, flesh, seeds and juice.",
    "soaps":"Photorealistic soap cutting; preserve translucency, colour, layered or marbled patterns and crisp shavings.",
    "clay":"Photorealistic modelling-clay cutting; preserve dense smooth texture, clean edges, layered colours and realistic deformation.",
    "kinetic_sand":"Photorealistic kinetic sand slicing; show cohesive grains, clean cross-sections, compacted layers and granular crumble.",
    "slime":"Photorealistic slime slicing and pressing; show the named slime texture, plausible stretch, folds, bubbles and material response.",
    "satisfying_objects":"Photorealistic satisfying material cutting; emphasize the named material's distinctive texture and believable interaction.",
    "mixed_asmr":"A coordinated mixed-material ASMR experiment; each clip has a distinct named material/object combination with plausible physical interactions.",
}

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
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS job_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            event TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS flow_profiles (
            profile_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            project_url TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );
        """)
        for index, profile_id in enumerate(PROFILE_IDS, start=1):
            conn.execute(
                "INSERT OR IGNORE INTO flow_profiles(profile_id, display_name, project_url, updated_at) VALUES(?,?,?,?)",
                (profile_id, f"Google Flow Account {index}", "", utc_now()),
            )


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
    theme = request.theme.strip().lower()
    if not topic:
        raise HTTPException(status_code=422, detail="Topic cannot be empty")
    if theme not in THEME_SUBJECTS:
        raise HTTPException(status_code=422, detail="Choose one of the seven supported ASMR styles")
    job_id, now = str(uuid.uuid4()), utc_now()
    with connect() as conn:
        conn.execute("INSERT INTO jobs (id, topic, theme, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (job_id, topic, theme, "draft", now, now))
        for index, subject in enumerate(THEME_SUBJECTS[theme], start=1):
            conn.execute("INSERT INTO clips (id, job_id, subject, prompt, status, clip_order) VALUES (?, ?, ?, '', 'planned', ?)", (str(uuid.uuid4()), job_id, subject, index))
        conn.execute("INSERT INTO job_events (job_id, event, created_at) VALUES (?, ?, ?)", (job_id, "Draft " + THEME_LABELS[theme] + " job created with five planned clip tasks", now))
        return {"job": serialize_job(conn, job_id)}

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
class StyleBibleRequest(BaseModel):
    content: str = Field(min_length=40, max_length=5000)

class PromptUpdateRequest(BaseModel):
    prompt: str = Field(min_length=40, max_length=5000)

def style_bible(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key='style_bible'").fetchone()
    return row["value"] if row else DEFAULT_STYLE_BIBLE

def ai_provider_config() -> dict[str, str]:
    return {"base_url": os.environ.get("ASMR_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/"), "api_key": os.environ.get("ASMR_AI_API_KEY", ""), "model": os.environ.get("ASMR_AI_MODEL", "")}

def compose_builtin_prompts(topic: str, theme: str, bible: str) -> list[dict[str, str]]:
    output = []
    for subject in THEME_SUBJECTS[theme]:
        prompt = (f"{bible.strip()}\n\\nSTYLE: {THEME_DIRECTIONS[theme]}\\nSCENE: {topic.strip()}. FEATURED SUBJECT: {subject}. "
                  "Create a distinctive material-specific cutting or satisfying action, visually different from the other four clips. "
                  "Use one continuous controlled action with realistic contact, resistance, gravity and texture. "
                  "Vertical 9:16, one standalone 8-second shot. No speech, music, text, logos, unsafe hand placement or impossible physics.")
        output.append({"subject": subject, "prompt": prompt})
    return output

def compose_ai_prompts(topic: str, theme: str, bible: str) -> list[dict[str, str]]:
    cfg = ai_provider_config()
    expected = THEME_SUBJECTS[theme]
    system = (f"Return only JSON {{prompts:[{{subject,prompt}}...]}}. Exactly five prompts in this subject order: {expected}. "
              f"Style: {THEME_LABELS[theme]}. {THEME_DIRECTIONS[theme]} Each prompt is a distinct vertical 9:16, 8-second ASMR clip. "
              "Keep camera, lighting, surface and audio identity consistent. No speech, music, text, logos or impossible physics.")
    response = httpx.post(f"{cfg['base_url']}/chat/completions", headers={"Authorization": f"Bearer {cfg['api_key']}"},
        json={"model": cfg["model"], "temperature": 0.65, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": f"Topic: {topic}\\nShared Style Bible:\\n{bible}\\nMake the five subject actions and textures meaningfully distinct."}]}, timeout=90.0)
    response.raise_for_status()
    prompts = json.loads(response.json()["choices"][0]["message"]["content"]).get("prompts", [])
    if len(prompts) != 5:
        raise ValueError("Provider did not return exactly five prompts")
    result = []
    for subject, item in zip(expected, prompts):
        prompt = item.get("prompt", "").strip()
        if item.get("subject") != subject or len(prompt) < 40:
            raise ValueError("Invalid provider prompt for " + subject)
        result.append({"subject": subject, "prompt": prompt})
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
                prompts = compose_ai_prompts(job["topic"], job["theme"], style_bible(conn))
                source = "AI provider"
            else:
                prompts = compose_builtin_prompts(job["topic"], job["theme"], style_bible(conn))
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=502, detail=f"AI provider failed; existing prompts were not changed: {str(exc)[:200]}")
        for item in prompts:
            conn.execute("UPDATE clips SET prompt=?,status='prompt_ready' WHERE job_id=? AND subject=?",
                         (item["prompt"], job_id, item["subject"]))
        conn.execute("UPDATE jobs SET status='prompts_ready',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, "Five " + THEME_LABELS[job["theme"]] + " prompts generated with " + source, utc_now()))
        return {"job": serialize_job(conn, job_id), "source": source}

@app.patch("/api/v1/jobs/{job_id}/clips/{clip_id}/prompt")
def edit_prompt(job_id: str, clip_id: str, request: PromptUpdateRequest) -> dict[str, Any]:
    with connect() as conn:
        job = conn.execute("SELECT status, theme FROM jobs WHERE id=?", (job_id,)).fetchone()
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
        job = conn.execute("SELECT status, theme FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        count = conn.execute("SELECT COUNT(*) AS n FROM clips WHERE job_id=? AND status='prompt_ready' AND length(prompt)>=40",
                             (job_id,)).fetchone()["n"]
        if count != 5:
            raise HTTPException(status_code=409, detail="All five prompts must be generated and reviewed first")
        conn.execute("UPDATE jobs SET status='prompts_approved',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, "Five " + THEME_LABELS[job["theme"]] + " prompts approved; Flow automation is next", utc_now()))
        return {"job": serialize_job(conn, job_id)}


class FlowProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    project_url: str = Field(min_length=1, max_length=500)


@app.get("/api/v1/flow/profiles")
def list_flow_profiles() -> dict[str, Any]:
    with connect() as conn:
        rows = conn.execute("SELECT profile_id, display_name, project_url, updated_at FROM flow_profiles ORDER BY profile_id").fetchall()
        profiles = []
        for row in rows:
            item = dict(row)
            item["browser_open"] = FLOW_MANAGER.status(item["profile_id"])["browser_open"]
            item["configured"] = bool(item["project_url"])
            profiles.append(item)
        return {"profiles": profiles}


@app.put("/api/v1/flow/profiles/{profile_id}")
def save_flow_profile(profile_id: str, request: FlowProfileRequest) -> dict[str, Any]:
    if profile_id not in PROFILE_IDS:
        raise HTTPException(status_code=404, detail="Unknown Flow profile")
    try:
        project_url = validate_flow_project_url(request.project_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    display_name = request.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="Account label cannot be empty")
    with connect() as conn:
        conn.execute(
            "UPDATE flow_profiles SET display_name=?, project_url=?, updated_at=? WHERE profile_id=?",
            (display_name, project_url, utc_now(), profile_id),
        )
        row = conn.execute("SELECT profile_id, display_name, project_url, updated_at FROM flow_profiles WHERE profile_id=?", (profile_id,)).fetchone()
        return {"profile": {**dict(row), "configured": True, "browser_open": FLOW_MANAGER.status(profile_id)["browser_open"]}}


@app.post("/api/v1/flow/profiles/{profile_id}/open")
async def open_flow_profile(profile_id: str) -> dict[str, Any]:
    if profile_id not in PROFILE_IDS:
        raise HTTPException(status_code=404, detail="Unknown Flow profile")
    with connect() as conn:
        row = conn.execute("SELECT project_url FROM flow_profiles WHERE profile_id=?", (profile_id,)).fetchone()
    if row is None or not row["project_url"]:
        raise HTTPException(status_code=409, detail="Save a Google Flow project URL for this account first")
    try:
        result = await FLOW_MANAGER.open_profile(profile_id, row["project_url"])
        return {"profile": result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/v1/flow/automation/status")
def flow_automation_status() -> dict[str, Any]:
    with connect() as conn:
        try:
            instances = conn.execute(
                "SELECT profile_id, instance_id, extension_version, last_seen FROM extension_instances ORDER BY profile_id"
            ).fetchall()
            tasks = conn.execute(
                """SELECT task_id, job_id, clip_id, profile_id, status, updated_at, last_error, download_path
                   FROM extension_tasks ORDER BY created_at DESC LIMIT 25"""
            ).fetchall()
        except sqlite3.OperationalError:
            instances, tasks = [], []
        registered = {row["profile_id"]: dict(row) for row in instances}
        profiles = []
        for profile_id in PROFILE_IDS:
            item = registered.get(profile_id)
            last_seen = item["last_seen"] if item else None
            try:
                connected = bool(last_seen and datetime.fromisoformat(last_seen) >= datetime.now(timezone.utc) - timedelta(minutes=2))
            except ValueError:
                connected = False
            profiles.append({
                "profile_id": profile_id,
                "registered": connected,
                "last_seen": last_seen,
                "extension_version": item["extension_version"] if item else None,
            })
        return {"profiles": profiles, "registered_count": sum(p["registered"] for p in profiles),
                "tasks": [dict(row) for row in tasks]}


@app.on_event("shutdown")
async def shutdown_flow_profiles() -> None:
    await FLOW_MANAGER.close_all()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=True)