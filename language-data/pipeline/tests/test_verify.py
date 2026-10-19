from __future__ import annotations

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


if __name__ == "__main__":
    unittest.main()
