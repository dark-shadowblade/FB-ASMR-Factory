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
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.flow_browser import FlowProfileManager, PROFILE_IDS, validate_flow_project_url
from app.extension_bridge import create_extension_router
from app.media_pipeline import MediaPipelineError, assemble_five_clips
from app import media_pipeline

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
    allow_origin_regex=r"chrome-extension://[a-p]{32}",
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
        CREATE TABLE IF NOT EXISTS job_outputs (
            job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
            output_path TEXT NOT NULL,
            duration_seconds REAL NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            size_bytes INTEGER NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL
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
    artifact = conn.execute("SELECT output_path,duration_seconds,width,height,size_bytes,created_at FROM job_outputs WHERE job_id=?", (job_id,)).fetchone()
    result["final_video"] = dict(artifact) if artifact else None
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



@app.post("/api/v1/jobs/{job_id}/assemble")
def assemble_job(job_id: str) -> dict[str, Any]:
    """Validate the five browser downloads and create one verified vertical MP4."""
    with connect() as conn:
        job = conn.execute("SELECT topic,theme FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        tasks = conn.execute(
            """SELECT t.clip_id,t.status,t.download_path,c.clip_order
               FROM extension_tasks t JOIN clips c ON c.id=t.clip_id
               WHERE t.job_id=? ORDER BY c.clip_order""", (job_id,)
        ).fetchall()
        if len(tasks) != 5:
            raise HTTPException(status_code=409, detail="This job does not have exactly five Flow tasks")
        incomplete = [row["clip_id"] for row in tasks
                      if row["status"] != "downloaded" or not row["download_path"]]
        if incomplete:
            raise HTTPException(status_code=409, detail="Five completed downloads are required before assembly")
        existing = conn.execute("SELECT * FROM job_outputs WHERE job_id=?", (job_id,)).fetchone()
        if existing:
            return {"output": dict(existing), "already_assembled": True}

    downloads_root = Path(os.environ.get("ASMR_FACTORY_DOWNLOADS_DIR", str(Path.home() / "Downloads"))).expanduser().resolve()
    clip_paths: list[Path] = []
    for row in tasks:
        candidate = Path(row["download_path"]).expanduser()
        if not candidate.is_absolute():
            raise HTTPException(status_code=422, detail=f"Chrome did not report an absolute download path for {row['clip_id']}")
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(downloads_root)
        except (OSError, ValueError):
            raise HTTPException(status_code=403, detail=f"Download for {row['clip_id']} is missing or outside the configured Downloads folder")
        if resolved.suffix.lower() != ".mp4" or not resolved.is_file():
            raise HTTPException(status_code=422, detail=f"Download for {row['clip_id']} is not an MP4 file")
        clip_paths.append(resolved)

    output_dir = DATA_DIR / "outputs" / safe_topic_slug(job["topic"]) / job_id
    output_path = output_dir / "final.mp4"
    try:
        result = media_pipeline.assemble_five_clips(clip_paths, output_path)
    except media_pipeline.MediaPipelineError as exc:
        with connect() as conn:
            conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                         (job_id, "Media assembly failed: " + str(exc)[:400], utc_now()))
        raise HTTPException(status_code=422, detail=str(exc))
    metadata = {key: value for key, value in result.items() if key != "output"}
    with connect() as conn:
        conn.execute(
            """INSERT INTO job_outputs(job_id,output_path,duration_seconds,width,height,size_bytes,metadata_json,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (job_id, result["output"], result["duration_seconds"], result["width"], result["height"],
             result["size_bytes"], json.dumps(metadata), utc_now())
        )
        conn.execute("UPDATE clips SET status='ready' WHERE job_id=?", (job_id,))
        conn.execute("UPDATE jobs SET status='media_ready',updated_at=? WHERE id=?", (utc_now(), job_id))
        conn.execute("INSERT INTO job_events(job_id,event,created_at) VALUES(?,?,?)",
                     (job_id, "Five source clips validated and assembled into " + result["output"], utc_now()))
        return {"output": result, "already_assembled": False}


@app.get("/api/v1/jobs/{job_id}/output")
def get_job_output(job_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM job_outputs WHERE job_id=?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="No assembled output exists for this job")
        output = dict(row)
        output["metadata"] = json.loads(output.pop("metadata_json"))
        return {"output": output}


@app.get("/api/v1/jobs/{job_id}/output/file")
def download_job_output(job_id: str):
    with connect() as conn:
        row = conn.execute("SELECT output_path FROM job_outputs WHERE job_id=?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="No assembled output exists for this job")
        path = Path(row["output_path"]).resolve()
    if not path.is_file() or path.suffix.lower() != ".mp4":
        raise HTTPException(status_code=404, detail="Assembled MP4 file is missing")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@app.get("/api/v1/library")
def list_video_library() -> dict[str, list[dict[str, Any]]]:
    with connect() as conn:
        rows = conn.execute(
            """SELECT o.job_id,o.output_path,o.duration_seconds,o.width,o.height,o.size_bytes,o.created_at,
                      j.topic,j.theme,j.status
               FROM job_outputs o JOIN jobs j ON j.id=o.job_id ORDER BY o.created_at DESC"""
        ).fetchall()
        return {"videos": [dict(row) for row in rows]}

@app.on_event("shutdown")
async def shutdown_flow_profiles() -> None:
    await FLOW_MANAGER.close_all()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=True)