from __future__ import annotations

import copy
import gzip
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bucket_objects
import compressed_copies
import release_inputs
from publish_fixtures import COMMIT_B, PublishTestCase, sha256
from refusal import Refusal

SCHEMA = json.loads(compressed_copies.SCHEMA_PATH.read_text())
SMALL_PARTS = 100
FILES = {
    "Data.json": b'{"a": 1}\n' * 5,
    "Lookup.sqlite3": bytes(range(256)) * 3,
    "NOTICE.txt": b"notice\n",
}
LATER_FILES = {**FILES, "Data.json": b'{"a": 2}\n' * 5}


class CompressedCopiesTestCase(PublishTestCase):
    def setUp(self):
        super().setUp()
        small_parts = mock.patch.object(compressed_copies, "PART_BYTES", SMALL_PARTS)
        small_parts.start()
        self.addCleanup(small_parts.stop)

    def compressed(self, release="2026.10.1") -> dict:
        return json.loads(self.store.objects[compressed_copies.compressed_key(release)]["body"])

    def part_keys(self) -> list[str]:
        return [key for key in self.store.objects if key.endswith(".gz")]

    def forget_compressed_copies(self, release="2026.10.1"):
        for key in [*self.part_keys(), compressed_copies.compressed_key(release)]:
            del self.store.objects[key]
        self.store.puts.clear()

    def unpacked(self, document: dict, name: str) -> bytes:
        record = next(f for f in document["files"] if f["name"] == name)
        return b"".join(
            gzip.decompress(self.store.objects[part["key"]]["body"]) for part in record["parts"]
        )


class PublishCompressedCopiesTests(CompressedCopiesTestCase):
    def test_sqlite_and_json_files_are_published_in_gzipped_parts_after_the_listing(self):
        self.publish(self.staged(files=FILES))
        document = self.compressed()
        self.assertEqual([f["name"] for f in document["files"]], ["Data.json", "Lookup.sqlite3"])
        self.assertEqual(document["part_bytes"], SMALL_PARTS)
        lookup = document["files"][1]
        self.assertEqual(len(lookup["parts"]), 8)
        for record in document["files"]:
            self.assertEqual(self.unpacked(document, record["name"]), FILES[record["name"]])
            self.assertEqual(record["sha256"], sha256(FILES[record["name"]]))
            for number, part in enumerate(record["parts"], start=1):
                body = self.store.objects[part["key"]]["body"]
                self.assertEqual((part["sha256"], part["bytes"]), (sha256(body), len(body)))
                self.assertEqual(
                    part["key"], f"files/{part['sha256']}/{record['name']}.part{number}.gz"
                )
        listed = self.store.puts.index("releases.json")
        self.assertEqual(self.store.puts[-1], "releases/2026.10.1/compressed.json")
        self.assertEqual(set(self.store.puts[listed + 1 : -1]), set(self.part_keys()))
        manifest = self.store.objects["releases/2026.10.1/manifest.json"]["body"]
        self.assertEqual(document["manifest_sha256"], sha256(manifest))

    def test_an_exact_multiple_of_part_bytes_and_an_empty_file_verify_when_hashed(self):
        files = {**FILES, "Even.json": b"x" * (2 * SMALL_PARTS), "Empty.json": b""}
        self.publish(self.staged(files=files))
        document = self.compressed()
        parts = {f["name"]: len(f["parts"]) for f in document["files"]}
        self.assertEqual((parts["Even.json"], parts["Empty.json"]), (2, 1))
        body = self.store.objects["releases/2026.10.1/manifest.json"]["body"]
        verified = compressed_copies.verify_compressed_copies(
            self.store, json.loads(body), sha256(body), hash_files=True, workdir=self.tmp
        )
        self.assertEqual(verified, sum(parts.values()))

    def test_each_part_is_gzip_data_uploaded_with_no_content_encoding(self):
        self.publish(self.staged(files=FILES))
        for key in self.part_keys():
            with self.subTest(key):
                stored = self.store.objects[key]
                self.assertEqual(stored["content_type"], "application/gzip")
                self.assertEqual(stored["cache_control"], bucket_objects.IMMUTABLE)
                self.assertEqual(stored["other_headers"], {})
                self.assertEqual(stored["body"][:2], b"\x1f\x8b")

    def test_compressed_json_is_written_once_and_never_overwritten(self):
        self.publish(self.staged(files=FILES))
        key = compressed_copies.compressed_key("2026.10.1")
        hand_edited = self.store.objects[key]["body"].replace(b"\n", b"\r\n")
        self.store.objects[key].update(body=hand_edited, sha256=sha256(hand_edited))
        before = copy.deepcopy(self.store.objects)
        self.store.puts.clear()
        self.publish(self.staged(files=FILES, commit=COMMIT_B))
        self.assertEqual(self.store.puts, [])
        self.assertEqual(self.store.objects, before)

    def test_a_rerun_publishes_nothing_new(self):
        self.publish(self.staged(files=FILES))
        before = copy.deepcopy(self.store.objects)
        self.store.puts.clear()
        result = self.publish(self.staged(files=FILES), when="2026-10-02T00:00:00Z")
        self.assertEqual((self.store.puts, result["compressed"]), ([], []))
        self.assertEqual(self.store.objects, before)

    def test_a_part_that_doesnt_unpack_to_its_files_sha256_fails_the_publish(self):
        def pack_a_byte_too_many(chunk: bytes) -> bytes:
            return gzip.compress(chunk + b" ", mtime=0)

        with mock.patch.object(compressed_copies, "pack", pack_a_byte_too_many):
            with self.assertRaisesRegex(Refusal, r"Data\.json's gzipped parts don't unpack to"):
                self.publish(self.staged(files=FILES))
        self.assertEqual(self.part_keys(), [])
        self.assertNotIn("releases/2026.10.1/compressed.json", self.store.objects)
        self.store.puts.clear()
        self.assertEqual(self.publish(self.staged(files=FILES))["compressed"], ["2026.10.1"])

    def test_an_earlier_release_with_none_gets_them_on_the_next_release(self):
        self.publish(self.staged(files=FILES))
        self.forget_compressed_copies()
        result = self.publish(self.staged("2026.11.1", LATER_FILES), when="2026-11-01T00:00:00Z")
        self.assertEqual(result["compressed"], ["2026.10.1", "2026.11.1"])
        earlier, later = self.compressed("2026.10.1"), self.compressed("2026.11.1")
        self.assertEqual(self.unpacked(earlier, "Data.json"), FILES["Data.json"])
        self.assertEqual(self.unpacked(later, "Data.json"), LATER_FILES["Data.json"])
        self.assertEqual(earlier["files"][1]["parts"], later["files"][1]["parts"])

    def test_a_published_release_with_none_gets_them_when_the_workflow_runs_again(self):
        self.publish(self.staged(files=FILES))
        self.forget_compressed_copies()
        result = self.publish(self.staged(files=FILES))
        self.assertEqual(result["compressed"], ["2026.10.1"])
        self.assertNotIn("releases.json", self.store.puts)
        self.assertEqual(self.store.puts[-1], "releases/2026.10.1/compressed.json")

    def test_an_earlier_releases_file_with_other_bytes_in_the_bucket_fails_the_publish(self):
        self.publish(self.staged(files=FILES))
        self.forget_compressed_copies()
        key = f"files/{sha256(FILES['Data.json'])}/Data.json"
        self.store.objects[key]["body"] = FILES["Data.json"].upper()
        with self.assertRaisesRegex(Refusal, f"{key} doesn't match its manifest entry"):
            self.publish(self.staged("2026.11.1", LATER_FILES))
        self.assertEqual(self.part_keys(), [])

    def test_an_earlier_releases_file_missing_from_the_bucket_fails_the_publish(self):
        self.publish(self.staged(files=FILES))
        self.forget_compressed_copies()
        key = f"files/{sha256(FILES['Data.json'])}/Data.json"
        del self.store.objects[key]
        with self.assertRaisesRegex(Refusal, f"{key} doesn't exist"):
            self.publish(self.staged("2026.11.1", LATER_FILES))
        self.assertNotIn("releases/2026.10.1/compressed.json", self.store.objects)


class CompressedSchemaTests(CompressedCopiesTestCase):
    def setUp(self):
        super().setUp()
        self.publish(self.staged(files=FILES))
        self.document = self.compressed()
        self.validator = jsonschema.Draft202012Validator(SCHEMA)

    def test_the_schema_is_valid_draft_2020_12(self):
        jsonschema.Draft202012Validator.check_schema(SCHEMA)

    def test_the_compressed_json_the_publisher_writes_matches_its_schema(self):
        self.validator.validate(self.document)
        self.assertEqual(self.document["compressed_schema"], "zenbu.language-data-compressed.v1")

    def test_the_schema_refuses_a_part_without_its_sha256_or_outside_files(self):
        changes = {
            "no sha256": lambda d: d["files"][0]["parts"][0].pop("sha256"),
            "outside files/": lambda d: d["files"][0]["parts"][0].update(key="Data.json.part1.gz"),
            "no parts": lambda d: d["files"][0].update(parts=[]),
        }
        for label, change in changes.items():
            with self.subTest(label):
                document = copy.deepcopy(self.document)
                change(document)
                self.assertFalse(self.validator.is_valid(document))

    def test_the_schema_and_the_packager_share_the_name_and_release_patterns(self):
        file = SCHEMA["properties"]["files"]["items"]["properties"]
        self.assertEqual(file["name"]["pattern"], release_inputs.NAME.pattern)
        self.assertEqual(SCHEMA["properties"]["release"]["pattern"], release_inputs.RELEASE.pattern)


if __name__ == "__main__":
    unittest.main()
