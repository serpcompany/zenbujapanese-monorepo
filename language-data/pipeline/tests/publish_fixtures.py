from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import publish_release
import release_manifest
from object_store import Head, PreconditionFailed

COMMIT_A, COMMIT_B = "a" * 40, "b" * 40


def quiet(*_: object) -> None:
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FakeStore:
    def __init__(self):
        self.objects: dict[str, dict] = {}
        self.puts: list[str] = []
        self.version = 0
        self.before_put = None
        self.after_put = None
        self.reports_checksum_sha256 = False

    def head(self, key):
        obj = self.objects.get(key)
        if obj is None:
            return None
        checksum = sha256(obj["body"]) if self.reports_checksum_sha256 else None
        return Head(len(obj["body"]), obj["sha256"], obj["etag"], checksum)

    def get(self, key):
        obj = self.objects.get(key)
        return None if obj is None else (obj["body"], obj["etag"])

    def download(self, key, path):
        path.write_bytes(self.objects[key]["body"])

    def put(self, key, body, *, sha256, content_type, cache_control, if_none_match=False,
            if_match=None):
        if self.before_put:
            self.before_put(key)
        data = body if isinstance(body, bytes) else body.read_bytes()
        if hashlib.sha256(data).hexdigest() != sha256:
            raise AssertionError(f"R2 would reject {key}: its checksum doesn't match")
        existing = self.objects.get(key)
        if if_none_match and existing is not None:
            raise PreconditionFailed(key)
        if if_match is not None and (existing is None or existing["etag"] != if_match):
            raise PreconditionFailed(key)
        self.version += 1
        self.objects[key] = {
            "body": data,
            "sha256": sha256,
            "etag": f'"{self.version}"',
            "content_type": content_type,
            "cache_control": cache_control,
        }
        self.puts.append(key)
        if self.after_put:
            self.after_put(key)

    def index(self):
        return json.loads(self.objects["releases.json"]["body"])


def stage(directory: Path, release: str, files: dict[str, bytes], commit=COMMIT_A) -> Path:
    records = []
    for name, data in files.items():
        path = directory / "files" / sha256(data) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        records.append(
            {
                "name": name,
                "artifact_schema": None,
                "schema_source": "undeclared",
                "sha256": sha256(data),
                "bytes": len(data),
                "depends_on": [],
            }
        )
    manifest = {
        "manifest_schema": release_manifest.MANIFEST_SCHEMA,
        "release": release,
        "git_commit": commit,
        "workflow_run": None,
        "previous_release": None,
        "previous_manifest_sha256": None,
        "sources": [],
        "files": records,
        "ids": {
            "file": records[0]["name"],
            "ent_seq_count": 1,
            "ent_seq_digest": release_manifest.ENT_SEQ_DIGEST,
            "ent_seq_sha256": sha256(b"1000000\n"),
        },
        "conformance": [{"name": "suite.json", "suite": "suite", "sha256": "0" * 64, "bytes": 2}],
        "core_sha256": None,
    }
    release_manifest.write_manifest(directory, manifest)
    return directory


FILES_1 = {"Data.json": b'{"a": 1}\n', "NOTICE.txt": b"notice\n"}
FILES_2 = {"Data.json": b'{"a": 2}\n', "NOTICE.txt": b"notice\n"}


class PublishTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.store = FakeStore()
        self.count = 0

    def tearDown(self):
        self._tmp.cleanup()

    def staged(self, release="2026.10.1", files=FILES_1, commit=COMMIT_A) -> Path:
        self.count += 1
        return stage(self.tmp / f"out{self.count}", release, files, commit)

    def publish(self, staged, when="2026-10-01T00:00:00Z"):
        return publish_release.publish(self.store, staged, now=lambda: when, log=quiet)
