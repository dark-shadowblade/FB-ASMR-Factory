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
            self.assertNotEqual(manager.root / "flow-1", manager.root / "flow-2")

    def test_open_five_profiles_launches_five_isolated_chrome_contexts_and_configures_workers(self):
        class FakePage:
            url = "https://flow.google.com/project/12345678-abcd"
            async def title(self):
                return "Flow project"
            async def bring_to_front(self):
                return None

        class FakeWorker:
            url = "chrome-extension://" + ("a" * 32) + "/background/service-worker.js"
            def __init__(self):
                self.configurations = []
            async def evaluate(self, _script, config):
                self.configurations.append(config)

        class FakeContext:
            def __init__(self, worker):
                self.pages = [FakePage()]
                self.service_workers = [worker]

        with TemporaryDirectory() as temp:
            root = Path(temp) / "data" / "chrome-profiles"
            extension = Path(temp) / "extension"
            extension.mkdir()
            root.parent.mkdir(parents=True)
            (extension / "manifest.json").write_text("{}", encoding="utf-8")
            (root.parent / "extension-bridge.token").write_text("test-bridge-token", encoding="utf-8")
            workers = [FakeWorker() for _ in PROFILE_IDS]
            contexts = [FakeContext(worker) for worker in workers]
            launcher = AsyncMock(side_effect=contexts)
            manager = FlowProfileManager(root)
            manager.extension_path = extension
            manager._playwright = SimpleNamespace(chromium=SimpleNamespace(launch_persistent_context=launcher))

            async def open_all():
                return await asyncio.gather(*(
                    manager.open_profile(pid, "https://flow.google.com/project/12345678-abcd")
                    for pid in PROFILE_IDS
                ))

            results = asyncio.run(open_all())
            self.assertEqual(len(results), 5)
            self.assertEqual(launcher.await_count, 5)
            self.assertEqual([worker.configurations[0]["profileId"] for worker in workers], list(PROFILE_IDS))
            self.assertTrue(all(worker.configurations[0]["bridgeToken"] == "test-bridge-token" for worker in workers))
            self.assertEqual(len({call.kwargs["user_data_dir"] for call in launcher.await_args_list}), 5)


