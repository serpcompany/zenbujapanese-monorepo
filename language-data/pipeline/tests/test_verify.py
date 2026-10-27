from __future__ import annotations

import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import verify_release
from publish_fixtures import FILES_1, FILES_2, FakeStore, pinned_of, publish, quiet, sha256, stage
from refusal import Refusal


class VerifyTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.store = FakeStore()
        self.pinned = {
            "2026.10.1": pinned_of(stage(self.tmp / "a", "2026.10.1", FILES_1)),
            "2026.11.1": pinned_of(stage(self.tmp / "b", "2026.11.1", FILES_2)),
        }
        publish(self.store, self.tmp / "a")
        publish(self.store, self.tmp / "b")

    def tearDown(self):
        self._tmp.cleanup()

    def verify(self, release="2026.11.1", hash_files=True):
        return verify_release.verify(
            self.store,
            release,
            self.pinned.get(release),
            hash_files=hash_files,
            workdir=self.tmp,
            log=quiet,
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

    def test_a_published_manifest_that_differs_from_the_pinned_one_fails(self):
        self.pinned["2026.11.1"]["files"][0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(Refusal, r"pinned manifest in files: Data\.json \(sha256\)"):
            self.verify()

    def test_no_releases_json_fails(self):
        del self.store.objects["releases.json"]
        with self.assertRaisesRegex(Refusal, "lists no releases"):
            self.verify()

    def rewrite_compressed(self, change) -> None:
        key = "releases/2026.11.1/compressed.json"
        document = json.loads(self.store.objects[key]["body"])
        change(document)
        body = json.dumps(document).encode()
        self.store.objects[key].update(body=body, sha256=sha256(body))

    def data_part(self) -> dict:
        document = json.loads(self.store.objects["releases/2026.11.1/compressed.json"]["body"])
        return document["files"][0]["parts"][0]

    def test_a_published_release_verifies_its_compressed_copies(self):
        self.assertEqual(self.verify()["compressed_parts"], 1)

    def test_a_missing_compressed_json_fails(self):
        del self.store.objects["releases/2026.11.1/compressed.json"]
        with self.assertRaisesRegex(Refusal, "compressed.json doesn't exist"):
            self.verify(hash_files=False)

    def test_a_missing_part_fails(self):
        del self.store.objects[self.data_part()["key"]]
        with self.assertRaisesRegex(Refusal, r"Data\.json\.part1\.gz doesn't exist"):
            self.verify(hash_files=False)

    def test_compressed_copies_of_other_files_than_the_manifests_fail(self):
        self.rewrite_compressed(lambda d: d["files"][0].update(sha256="0" * 64))
        with self.assertRaisesRegex(Refusal, "lists other files than"):
            self.verify(hash_files=False)

    def store_data_parts(self, chunks, part_bytes=None) -> None:
        parts = []
        for number, chunk in enumerate(chunks, start=1):
            body = gzip.compress(chunk, mtime=0)
            key = f"files/{sha256(body)}/Data.json.part{number}.gz"
            self.store.objects[key] = {"body": body, "sha256": sha256(body), "etag": '"p"'}
            parts.append({"key": key, "bytes": len(body), "sha256": sha256(body)})

        def change(document):
            document["files"][0]["parts"] = parts
            document["part_bytes"] = part_bytes or document["part_bytes"]

        self.rewrite_compressed(change)

    def test_a_part_that_doesnt_unpack_to_its_file_fails_only_when_hashed(self):
        self.store_data_parts([FILES_1["Data.json"]])
        self.verify(hash_files=False)
        with self.assertRaisesRegex(Refusal, r"Data\.json's gzipped parts don't unpack to"):
            self.verify()

    def test_a_file_split_into_the_wrong_number_of_parts_fails(self):
        data = FILES_2["Data.json"]
        self.store_data_parts([data[:4], data[4:]])
        with self.assertRaisesRegex(Refusal, r"doesn't split Data\.json into parts of"):
            self.verify(hash_files=False)

    def test_parts_split_at_other_offsets_than_part_bytes_fail_only_when_hashed(self):
        data = FILES_2["Data.json"]
        self.store_data_parts([data[:4], data[4:]], part_bytes=5)
        self.verify(hash_files=False)
        with self.assertRaisesRegex(Refusal, r"part1\.gz doesn't unpack to its 5-byte part"):
            self.verify()

    def test_a_part_with_other_bytes_of_the_same_size_fails_only_when_hashed(self):
        stored = self.store.objects[self.data_part()["key"]]
        stored["body"] = bytes(len(stored["body"]))
        self.verify(hash_files=False)
        with self.assertRaisesRegex(Refusal, "bytes don't match"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
