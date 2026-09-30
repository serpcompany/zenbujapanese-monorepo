from __future__ import annotations

import base64
import copy
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import package
import publish
from package import Refusal
from publish import Head, PreconditionFailed

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
        "manifest_schema": package.MANIFEST_SCHEMA,
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
            "ent_seq_digest": package.ENT_SEQ_DIGEST,
            "ent_seq_sha256": sha256(b"1000000\n"),
        },
        "conformance": [{"name": "suite.json", "suite": "suite", "sha256": "0" * 64, "bytes": 2}],
        "core_sha256": None,
    }
    package.write_manifest(directory, manifest)
    return directory


FILES_1 = {"Data.json": b'{"a": 1}\n', "NOTICE.txt": b"notice\n"}
FILES_2 = {"Data.json": b'{"a": 2}\n', "NOTICE.txt": b"notice\n"}


class PublishTests(unittest.TestCase):
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
        return publish.publish(self.store, staged, now=lambda: when, log=quiet)

    def test_a_first_release_uploads_files_then_the_manifest_then_releases_json(self):
        result = self.publish(self.staged())
        data_key = f"files/{sha256(FILES_1['Data.json'])}/Data.json"
        notice_key = f"files/{sha256(FILES_1['NOTICE.txt'])}/NOTICE.txt"
        self.assertEqual(
            self.store.puts,
            [data_key, notice_key, "releases/2026.10.1/manifest.json", "releases.json"],
        )
        manifest_body = self.store.objects["releases/2026.10.1/manifest.json"]["body"]
        manifest = json.loads(manifest_body)
        self.assertIsNone(manifest["previous_release"])
        self.assertIsNone(manifest["previous_manifest_sha256"])
        package.validate_manifest(manifest)
        self.assertEqual(
            self.store.index(),
            {
                "index_schema": "zenbu.language-data-releases.v1",
                "releases": [
                    {
                        "release": "2026.10.1",
                        "manifest_sha256": sha256(manifest_body),
                        "git_commit": COMMIT_A,
                        "published_at": "2026-10-01T00:00:00Z",
                    }
                ],
            },
        )
        self.assertTrue(result["listed"])
        self.assertEqual(self.store.objects[data_key]["cache_control"], publish.IMMUTABLE)
        self.assertEqual(self.store.objects["releases.json"]["cache_control"], publish.MUTABLE)
        self.assertEqual(
            self.store.objects[notice_key]["content_type"], "text/plain; charset=utf-8"
        )

    def test_rerunning_the_same_publish_writes_nothing(self):
        self.publish(self.staged())
        before = copy.deepcopy(self.store.objects)
        self.store.puts.clear()
        result = self.publish(self.staged(), when="2026-10-02T00:00:00Z")
        self.assertEqual(self.store.puts, [])
        self.assertEqual(self.store.objects, before)
        self.assertFalse(result["listed"])

    def test_the_same_content_from_another_commit_is_a_no_op(self):
        self.publish(self.staged())
        published = self.store.objects["releases/2026.10.1/manifest.json"]["body"]
        self.store.puts.clear()
        result = self.publish(self.staged(commit=COMMIT_B))
        self.assertEqual(self.store.puts, [])
        self.assertEqual(self.store.objects["releases/2026.10.1/manifest.json"]["body"], published)
        self.assertEqual(result["manifest_sha256"], sha256(published))
        self.assertEqual(self.store.index()["releases"][0]["git_commit"], COMMIT_A)

    def test_different_content_under_a_published_release_is_refused(self):
        self.publish(self.staged())
        before = copy.deepcopy(self.store.objects)
        self.store.puts.clear()
        with self.assertRaisesRegex(
            Refusal, r"already published with different content.*Data\.json.*bump"
        ):
            self.publish(self.staged(files=FILES_2))
        self.assertEqual(self.store.puts, [])
        self.assertEqual(self.store.objects, before)

    def test_the_next_release_links_to_the_latest_and_reuses_unchanged_files(self):
        self.publish(self.staged())
        first = self.store.index()["releases"][0]
        self.store.puts.clear()
        self.publish(self.staged("2026.11.1", FILES_2, COMMIT_B), when="2026-11-01T00:00:00Z")
        self.assertEqual(
            self.store.puts,
            [
                f"files/{sha256(FILES_2['Data.json'])}/Data.json",
                "releases/2026.11.1/manifest.json",
                "releases.json",
            ],
        )
        manifest = json.loads(self.store.objects["releases/2026.11.1/manifest.json"]["body"])
        self.assertEqual(manifest["previous_release"], "2026.10.1")
        self.assertEqual(manifest["previous_manifest_sha256"], first["manifest_sha256"])
        releases = self.store.index()["releases"]
        self.assertEqual([r["release"] for r in releases], ["2026.10.1", "2026.11.1"])
        self.assertEqual(releases[0], first)
        self.assertEqual(releases[1]["git_commit"], COMMIT_B)

    def test_rerunning_an_older_release_after_a_newer_one_is_a_no_op(self):
        self.publish(self.staged())
        self.publish(self.staged("2026.11.1", FILES_2))
        self.store.puts.clear()
        self.publish(self.staged())
        self.assertEqual(self.store.puts, [])

    def test_a_release_not_after_the_latest_is_refused(self):
        self.publish(self.staged("2026.11.1"))
        self.store.puts.clear()
        for release in ("2026.10.1", "2026.10.2"):
            with self.assertRaisesRegex(Refusal, "isn't after the latest published release"):
                self.publish(self.staged(release, FILES_2))
        self.assertEqual(self.store.puts, [])

    def test_an_existing_file_object_with_other_bytes_is_never_overwritten(self):
        key = f"files/{sha256(FILES_1['Data.json'])}/Data.json"
        self.store.objects[key] = {"body": b"other", "sha256": sha256(b"other"), "etag": '"x"'}
        with self.assertRaisesRegex(Refusal, "never overwritten"):
            self.publish(self.staged())
        self.assertEqual(self.store.objects[key]["body"], b"other")
        self.assertNotIn("releases/2026.10.1/manifest.json", self.store.objects)
        self.assertNotIn("releases.json", self.store.objects)

    def test_an_existing_file_object_without_its_sha256_is_refused(self):
        data = FILES_1["Data.json"]
        key = f"files/{sha256(data)}/Data.json"
        self.store.objects[key] = {"body": data, "sha256": None, "etag": '"x"'}
        with self.assertRaisesRegex(Refusal, "never overwritten"):
            self.publish(self.staged())

    def test_a_publish_interrupted_before_releases_json_finishes_on_the_rerun(self):
        staged = self.staged()
        self.store.before_put = lambda key: self._fail_on(key, "releases.json")
        with self.assertRaises(RuntimeError):
            self.publish(staged)
        self.assertNotIn("releases.json", self.store.objects)
        self.store.before_put = None
        self.store.puts.clear()
        self.publish(self.staged(commit=COMMIT_B))
        self.assertEqual(self.store.puts, ["releases.json"])
        entry = self.store.index()["releases"][0]
        manifest_body = self.store.objects["releases/2026.10.1/manifest.json"]["body"]
        self.assertEqual(entry["manifest_sha256"], sha256(manifest_body))
        self.assertEqual(entry["git_commit"], COMMIT_A)

    def _fail_on(self, key, target):
        if key == target:
            raise RuntimeError("the runner died")

    def test_a_listed_release_whose_manifest_is_missing_is_refused(self):
        self.publish(self.staged())
        del self.store.objects["releases/2026.10.1/manifest.json"]
        with self.assertRaisesRegex(Refusal, "doesn't exist"):
            self.publish(self.staged())

    def test_a_listed_manifest_sha256_that_disagrees_is_refused(self):
        self.publish(self.staged())
        index = self.store.index()
        index["releases"][0]["manifest_sha256"] = "f" * 64
        body = publish.index_bytes(index)
        self.store.objects["releases.json"].update(body=body, sha256=sha256(body))
        with self.assertRaisesRegex(Refusal, "releases.json lists 2026.10.1 with manifest sha256"):
            self.publish(self.staged())

    def test_releases_json_changed_by_another_writer_is_refused(self):
        self.publish(self.staged())

        def another_writer(key):
            if key == "releases.json":
                self.store.objects["releases.json"]["etag"] = '"changed"'

        self.store.before_put = another_writer
        with self.assertRaisesRegex(Refusal, "changed after .* won't list it.*bump"):
            self.publish(self.staged("2026.11.1", FILES_2))
        self.assertEqual([r["release"] for r in self.store.index()["releases"]], ["2026.10.1"])

    def test_releases_json_created_by_another_writer_is_refused(self):
        def another_writer(key):
            if key == "releases.json":
                body = publish.index_bytes(publish.empty_index())
                self.store.objects["releases.json"] = {
                    "body": body, "sha256": sha256(body), "etag": '"other"'
                }

        self.store.before_put = another_writer
        with self.assertRaisesRegex(Refusal, "releases.json changed after"):
            self.publish(self.staged())

    def _another_publish_lists(self, release):
        index = self.store.index()
        index["releases"].append(
            {
                "release": release,
                "manifest_sha256": "e" * 64,
                "git_commit": COMMIT_B,
                "published_at": "2026-10-15T00:00:00Z",
            }
        )
        body = publish.index_bytes(index)
        self.store.objects["releases.json"].update(body=body, sha256=sha256(body), etag='"other"')

    def test_releases_json_changing_before_the_manifest_stops_short_of_writing_it(self):
        self.publish(self.staged())
        last_file = f"files/{sha256(FILES_2['NOTICE.txt'])}/NOTICE.txt"
        data_file = f"files/{sha256(FILES_2['Data.json'])}/Data.json"

        def another_publish(key):
            if key == data_file:
                self._another_publish_lists("2026.10.2")

        self.store.before_put = another_publish
        with self.assertRaisesRegex(Refusal, "before its manifest was written.*again"):
            self.publish(self.staged("2026.11.1", FILES_2))
        self.assertIn(data_file, self.store.objects)
        self.assertIn(last_file, self.store.objects)
        self.assertNotIn("releases/2026.11.1/manifest.json", self.store.objects)

        self.store.before_put = None
        self.publish(self.staged("2026.11.1", FILES_2))
        manifest = json.loads(self.store.objects["releases/2026.11.1/manifest.json"]["body"])
        self.assertEqual(manifest["previous_release"], "2026.10.2")
        self.assertEqual(
            [r["release"] for r in self.store.index()["releases"]],
            ["2026.10.1", "2026.10.2", "2026.11.1"],
        )

    def test_a_lost_response_to_the_releases_json_put_counts_as_listed(self):
        def lost_response(key):
            if key == "releases.json":
                raise PreconditionFailed(key)

        self.store.after_put = lost_response
        result = self.publish(self.staged())
        self.assertTrue(result["listed"])
        releases = self.store.index()["releases"]
        self.assertEqual([r["release"] for r in releases], ["2026.10.1"])
        self.assertEqual(releases[0]["manifest_sha256"], result["manifest_sha256"])

    def test_a_listing_of_another_manifest_under_this_release_is_not_success(self):
        def another_listing(key):
            if key == "releases/2026.10.1/manifest.json":
                body = publish.index_bytes(publish.empty_index())
                self.store.objects["releases.json"] = {"body": body, "sha256": sha256(body)}
                self._another_publish_lists("2026.10.1")

        self.store.after_put = another_listing
        with self.assertRaisesRegex(Refusal, "releases.json changed after"):
            self.publish(self.staged())

    def test_r2s_checksum_is_trusted_over_the_metadata(self):
        self.store.reports_checksum_sha256 = True
        data = FILES_1["Data.json"]
        key = f"files/{sha256(data)}/Data.json"
        self.store.objects[key] = {"body": data, "sha256": "0" * 64, "etag": '"x"'}
        self.publish(self.staged())
        self.assertNotIn(key, self.store.puts)

    def test_r2s_checksum_catches_bytes_the_metadata_vouches_for(self):
        data = FILES_1["Data.json"]
        key = f"files/{sha256(data)}/Data.json"
        other_bytes_of_the_same_size = b'{"a": 9}\n'
        self.store.objects[key] = {
            "body": other_bytes_of_the_same_size,
            "sha256": sha256(data),
            "etag": '"x"',
        }
        self.store.reports_checksum_sha256 = True
        with self.assertRaisesRegex(Refusal, "ChecksumSHA256"):
            self.publish(self.staged())
        self.store.reports_checksum_sha256 = False
        self.store.objects = {key: self.store.objects[key]}
        self.publish(self.staged())

    def test_an_object_another_writer_uploads_first_is_accepted_when_identical(self):
        data = FILES_1["Data.json"]
        key = f"files/{sha256(data)}/Data.json"

        def another_writer(put_key):
            if put_key == key and key not in self.store.objects:
                self.store.objects[key] = {"body": data, "sha256": sha256(data), "etag": '"o"'}

        self.store.before_put = another_writer
        result = self.publish(self.staged())
        self.assertNotIn(key, result["uploaded"])

    def test_an_object_another_writer_uploads_first_with_other_bytes_is_refused(self):
        key = f"files/{sha256(FILES_1['Data.json'])}/Data.json"

        def another_writer(put_key):
            if put_key == key and key not in self.store.objects:
                self.store.objects[key] = {"body": b"x", "sha256": sha256(b"x"), "etag": '"o"'}

        self.store.before_put = another_writer
        with self.assertRaisesRegex(Refusal, "written by someone else"):
            self.publish(self.staged())

    def test_a_staged_file_that_doesnt_match_its_manifest_is_refused_before_uploading(self):
        staged = self.staged()
        next((staged / "files").rglob("Data.json")).write_bytes(b"tampered")
        with self.assertRaisesRegex(Refusal, "doesn't match its manifest entry"):
            self.publish(staged)
        self.assertEqual(self.store.puts, [])

    def test_an_invalid_releases_json_is_refused(self):
        entry = {
            "manifest_sha256": "0" * 64,
            "git_commit": COMMIT_A,
            "published_at": "2026-10-01T00:00:00Z",
        }
        cases = {
            "not JSON": b"{",
            "the wrong schema": b'{"index_schema": "x", "releases": []}',
            "a duplicate release": publish.index_bytes(
                {
                    "index_schema": publish.INDEX_SCHEMA,
                    "releases": [
                        dict(entry, release="2026.10.1"),
                        dict(entry, release="2026.10.1"),
                    ],
                }
            ),
            "releases out of order": publish.index_bytes(
                {
                    "index_schema": publish.INDEX_SCHEMA,
                    "releases": [
                        dict(entry, release="2026.11.1"),
                        dict(entry, release="2026.10.2"),
                    ],
                }
            ),
        }
        for label, body in cases.items():
            with self.subTest(label):
                self.store.objects["releases.json"] = {
                    "body": body,
                    "sha256": sha256(body),
                    "etag": '"1"',
                }
                with self.assertRaises(Refusal):
                    self.publish(self.staged("2026.12.1"))
                self.assertEqual(self.store.puts, [])

    def test_release_ids_compare_numerically(self):
        self.publish(self.staged("2026.10.9"))
        self.publish(self.staged("2026.10.10", FILES_2))
        self.assertEqual(
            [r["release"] for r in self.store.index()["releases"]], ["2026.10.9", "2026.10.10"]
        )


class VerifyTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.store = FakeStore()
        publish.publish(self.store, stage(self.tmp / "a", "2026.10.1", FILES_1), log=quiet)
        publish.publish(self.store, stage(self.tmp / "b", "2026.11.1", FILES_2), log=quiet)

    def tearDown(self):
        self._tmp.cleanup()

    def verify(self, release="2026.11.1", hash_files=True):
        return publish.verify(
            self.store, release, hash_files=hash_files, workdir=self.tmp, log=quiet
        )

    def test_a_published_release_verifies(self):
        for release in ("2026.10.1", "2026.11.1"):
            self.assertEqual(self.verify(release)["files"], 2)

    def test_a_missing_file_fails(self):
        del self.store.objects[f"files/{sha256(FILES_2['Data.json'])}/Data.json"]
        with self.assertRaisesRegex(Refusal, "doesn't exist"):
            self.verify()

    def test_a_file_of_the_wrong_size_fails(self):
        key = f"files/{sha256(FILES_2['Data.json'])}/Data.json"
        self.store.objects[key]["body"] += b" "
        with self.assertRaisesRegex(Refusal, "reads back"):
            self.verify(hash_files=False)

    def test_a_file_with_other_bytes_of_the_same_size_fails_only_when_hashed(self):
        key = f"files/{sha256(FILES_2['Data.json'])}/Data.json"
        self.store.objects[key]["body"] = b'{"a": 3}\n'
        self.verify(hash_files=False)
        with self.assertRaisesRegex(Refusal, "bytes don't match"):
            self.verify()

    def test_an_unlisted_release_fails(self):
        with self.assertRaisesRegex(Refusal, "doesn't list 2026.12.1"):
            self.verify("2026.12.1")

    def test_a_manifest_that_disagrees_with_releases_json_fails(self):
        key = "releases/2026.11.1/manifest.json"
        body = self.store.objects[key]["body"].replace(b"2026.10.1", b"2026.09.1")
        self.store.objects[key].update(body=body, sha256=sha256(body))
        with self.assertRaisesRegex(Refusal, "isn't the"):
            self.verify()

    def test_no_releases_json_fails(self):
        del self.store.objects["releases.json"]
        with self.assertRaisesRegex(Refusal, "lists no releases"):
            self.verify()


class CommandLineTests(unittest.TestCase):
    def test_missing_secrets_fail_naming_them(self):
        cases = {
            "both": ({}, "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY secrets"),
            "the secret key": ({"AWS_ACCESS_KEY_ID": "x"}, "R2_SECRET_ACCESS_KEY secret "),
            "the key ID": (
                {"AWS_SECRET_ACCESS_KEY": "x", "AWS_ACCESS_KEY_ID": ""},
                "R2_ACCESS_KEY_ID secret ",
            ),
        }
        env = {"R2_BUCKET": "b", "R2_ENDPOINT": "https://example.r2.cloudflarestorage.com"}
        for label, (credentials, message) in cases.items():
            with self.subTest(label):
                stderr = io.StringIO()
                with redirect_stderr(stderr):
                    status = publish.main(["verify"], env={**env, **credentials})
                self.assertEqual(status, 1)
                self.assertIn(message, stderr.getvalue())

    def run_main(self, argv, store):
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            status = publish.main(argv, env={}, store=store)
        return status, stderr.getvalue()

    def test_a_missing_staged_directory_is_refused_without_a_traceback(self):
        with tempfile.TemporaryDirectory() as tmp:
            status, stderr = self.run_main(["publish", str(Path(tmp) / "missing")], FakeStore())
        self.assertEqual(status, 1)
        self.assertTrue(stderr.startswith("Refused: "), stderr)

    def test_an_object_deleted_during_verify_is_refused_without_a_traceback(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            publish.publish(store, stage(Path(tmp) / "a", "2026.10.1", FILES_1), log=quiet)

        def download(key, path):
            raise FileNotFoundError("An error occurred (NoSuchKey)")

        store.download = download
        with redirect_stdout(io.StringIO()):
            status, stderr = self.run_main(["verify", "--release", "2026.10.1"], store)
        self.assertEqual(status, 1)
        self.assertIn("Refused: files/", stderr)

    def test_store_errors_are_refused_without_a_traceback(self):
        class Broken(FakeStore):
            def get(self, key):
                raise publish.StoreError("aws s3api get-object failed: AccessDenied")

        status, stderr = self.run_main(["verify", "--release", "2026.10.1"], Broken())
        self.assertEqual(
            (status, stderr.strip()), (1, "Refused: aws s3api get-object failed: AccessDenied")
        )


def push_paths(workflow: Path) -> list[str]:
    lines = workflow.read_text().splitlines()
    start = lines.index("  push:")
    paths, in_paths = [], False
    for line in lines[start + 1 :]:
        if line and not line.startswith("    "):
            break
        stripped = line.strip()
        if stripped == "paths:":
            in_paths = True
        elif in_paths and stripped.startswith("- "):
            paths.append(stripped[2:].strip("'\""))
        elif in_paths and stripped and not stripped.startswith("#"):
            in_paths = False
    return paths


class WorkflowTriggerTests(unittest.TestCase):
    def test_every_release_input_root_triggers_both_workflows(self):
        roots = json.loads((package.LANGUAGE_DATA / "release-inputs.json").read_text())["roots"]
        workflows = package.REPO_ROOT / ".github" / "workflows"
        for name in ("language-data-build.yml", "language-data-release.yml"):
            filters = push_paths(workflows / name)
            self.assertTrue(filters, name)
            prefixes = [f[: -len("/**")] for f in filters if f.endswith("/**")]
            for root, path in roots.items():
                with self.subTest(workflow=name, root=root):
                    self.assertTrue(
                        any(path == p or path.startswith(p + "/") for p in prefixes),
                        f"{name} doesn't trigger on {path}/** ({root}): {filters}",
                    )


class AwsCliStoreTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.replies = []
        self.store = publish.AwsCliStore(
            "bucket", "https://account.r2.cloudflarestorage.com", run=self.fake_run
        )

    def fake_run(self, command, capture_output, text):
        self.calls.append(command)
        returncode, stdout, stderr = self.replies.pop(0)
        return subprocess.CompletedProcess(command, returncode, stdout, stderr)

    def test_put_is_conditional_and_carries_its_checksum(self):
        self.replies.append((0, '{"ETag": "\\"e\\""}', ""))
        data = b"bytes"
        self.store.put(
            "files/x/Data.json", data, sha256=sha256(data), content_type="application/json",
            cache_control=publish.IMMUTABLE, if_none_match=True,
        )
        command = self.calls[0]
        self.assertEqual(command[:3], ["aws", "s3api", "put-object"])
        options = dict(zip(command[3::2], command[4::2]))
        self.assertEqual(options["--bucket"], "bucket")
        self.assertEqual(options["--key"], "files/x/Data.json")
        self.assertEqual(options["--if-none-match"], "*")
        self.assertEqual(options["--metadata"], f"sha256={sha256(data)}")
        self.assertEqual(
            options["--checksum-sha256"], base64.b64encode(hashlib.sha256(data).digest()).decode()
        )
        self.assertEqual(options["--endpoint-url"], "https://account.r2.cloudflarestorage.com")
        self.assertNotIn("--if-match", options)

    def test_errors_are_classified(self):
        self.replies.append(
            (254, "", "An error occurred (404) when calling the HeadObject operation: Not Found")
        )
        self.assertIsNone(self.store.head("missing"))
        self.replies.append(
            (254, "", "An error occurred (NoSuchKey) when calling the GetObject operation")
        )
        self.assertIsNone(self.store.get("missing"))
        self.replies.append(
            (254, "", "An error occurred (PreconditionFailed) when calling the PutObject operation")
        )
        with self.assertRaises(PreconditionFailed):
            self.store.put(
                "k", b"", sha256=sha256(b""), content_type="x", cache_control="y", if_match='"e"'
            )
        self.assertEqual(dict(zip(self.calls[-1][3::2], self.calls[-1][4::2]))["--if-match"], '"e"')
        self.replies.append(
            (255, "", "An error occurred (AccessDenied) when calling the HeadObject operation")
        )
        with self.assertRaisesRegex(publish.StoreError, "AccessDenied"):
            self.store.head("k")

    def test_head_reads_size_and_sha256_metadata(self):
        self.replies.append(
            (0, json.dumps({"ContentLength": 5, "ETag": '"e"', "Metadata": {"sha256": "ab"}}), "")
        )
        self.assertEqual(self.store.head("k"), Head(5, "ab", '"e"'))
        options = dict(zip(self.calls[0][3::2], self.calls[0][4::2]))
        self.assertEqual(options["--checksum-mode"], "ENABLED")

    def test_head_reads_r2s_checksum_when_it_returns_one(self):
        digest = hashlib.sha256(b"body").digest()
        response = {
            "ContentLength": 4,
            "ETag": '"e"',
            "ChecksumSHA256": base64.b64encode(digest).decode(),
            "Metadata": {"sha256": "ab"},
        }
        self.replies.append((0, json.dumps(response), ""))
        head = self.store.head("k")
        self.assertEqual(head.checksum_sha256, digest.hex())
        self.assertEqual(head.reported_sha256(), (digest.hex(), "ChecksumSHA256"))

    def test_a_checksum_of_checksums_isnt_taken_for_the_objects(self):
        self.assertIsNone(publish.checksum_hex("abcd-3"))
        self.assertIsNone(publish.checksum_hex(None))
        self.assertIsNone(publish.checksum_hex(base64.b64encode(b"short").decode()))

    def test_get_puts_the_outfile_last(self):
        def reply(command, capture_output, text):
            self.calls.append(command)
            Path(command[-1]).write_bytes(b"body")
            return subprocess.CompletedProcess(command, 0, '{"ETag": "\\"e\\""}', "")

        self.store.run = reply
        self.assertEqual(self.store.get("releases.json"), (b"body", '"e"'))
        self.assertEqual(self.calls[0][:3], ["aws", "s3api", "get-object"])


if __name__ == "__main__":
    unittest.main()
