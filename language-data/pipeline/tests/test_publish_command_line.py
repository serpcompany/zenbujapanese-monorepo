from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import publish
from object_store import StoreError
from pinned_release import write_pinned
from publish_fixtures import FILES_1, FakeStore, stage
from publish_fixtures import publish as publish_staged


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

    def run_main(self, argv, store, releases: Path | None = None):
        stderr = io.StringIO()
        options = ["--releases", str(releases)] if releases else []
        with redirect_stderr(stderr):
            status = publish.main([*options, *argv], env={}, store=store)
        return status, stderr.getvalue()

    def pinned_releases(self, tmp: str) -> Path:
        staged = stage(Path(tmp) / "a", "2026.10.1", FILES_1)
        releases = Path(tmp) / "releases"
        write_pinned(releases, json.loads((staged / "manifest.json").read_text()))
        return releases

    def test_a_missing_staged_directory_is_refused_without_a_traceback(self):
        with tempfile.TemporaryDirectory() as tmp:
            status, stderr = self.run_main(["publish", str(Path(tmp) / "missing")], FakeStore())
        self.assertEqual(status, 1)
        self.assertTrue(stderr.startswith("Refused: "), stderr)

    def test_an_object_deleted_during_verify_is_refused_without_a_traceback(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            releases = self.pinned_releases(tmp)
            publish_staged(store, Path(tmp) / "a")

            def download(key, path):
                raise FileNotFoundError("An error occurred (NoSuchKey)")

            store.download = download
            with redirect_stdout(io.StringIO()):
                status, stderr = self.run_main(
                    ["verify", "--release", "2026.10.1"], store, releases
                )
        self.assertEqual(status, 1)
        self.assertIn("Refused: files/", stderr)

    def test_publish_refuses_a_release_that_has_no_pinned_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            staged = stage(Path(tmp) / "a", "2026.10.1", FILES_1)
            store = FakeStore()
            status, stderr = self.run_main(["publish", str(staged)], store, Path(tmp) / "none")
        self.assertEqual(status, 1)
        self.assertIn("release 2026.10.1 has no pinned manifest", stderr)
        self.assertEqual(store.puts, [])

    def test_store_errors_are_refused_without_a_traceback(self):
        class Broken(FakeStore):
            def get(self, key):
                raise StoreError("aws s3api get-object failed: AccessDenied")

        with tempfile.TemporaryDirectory() as tmp:
            status, stderr = self.run_main(
                ["verify", "--release", "2026.10.1"], Broken(), self.pinned_releases(tmp)
            )
        self.assertEqual(
            (status, stderr.strip()), (1, "Refused: aws s3api get-object failed: AccessDenied")
        )


if __name__ == "__main__":
    unittest.main()
