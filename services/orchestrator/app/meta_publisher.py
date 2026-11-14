from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

GRAPH_VERSION = os.environ.get("ASMR_META_GRAPH_VERSION", "v27.0")
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"


class MetaPublishError(RuntimeError):
    pass


def meta_config() -> dict[str, str]:
    return {
        "page_id": os.environ.get("ASMR_META_PAGE_ID", "").strip(),
        "page_access_token": os.environ.get("ASMR_META_PAGE_ACCESS_TOKEN", "").strip(),
    }


def _check_response(response: httpx.Response, action: str) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as exc:
        raise MetaPublishError(f"Meta {action} returned a non-JSON response (HTTP {response.status_code})") from exc
    if response.is_error or (isinstance(data, dict) and data.get("error")):
        error = data.get("error", {}) if isinstance(data, dict) else {}
        message = error.get("message", "Unknown Graph API error") if isinstance(error, dict) else str(error)
        code = error.get("code") if isinstance(error, dict) else None
        raise MetaPublishError(f"Meta {action} failed" + (f" ({code})" if code else "") + f": {message}")
    if not isinstance(data, dict):
        raise MetaPublishError(f"Meta {action} returned an unexpected response")
    return data


def verify_page(timeout: float = 20.0) -> dict[str, Any]:
    cfg = meta_config()
    if not cfg["page_id"] or not cfg["page_access_token"]:
        raise MetaPublishError("Configure ASMR_META_PAGE_ID and ASMR_META_PAGE_ACCESS_TOKEN before connecting a Facebook Page")
    response = httpx.get(
        f"{GRAPH_BASE}/{cfg['page_id']}",
        params={"fields": "id,name", "access_token": cfg["page_access_token"]},
        timeout=timeout,
    )
    data = _check_response(response, "Page connection")
    return {"connected": True, "page_id": str(data.get("id", cfg["page_id"])), "page_name": data.get("name", "Facebook Page"), "graph_version": GRAPH_VERSION}


def publish_reel(video_path: str | Path, title: str, description: str, timeout: float = 120.0) -> dict[str, Any]:
    """Publish a local MP4 to a Facebook Page using Meta's three-stage Reels API."""
    cfg = meta_config()
    if not cfg["page_id"] or not cfg["page_access_token"]:
        raise MetaPublishError("Facebook Page is not connected. Configure the Page ID and Page access token.")
    path = Path(video_path).resolve(strict=True)
    if path.suffix.lower() != ".mp4" or not path.is_file() or path.stat().st_size == 0:
        raise MetaPublishError("The final MP4 is missing or invalid")

    token = cfg["page_access_token"]
    start = httpx.post(
        f"{GRAPH_BASE}/{cfg['page_id']}/video_reels",
        data={"upload_phase": "START", "access_token": token},
        timeout=timeout,
    )
    started = _check_response(start, "Reel upload initialization")
    video_id = str(started.get("video_id", ""))
    upload_url = str(started.get("upload_url", ""))
    if not video_id or not upload_url.startswith("https://rupload.facebook.com/"):
        raise MetaPublishError("Meta did not return a valid Reel upload session")

    size = path.stat().st_size
    def file_chunks():
        with path.open("rb") as stream:
            while chunk := stream.read(4 * 1024 * 1024):
                yield chunk

    uploaded = httpx.post(
            upload_url,
            content=file_chunks(),
            headers={
                "Authorization": f"OAuth {token}",
                "offset": "0",
                "file_size": str(size),
                "Content-Type": "application/octet-stream",
            },
            timeout=timeout,
        )
    _check_response(uploaded, "Reel binary upload")

    finish = httpx.post(
        f"{GRAPH_BASE}/{cfg['page_id']}/video_reels",
        data={
            "upload_phase": "FINISH",
            "video_id": video_id,
            "video_state": "PUBLISHED",
            "title": title[:100],
            "description": description,
            "access_token": token,
        },
        timeout=timeout,
    )
    completed = _check_response(finish, "Reel publish request")
    if completed.get("success") is False:
        raise MetaPublishError("Meta did not accept the Reel publish request")
    return {"video_id": video_id, "post_id": completed.get("post_id"), "success": True, "state": "processing"}


def get_reel_status(video_id: str, timeout: float = 20.0) -> dict[str, Any]:
    cfg = meta_config()
    if not cfg["page_access_token"]:
        raise MetaPublishError("Facebook Page access token is not configured")
    response = httpx.get(
        f"{GRAPH_BASE}/{video_id}",
        params={"fields": "status", "access_token": cfg["page_access_token"]},
        timeout=timeout,
    )
    data = _check_response(response, "Reel status check")
    status = data.get("status", {})
    if not isinstance(status, dict):
        status = {}
    video_status = str(status.get("video_status") or status.get("processing_phase", {}).get("status") or "processing").lower()
    normalized = "published" if video_status in {"ready", "published"} else "failed" if video_status in {"error", "upload_failed", "expired"} else "processing"
    return {"video_id": video_id, "status": normalized, "meta_status": status}
