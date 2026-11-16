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

    async def _ensure_project_from_home(self, page: Any) -> tuple[str, bool]:
        """Reuse the newest visible project, or create one when the account has none."""
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError

        await page.goto("https://flow.google.com/", wait_until="domcontentloaded", timeout=60000)
        if "accounts.google.com" in page.url:
            return page.url, False
        try:
            await page.wait_for_function(
                """() => Boolean(
                    document.querySelector('a[href*="/project/"]') ||
                    [...document.querySelectorAll('button')].some(button =>
                        /new project/i.test(button.getAttribute('aria-label') || button.innerText || button.textContent || '')
                    )
                )""",
                timeout=30000,
            )
        except Exception as exc:
            raise RuntimeError(
                "Google Flow home did not finish loading its project list or '+ New project' control. "
                "No project was selected or created."
            ) from exc

        # Reuse an existing project in this account before creating anything.
        # Flow's home page lists project cards as links to /project/{id}.
        existing_links = await page.locator('a[href*="/project/"]').evaluate_all(
            """nodes => nodes.filter(node => {
                const style = getComputedStyle(node);
                return node.getClientRects().length > 0 &&
                    style.visibility !== 'hidden' && style.display !== 'none';
            }).map(node => node.href)"""
        )
        for candidate in existing_links:
            try:
                existing_url = validate_flow_project_url(candidate)
            except ValueError:
                continue
            await page.goto(existing_url, wait_until="domcontentloaded", timeout=60000)
            return existing_url, False

        # Google documents the action as "+ New project". Match the visible
        # button by accessible name/text and refuse ambiguous matches.
        locator = page.get_by_role("button", name=re.compile(r"new project", re.I))
        count = await locator.count()
        if count != 1:
            locator = page.locator("button").filter(has_text=re.compile(r"^\s*\+?\s*New project\s*$", re.I))
            count = await locator.count()
        if count != 1:
            raise RuntimeError(
                "Google Flow opened, but its unique '+ New project' button was not found. "
                "The project was not created; check the signed-in account and current Flow page."
            )
        await locator.click(timeout=15000)
        try:
            await page.wait_for_url(
                re.compile(r"^https://flow\.google\.com/project/[A-Za-z0-9-]{12,}"),
                timeout=60000,
            )
        except PlaywrightTimeoutError as exc:
            raise RuntimeError(
                "Flow's '+ New project' action was clicked, but no project URL appeared. "
                "The app will not mark this profile as configured."
            ) from exc
        return validate_flow_project_url(page.url), True

    async def open_profile(self, profile_id: str, project_url: str | None = None) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        project_url = validate_flow_project_url(project_url) if project_url else ""
        async with self._locks[profile_id]:
            try:
                await self._ensure_playwright()
                context = self._contexts.get(profile_id)
                if context is None:
                    profile_dir = self.root / profile_id
                    profile_dir.mkdir(parents=True, exist_ok=True)
                    downloads_dir = profile_dir / "downloads"
                    downloads_dir.mkdir(parents=True, exist_ok=True)
                    context = await self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        channel="chrome",
                        headless=False,
                        accept_downloads=True,
                        downloads_path=str(downloads_dir),
                        viewport={"width": 1440, "height": 1000},
                    )
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
            # A saved URL always wins. With no saved URL, reuse an already-open
            # project in this persistent profile; otherwise create one on Flow.
            project_created = False
            current_project = ""
            if project_url:
                if page.url != project_url:
                    await page.goto(project_url, wait_until="domcontentloaded", timeout=60000)
            else:
                try:
                    current_project = validate_flow_project_url(page.url)
                except ValueError:
                    current_project = ""
                if not current_project:
                    current_url, project_created = await self._ensure_project_from_home(page)
                    # A login redirect is returned as-is; the next open attempt
                    # after sign-in will select or create the profile's project.
            try:
                await page.bring_to_front()
            except Exception:
                pass
            current_url = page.url
            login_required = "accounts.google.com" in current_url
            if not login_required:
                current_url = validate_flow_project_url(current_url)
            return {
                "profile_id": profile_id,
                "status": "login_required" if login_required else "project_open",
                "current_url": current_url,
                "title": await page.title(),
                "login_required": login_required,
                "profile_directory": str(self.root / profile_id),
                "project_created": bool(project_created and not login_required),
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
