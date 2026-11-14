from pathlib import Path
import os
import unittest
from unittest.mock import patch

from app import meta_publisher


class MetaPublisherTests(unittest.TestCase):
    def test_page_connection_requires_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(meta_publisher.MetaPublishError, "Configure"):
                meta_publisher.verify_page()

    def test_publish_requires_page_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(meta_publisher.MetaPublishError, "not connected"):
                meta_publisher.publish_reel("missing.mp4", "title", "description")

    def test_publish_rejects_non_mp4(self):
        with patch.dict(os.environ, {"ASMR_META_PAGE_ID": "123", "ASMR_META_PAGE_ACCESS_TOKEN": "test-token"}):
            with self.assertRaisesRegex(meta_publisher.MetaPublishError, "MP4"):
                meta_publisher.publish_reel("video.mov", "title", "description")


if __name__ == "__main__":
    unittest.main()
