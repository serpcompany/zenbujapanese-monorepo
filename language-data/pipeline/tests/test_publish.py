from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bucket_objects
import release_manifest
import releases_index
from publish_fixtures import COMMIT_A, COMMIT_B, FILES_1, FILES_2, PublishTestCase, sha256
from refusal import Refusal


class PublishTests(PublishTestCase):
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
        release_manifest.validate_manifest(manifest)
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
        self.assertEqual(self.store.objects[data_key]["cache_control"], bucket_objects.IMMUTABLE)
        self.assertEqual(self.store.objects["releases.json"]["cache_control"], bucket_objects.MUTABLE)
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
        body = releases_index.index_bytes(index)
        self.store.objects["releases.json"].update(body=body, sha256=sha256(body))
        with self.assertRaisesRegex(Refusal, "releases.json lists 2026.10.1 with manifest sha256"):
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
            "a duplicate release": releases_index.index_bytes(
                {
                    "index_schema": releases_index.INDEX_SCHEMA,
                    "releases": [
                        dict(entry, release="2026.10.1"),
                        dict(entry, release="2026.10.1"),
                    ],
                }
            ),
            "releases out of order": releases_index.index_bytes(
                {
                    "index_schema": releases_index.INDEX_SCHEMA,
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


if __name__ == "__main__":
    unittest.main()
