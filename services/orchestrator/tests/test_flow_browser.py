import asyncio
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.flow_browser import FlowProfileManager, PROFILE_IDS, validate_flow_project_url, validate_project_page


class FlowProfileTests(unittest.TestCase):
    def test_exactly_five_stable_profile_ids(self):
        self.assertEqual(PROFILE_IDS, ("flow-1", "flow-2", "flow-3", "flow-4", "flow-5"))

    def test_accepts_direct_flow_project_url(self):
        url = "https://flow.google.com/project/cc488538-59da-4ece-ba7a-6236918191a1"
        self.assertEqual(validate_flow_project_url(url), url)

    def test_rejects_non_flow_hosts(self):
        with self.assertRaises(ValueError):
            validate_flow_project_url("https://example.com/project/123456789012")

    def test_rejects_flow_homepage_and_non_project_paths(self):
        for url in ("https://flow.google.com/", "https://flow.google.com/project", "https://flow.google.com/settings/123456789012"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_flow_project_url(url)

    def test_project_page_readiness_only_accepts_direct_project_urls(self):
        self.assertTrue(validate_project_page("https://flow.google.com/project/12345678-abcd"))
        self.assertFalse(validate_project_page("https://flow.google.com/"))
        self.assertFalse(validate_project_page("https://accounts.google.com/"))

    def test_rejects_insecure_and_malformed_urls(self):
        for url in ("http://flow.google.com/project/123456789012", "not a url"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_flow_project_url(url)

    def test_profile_directories_are_isolated(self):
        with TemporaryDirectory() as temp:
            manager = FlowProfileManager(Path(temp))
            self.assertFalse(manager.status("flow-1")["browser_open"])
            self.assertFalse(manager.status("flow-2")["browser_open"])
            attached_context = object()
            manager._contexts["flow-1"] = attached_context
            manager._browsers["flow-1"] = SimpleNamespace(contexts=[attached_context])
            self.assertTrue(manager.status("flow-1")["browser_open"])
            self.assertFalse(manager.status("flow-2")["browser_open"])
            self.assertNotEqual(manager.root / "flow-1", manager.root / "flow-2")

    def test_extension_startup_failure_does_not_hide_successfully_opened_chrome(self):
        class FakePage:
            url = "https://flow.google.com/"
            async def title(self):
                return "Google Flow"
            async def bring_to_front(self):
                return None
            async def goto(self, url, **_kwargs):
                self.url = url

        class FakeContext:
            pages = [FakePage()]
            service_workers = []

        class FakeBrowser:
            def __init__(self, context):
                self.contexts = [context]

        with TemporaryDirectory() as temp:
            manager = FlowProfileManager(Path(temp))
            context = FakeContext()
            browser = FakeBrowser(context)
            manager._connect_or_launch_chrome = AsyncMock(return_value=(browser, context))
            manager._configure_worker = AsyncMock(side_effect=RuntimeError("Extension service worker did not start"))
            result = asyncio.run(manager.open_profile("flow-1", "https://flow.google.com/"))
            self.assertEqual(result["profile_id"], "flow-1")
            self.assertEqual(result["browser_mode"], "visible_chrome_cdp")
            self.assertFalse(result["login_required"])
            self.assertFalse(result["project_ready"])
            self.assertFalse(result["extension_connected"])
            self.assertIn("service worker did not start", result["extension_error"].lower())
            self.assertTrue(manager.status("flow-1")["browser_open"])

    def test_open_five_profiles_launches_five_isolated_chrome_contexts_and_configures_workers(self):
        from unittest.mock import patch

        class FakePage:
            url = "https://flow.google.com/project/12345678-abcd"
            async def title(self):
                return "Flow project"
            async def bring_to_front(self):
                return None
            async def goto(self, url, **_kwargs):
                self.url = url

        class FakeWorker:
            url = "chrome-extension://" + ("a" * 32) + "/background/service-worker.js"
            def __init__(self):
                self.configurations = []
            async def evaluate(self, _script, config):
                self.configurations.append(config)
                return {"connected": True, "error": ""}

        class FakeContext:
            def __init__(self, worker):
                self.pages = [FakePage()]
                self.service_workers = [worker]
            async def new_page(self):
                page = FakePage()
                self.pages.append(page)
                return page

        class FakeBrowser:
            def __init__(self, context):
                self.contexts = [context]
                self.closed = False
            async def close(self):
                self.closed = True

        class FakeProcess:
            def __init__(self, args):
                self.args = args
                self.terminated = False
            def poll(self):
                return None if not self.terminated else 0
            def terminate(self):
                self.terminated = True

        with TemporaryDirectory() as temp:
            root = Path(temp) / "data" / "chrome-profiles"
            extension = Path(temp) / "extension"
            extension.mkdir()
            root.parent.mkdir(parents=True)
            (extension / "manifest.json").write_text("{}", encoding="utf-8")
            (root.parent / "extension-bridge.token").write_text("test-bridge-token", encoding="utf-8")
            workers = {pid: FakeWorker() for pid in PROFILE_IDS}
            contexts = {pid: FakeContext(workers[pid]) for pid in PROFILE_IDS}
            browsers = {pid: FakeBrowser(contexts[pid]) for pid in PROFILE_IDS}
            attempts = {}
            processes = []
            process_options = []

            async def connect(endpoint, timeout):
                port = int(endpoint.rsplit(":", 1)[1])
                profile_id = PROFILE_IDS[port - 9301]
                attempts[port] = attempts.get(port, 0) + 1
                # First call checks whether an old Chrome process is already running.
                if attempts[port] == 1:
                    raise RuntimeError("no existing Chrome endpoint")
                return browsers[profile_id]

            def popen(args, **kwargs):
                process = FakeProcess(args)
                processes.append(process)
                process_options.append(kwargs)
                return process

            manager = FlowProfileManager(root)
            manager.extension_path = extension
            manager._playwright = SimpleNamespace(
                chromium=SimpleNamespace(connect_over_cdp=AsyncMock(side_effect=connect)),
                stop=AsyncMock(),
            )

            async def open_all():
                return await asyncio.gather(*(
                    manager.open_profile(pid, "https://flow.google.com/project/12345678-abcd")
                    for pid in PROFILE_IDS
                ))

            with patch("app.flow_browser.find_chrome", return_value="/fake/chrome"):
                with patch("app.flow_browser.subprocess.Popen", side_effect=popen):
                    results = asyncio.run(open_all())

            self.assertEqual(len(results), 5)
            self.assertTrue(all(result["project_ready"] for result in results))
            self.assertEqual(len(processes), 5)
            self.assertEqual([result["debugging_port"] for result in results], [9301, 9302, 9303, 9304, 9305])
            user_data_dirs = [
                next(arg.split("=", 1)[1] for arg in process.args if arg.startswith("--user-data-dir="))
                for process in processes
            ]
            self.assertEqual(len(set(user_data_dirs)), 5)
            self.assertTrue(all("--new-window" in process.args for process in processes))
            self.assertTrue(all("https://flow.google.com/" in process.args for process in processes))
            self.assertTrue(all("creationflags" not in options for options in process_options))
            self.assertTrue(all(any(arg.startswith("--load-extension=") for arg in process.args) for process in processes))
            self.assertEqual(
                [workers[pid].configurations[0]["profileId"] for pid in PROFILE_IDS],
                list(PROFILE_IDS),
            )
            self.assertTrue(all(
                workers[pid].configurations[0]["bridgeToken"] == "test-bridge-token"
                for pid in PROFILE_IDS
            ))
            self.assertTrue(all(
                workers[pid].configurations[0]["baseUrl"] == "http://127.0.0.1:8765"
                and workers[pid].configurations[0]["enabled"] is True
                for pid in PROFILE_IDS
            ))
            self.assertTrue(all(manager.status(pid)["browser_open"] for pid in PROFILE_IDS))
            asyncio.run(manager.close_all())
            self.assertTrue(all(process.terminated for process in processes))
