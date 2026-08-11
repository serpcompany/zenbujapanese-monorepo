"""Shared integrity helpers for Zenbu's pinned Language Reference Data tooling."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def observe_remote(download_url: str, user_agent: str) -> dict[str, object]:
    digest = hashlib.sha256()
    byte_count = 0
    request = urllib.request.Request(download_url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(request, timeout=120) as response:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            byte_count += len(chunk)
        return {
            "download_url": response.url,
            "http_last_modified": response.headers.get("Last-Modified"),
            "http_etag": response.headers.get("ETag"),
            "compressed_bytes": byte_count,
            "sha256": digest.hexdigest(),
        }


def fetch_remote_json(download_url: str, user_agent: str) -> object:
    request = urllib.request.Request(
        download_url,
        headers={"Accept": "application/vnd.github+json", "User-Agent": user_agent},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)
