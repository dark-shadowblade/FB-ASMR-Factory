from __future__ import annotations

import asyncio
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

PROFILE_IDS = tuple(f"flow-{index}" for index in range(1, 6))


def validate_flow_project_url(value: str) -> str:
    url = value.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "flow.google.com":
        raise ValueError("Use an HTTPS Google Flow project URL from flow.google.com.")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 2 or parts[0] != "project" or not re.fullmatch(r"[A-Za-z0-9-]{12,}", parts[1]):
        raise ValueError("URL must point directly to a Google Flow project, for example https://flow.google.com/project/PROJECT_ID.")
    return url


class FlowProfileManager:
    """Owns five isolated, persistent Chrome profiles and their visible Flow tabs."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._playwright: Any = None
        self._contexts: dict[str, Any] = {}
        self._locks = {profile_id: asyncio.Lock() for profile_id in PROFILE_IDS}

    async def _ensure_playwright(self) -> None:
        if self._playwright is None:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()

    async def open_profile(self, profile_id: str, project_url: str) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        project_url = validate_flow_project_url(project_url)
        async with self._locks[profile_id]:
            await self._ensure_playwright()
            context = self._contexts.get(profile_id)
            if context is None:
                profile_dir = self.root / profile_id
                profile_dir.mkdir(parents=True, exist_ok=True)
                downloads_dir = profile_dir / "downloads"
                downloads_dir.mkdir(parents=True, exist_ok=True)
                try:
                    context = await self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        channel="chrome",
                        headless=False,
                        accept_downloads=True,
                        downloads_path=str(downloads_dir),
                        viewport={"width": 1440, "height": 1000},
                    )
                except Exception as exc:
                    message = str(exc)
                    if "executable" in message.lower() or "chrome" in message.lower():
                        raise RuntimeError("Google Chrome was not found or could not start. Install Chrome and try again.") from exc
                    raise RuntimeError(f"Could not open Chrome profile {profile_id}: {message[:300]}") from exc
                self._contexts[profile_id] = context

            pages = context.pages
            page = pages[0] if pages else await context.new_page()
            if page.url != project_url:
                await page.goto(project_url, wait_until="domcontentloaded", timeout=60000)
            try:
                await page.bring_to_front()
            except Exception:
                pass
            current_url = page.url
            login_required = "accounts.google.com" in current_url
            return {
                "profile_id": profile_id,
                "status": "login_required" if login_required else "project_open",
                "current_url": current_url,
                "title": await page.title(),
                "login_required": login_required,
                "profile_directory": str(self.root / profile_id),
            }

    def status(self, profile_id: str) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        return {"profile_id": profile_id, "browser_open": profile_id in self._contexts}

    async def close_all(self) -> None:
        for context in list(self._contexts.values()):
            try:
                await context.close()
            except Exception:
                pass
        self._contexts.clear()
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None
