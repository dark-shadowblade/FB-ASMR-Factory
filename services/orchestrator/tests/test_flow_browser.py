import unittest
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.flow_browser import FlowProfileManager, PROFILE_IDS, resolve_flow_extension_dir, validate_flow_project_url


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



    def test_resolves_extension_from_pyinstaller_bundle(self):
        with TemporaryDirectory() as temp:
            extension = Path(temp) / "extensions" / "flow-automation"
            extension.mkdir(parents=True)
            (extension / "manifest.json").write_text("{}", encoding="utf-8")
            with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", temp, create=True):
                self.assertEqual(resolve_flow_extension_dir(), extension)

    def test_missing_packaged_extension_has_actionable_error(self):
        with TemporaryDirectory() as temp:
            with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", temp, create=True):
                with self.assertRaisesRegex(RuntimeError, "not packaged or found"):
                    resolve_flow_extension_dir()
