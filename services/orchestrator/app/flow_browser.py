from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

PROFILE_IDS = tuple(f"flow-{index}" for index in range(1, 6))
FLOW_HOME = "https://flow.google.com/"
CDP_BASE_PORT = 9300


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


def find_chrome() -> str:
    """Find the user's installed, normal Google Chrome executable."""
    configured = os.environ.get("ASMR_FACTORY_CHROME_PATH", "").strip()
    if configured and Path(configured).is_file():
        return str(Path(configured).resolve())
    candidates: list[Path] = []
    if sys.platform == "win32":
        for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = os.environ.get(variable)
            if base:
                candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            found = shutil.which(name)
            if found:
                return found
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("Google Chrome was not found. Install desktop Google Chrome and try again.")


class FlowProfileManager:
    """Launch five normal visible Chrome processes with isolated persistent profiles.

    Playwright attaches to each normal Chrome process over CDP. This keeps the
    user's real Chrome UI and extension runtime while retaining programmatic control.
    """

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
        self._browsers: dict[str, Any] = {}
        self._contexts: dict[str, Any] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self._playwright_lock = asyncio.Lock()
        self._locks = {profile_id: asyncio.Lock() for profile_id in PROFILE_IDS}

    def _profile_port(self, profile_id: str) -> int:
        return CDP_BASE_PORT + PROFILE_IDS.index(profile_id) + 1

    async def _ensure_playwright(self) -> None:
        async with self._playwright_lock:
            if self._playwright is None:
                from playwright.async_api import async_playwright
                self._playwright = await async_playwright().start()

    async def _connect_or_launch_chrome(self, profile_id: str, profile_dir: Path, downloads_dir: Path) -> tuple[Any, Any]:
        await self._ensure_playwright()
        port = self._profile_port(profile_id)
        endpoint = f"http://127.0.0.1:{port}"
        process = self._processes.get(profile_id)
        browser = self._browsers.get(profile_id)

        if browser is not None:
            try:
                contexts = browser.contexts
                if contexts:
                    return browser, contexts[0]
            except Exception:
                self._browsers.pop(profile_id, None)
                self._contexts.pop(profile_id, None)

        chrome = find_chrome()
        profile_dir.mkdir(parents=True, exist_ok=True)
        downloads_dir.mkdir(parents=True, exist_ok=True)
        # Extension packaging/registration must not be a prerequisite for
        # launching the user's visible Chrome window. A missing extension is a
        # separate diagnostic; it must never prevent the five account windows
        # from opening.
        extension_available = (
            self.extension_path.is_dir()
            and (self.extension_path / "manifest.json").is_file()
        )

        # Reattach to a Chrome window left running by a previous app session.
        # This preserves the signed-in Google session and avoids trying to reuse a
        # profile directory while its Chrome process is already holding the lock.
        try:
            browser = await self._playwright.chromium.connect_over_cdp(endpoint, timeout=1200)
            contexts = browser.contexts
            if contexts:
                context = contexts[0]
                self._browsers[profile_id] = browser
                self._contexts[profile_id] = context
                return browser, context
            await browser.close()
        except Exception:
            pass

        if process is None or process.poll() is not None:
            args = [
                chrome,
                f"--remote-debugging-port={port}",
                f"--user-data-dir={profile_dir.resolve()}",
                f"--download-default-directory={downloads_dir.resolve()}",
                "--no-first-run",
                "--no-default-browser-check",
                "--new-window",
                FLOW_HOME,
            ]
            if extension_available:
                args[args.index("--new-window"):args.index("--new-window")] = [
                    "--disable-extensions-except=" + str(self.extension_path),
                    "--load-extension=" + str(self.extension_path),
                ]
            # Chrome is a GUI application: launch it as a normal desktop
            # process so every account gets a visible, user-interactable window.
            # Do not use CREATE_NO_WINDOW / DETACHED_PROCESS here.
            process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._processes[profile_id] = process

        last_error: Exception | None = None
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError("Google Chrome closed before its remote debugging endpoint became ready.")
            try:
                browser = await self._playwright.chromium.connect_over_cdp(endpoint, timeout=1500)
                contexts = browser.contexts
                if not contexts:
                    raise RuntimeError("Chrome started without a default browser context.")
                context = contexts[0]
                self._browsers[profile_id] = browser
                self._contexts[profile_id] = context
                return browser, context
            except Exception as exc:
                last_error = exc
                await asyncio.sleep(0.5)

        if process.poll() is None:
            process.terminate()
        raise RuntimeError(f"Could not connect to normal Chrome over CDP on port {port}: {last_error}")

    async def _configure_worker(self, context: Any, profile_id: str) -> None:
        try:
            bridge_token = self.bridge_token_path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise RuntimeError("The desktop extension bridge token is not available yet.") from exc
        if not bridge_token:
            raise RuntimeError("The desktop extension bridge token is empty.")
        workers = list(context.service_workers)
        if not workers:
            try:
                worker = await context.wait_for_event("serviceworker", timeout=20000)
                workers.append(worker)
            except Exception as exc:
                raise RuntimeError("The Flow extension did not start in this Chrome profile. Check that Chrome loaded the bundled extension.") from exc
        worker = next((item for item in workers if "/background/service-worker.js" in item.url), None)
        if worker is None:
            raise RuntimeError("The bundled Flow extension service worker was not found in this Chrome profile.")
        registration = await worker.evaluate("""async ({profileId, bridgeToken, baseUrl, enabled}) => {
          await chrome.storage.local.set({
            baseUrl, bridgeToken, profileId, enabled,
            extensionWorkerStatus: { profileId, connected: false, error: "Registering with local orchestrator…" }
          });
          await poll();
          // poll() can already be running because Chrome just started the
          // service worker. Wait for its actual registration result instead
          // of assuming that invoking poll means the bridge is connected.
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const saved = await chrome.storage.local.get("extensionWorkerStatus");
            const status = saved.extensionWorkerStatus || {};
            if (status.profileId === profileId && status.connected === true) {
              return { connected: true, error: "" };
            }
            if (status.profileId === profileId && status.error) {
              return { connected: false, error: status.error };
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          }
          const saved = await chrome.storage.local.get("extensionWorkerStatus");
          return { connected: false, error: saved.extensionWorkerStatus?.error || "Extension did not register within 10 seconds." };
        }""", {
            "profileId": profile_id,
            "bridgeToken": bridge_token,
            "baseUrl": "http://127.0.0.1:8765",
            "enabled": True,
        })
        if not isinstance(registration, dict) or registration.get("connected") is not True:
            detail = registration.get("error", "Unknown extension registration error") if isinstance(registration, dict) else "No registration result returned"
            raise RuntimeError("Flow extension could not connect to the local orchestrator: " + str(detail)[:250])

    async def open_profile(self, profile_id: str, project_url: str) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        if project_url.rstrip("/") != "https://flow.google.com":
            project_url = validate_flow_project_url(project_url)
        else:
            project_url = FLOW_HOME

        async with self._locks[profile_id]:
            profile_dir = self.root / profile_id
            downloads_dir = profile_dir / "downloads"
            try:
                # Match the working ASMR-Factory reference: opening the normal,
                # visible Chrome process is the primary operation. Extension
                # startup/bridge registration is a separate capability and must
                # never make a successfully opened browser look like a launch
                # failure or prevent the remaining profiles from opening.
                browser, context = await self._connect_or_launch_chrome(profile_id, profile_dir, downloads_dir)
            except Exception as exc:
                message = str(exc)
                if "Chrome was not found" in message or ("chrome" in message.lower() and "executable" in message.lower()):
                    raise RuntimeError(message) from exc
                raise RuntimeError(f"Could not launch visible Chrome profile {profile_id}: {message[:350]}") from exc

            extension_connected = False
            extension_error = ""
            if not getattr(context, "_asmr_extension_configured", False):
                try:
                    await self._configure_worker(context, profile_id)
                    extension_connected = True
                    try:
                        context._asmr_extension_configured = True
                    except Exception:
                        pass
                except Exception as exc:
                    extension_error = str(exc)[:350]

            pages = context.pages
            page = pages[0] if pages else await context.new_page()
            if page.url != project_url:
                await page.goto(project_url, wait_until="domcontentloaded", timeout=60000)
            if urlparse(page.url).hostname == "flow.google.com" and not validate_project_page(page.url):
                try:
                    await page.wait_for_url("https://flow.google.com/project/**", timeout=35000)
                except Exception:
                    pass
            try:
                await page.bring_to_front()
            except Exception:
                pass
            current_url = page.url
            login_required = "accounts.google.com" in current_url
            project_ready = validate_project_page(current_url)
            return {
                "profile_id": profile_id,
                "status": "login_required" if login_required else "project_open",
                "current_url": current_url,
                "title": await page.title(),
                "login_required": login_required,
                "project_ready": project_ready,
                "profile_directory": str(profile_dir),
                "browser_mode": "visible_chrome_cdp",
                "debugging_port": self._profile_port(profile_id),
                "extension_connected": extension_connected or bool(getattr(context, "_asmr_extension_configured", False)),
                "extension_error": extension_error,
            }

    def status(self, profile_id: str) -> dict[str, Any]:
        if profile_id not in PROFILE_IDS:
            raise ValueError("Unknown Flow profile.")
        process = self._processes.get(profile_id)
        browser = self._browsers.get(profile_id)
        context = self._contexts.get(profile_id)
        alive = bool(browser is not None and context is not None)
        if alive:
            try:
                alive = context in browser.contexts
            except Exception:
                alive = False
        # A profile reattached over CDP after an orchestrator restart has no
        # Popen handle in this process, but its browser is still genuinely open.
        if process is not None and process.poll() is not None:
            alive = False
        return {
            "profile_id": profile_id,
            "browser_open": alive,
            "browser_mode": "visible_chrome_cdp",
            "debugging_port": self._profile_port(profile_id),
        }

    async def close_all(self) -> None:
        for profile_id, browser in list(self._browsers.items()):
            try:
                await browser.close()
            except Exception:
                pass
            process = self._processes.get(profile_id)
            if process and process.poll() is None:
                try:
                    process.terminate()
                except Exception:
                    pass
        self._browsers.clear()
        self._contexts.clear()
        self._processes.clear()
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None
