from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import releases_index
from object_store import PreconditionFailed
from publish_fixtures import COMMIT_B, FILES_1, FILES_2, PublishTestCase, sha256
from refusal import Refusal


class PublishConflictTests(PublishTestCase):
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
                body = releases_index.index_bytes(releases_index.empty_index())
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
        body = releases_index.index_bytes(index)
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
                body = releases_index.index_bytes(releases_index.empty_index())
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


if __name__ == "__main__":
    unittest.main()
