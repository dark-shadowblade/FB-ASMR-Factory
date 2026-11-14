from pathlib import Path

import pytest

from app import meta_publisher


def test_page_connection_requires_credentials(monkeypatch):
    monkeypatch.delenv("ASMR_META_PAGE_ID", raising=False)
    monkeypatch.delenv("ASMR_META_PAGE_ACCESS_TOKEN", raising=False)
    with pytest.raises(meta_publisher.MetaPublishError, match="Configure"):
        meta_publisher.verify_page()


def test_publish_requires_page_credentials(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("ASMR_META_PAGE_ID", raising=False)
    monkeypatch.delenv("ASMR_META_PAGE_ACCESS_TOKEN", raising=False)
    video = tmp_path / "final.mp4"
    video.write_bytes(b"test")
    with pytest.raises(meta_publisher.MetaPublishError, match="not connected"):
        meta_publisher.publish_reel(video, "title", "description")


def test_publish_rejects_non_mp4(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("ASMR_META_PAGE_ID", "123")
    monkeypatch.setenv("ASMR_META_PAGE_ACCESS_TOKEN", "secret")
    video = tmp_path / "final.mov"
    video.write_bytes(b"test")
    with pytest.raises(meta_publisher.MetaPublishError, match="MP4"):
        meta_publisher.publish_reel(video, "title", "description")
