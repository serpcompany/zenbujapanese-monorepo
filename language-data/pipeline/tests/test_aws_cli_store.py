from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bucket_objects
import object_store
from object_store import Head, PreconditionFailed, StoreError
from publish_fixtures import sha256


class AwsCliStoreTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.replies = []
        self.store = object_store.AwsCliStore(
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
            cache_control=bucket_objects.IMMUTABLE, if_none_match=True,
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
        with self.assertRaisesRegex(StoreError, "AccessDenied"):
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
        self.assertIsNone(object_store.checksum_hex("abcd-3"))
        self.assertIsNone(object_store.checksum_hex(None))
        self.assertIsNone(object_store.checksum_hex(base64.b64encode(b"short").decode()))

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
