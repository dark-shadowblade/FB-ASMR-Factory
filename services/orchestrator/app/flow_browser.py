from __future__ import annotations

import asyncio
import re
from pathlib import Path
import os
from urllib.parse import urlparse
from typing import Any

PROFILE_IDS = tuple(f"flow-{index}" for index in range(1, 6))


def validate_project_page(value: str) -> bool:
    try:
        validate_flow_project_url(value)
        return True
    except ValueError:
        return False


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
        configured_extension = os.environ.get("ASMR_FACTORY_EXTENSION_PATH", "").strip()
        if configured_extension:
            self.extension_path = Path(configured_extension).resolve()
        else:
            self.extension_path = Path(__file__).resolve().parents[3] / "extensions" / "flow-automation"
        self.bridge_token_path = self.root.parent / "extension-bridge.token"
        self._playwright: Any = None
        self._contexts: dict[str, Any] = {}
        self._locks = {profile_id: asyncio.Lock() for profile_id in PROFILE_IDS}

    async def _configure_worker(self, context: Any, profile_id: str) -> None:
        if not self.extension_path.is_dir() or not (self.extension_path / "manifest.json").is_file():
            raise RuntimeError(f"Bundled Flow extension is missing: {self.extension_path}")
        try:
            bridge_token = self.bridge_token_path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise RuntimeError("The desktop extension bridge token is not available yet.") from exc
        workers = list(context.service_workers)
        if not workers:
            try:
                worker = await context.wait_for_event("serviceworker", timeout=15000)
                workers.append(worker)
            except Exception as exc:
                raise RuntimeError("The Flow extension did not start in this Chrome profile.") from exc
        worker = next((item for item in workers if "/background/service-worker.js" in item.url), None)
        if worker is None:
            raise RuntimeError("The bundled Flow extension service worker was not found.")
        extension_id = worker.url.split("://", 1)[-1].split("/", 1)[0]
        if not re.fullmatch(r"[a-p]{32}", extension_id):
            raise RuntimeError("Chrome returned an invalid Flow extension ID.")
        await worker.evaluate("""async ({profileId, bridgeToken}) => {
          await chrome.storage.local.set({
            baseUrl: "http://127.0.0.1:8765",
            bridgeToken,
            profileId,
            enabled: true
          });
          await poll();
          return true;
        }""", {"profileId": profile_id, "bridgeToken": bridge_token})

    async def _ensure_playwright(self) -> None:
        if self._playwright is None:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()

    async def open_profile(self, profile_id: str, project_url: str) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        if project_url.rstrip("/") != "https://flow.google.com":
            project_url = validate_flow_project_url(project_url)
        else:
            project_url = "https://flow.google.com/"
        async with self._locks[profile_id]:
            try:
                await self._ensure_playwright()
                context = self._contexts.get(profile_id)
                if context is None:
                    profile_dir = self.root / profile_id
                    profile_dir.mkdir(parents=True, exist_ok=True)
                    downloads_dir = profile_dir / "downloads"
                    downloads_dir.mkdir(parents=True, exist_ok=True)
                    if not self.extension_path.is_dir():
                        raise RuntimeError(f"Bundled Flow extension is missing: {self.extension_path}")
                    context = await self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        channel="chrome",
                        headless=False,
                        accept_downloads=True,
                        downloads_path=str(downloads_dir),
                        viewport={"width": 1440, "height": 1000},
                        args=[
                            f"--disable-extensions-except={self.extension_path}",
                            f"--load-extension={self.extension_path}",
                        ],
                    )
                    await self._configure_worker(context, profile_id)
                    self._contexts[profile_id] = context
            except Exception as exc:
                message = str(exc)
                lowered = message.lower()
                if "executable" in lowered or "chrome" in lowered:
                    raise RuntimeError("Google Chrome was not found or could not start. Install Google Chrome and try again.") from exc
                if "playwright" in lowered or "browser_type" in lowered or "driver" in lowered:
                    raise RuntimeError("Playwright could not initialize its browser driver. Reinstall the app dependencies and Playwright browser support, then try again. " + message[:220]) from exc
                raise RuntimeError(f"Could not initialize Chrome profile {profile_id}: {message[:300]}") from exc

            pages = context.pages
            page = pages[0] if pages else await context.new_page()
            if page.url != project_url:
                await page.goto(project_url, wait_until="domcontentloaded", timeout=60000)
            if urlparse(page.url).hostname == "flow.google.com" and not validate_project_page(page.url):
                try:
                    await page.wait_for_url("https://flow.google.com/project/**", timeout=35000)
                except Exception:
                    # Flow may require sign-in or the page may not expose a unique
                    # project-creation control; report readiness accurately below.
                    pass
            try:
                await page.bring_to_front()
            except Exception:
                pass
            current_url = page.url
            login_required = "accounts.google.com" in current_url
            project_ready = bool(validate_project_page(current_url))
            return {
                "profile_id": profile_id,
                "status": "login_required" if login_required else "project_open",
                "current_url": current_url,
                "title": await page.title(),
                "login_required": login_required,
                "project_ready": project_ready,
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
