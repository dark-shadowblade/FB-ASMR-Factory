import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.flow_browser import FlowProfileManager, PROFILE_IDS, validate_flow_project_url


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

    def test_open_profile_accepts_missing_saved_project_for_auto_creation(self):
        import inspect
        self.assertIn("project_url: str | None = None", inspect.getsource(FlowProfileManager.open_profile))

    def test_flow_home_new_project_button_is_used_for_first_run(self):
        import inspect
        source = inspect.getsource(FlowProfileManager._ensure_project_from_home)
        self.assertIn("new project", source.lower())
        self.assertIn('a[href*="/project/"]', source)
        self.assertIn("existing_links", source)
        self.assertIn("wait_for_url", source)
        self.assertIn("/project/", source)


