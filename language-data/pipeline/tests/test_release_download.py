from __future__ import annotations

import copy
import http.client
import io
import json
import sys
import unittest
import urllib.error
import urllib.parse
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import check_download
import compressed_copies
from bucket_objects import file_key
from locations import LANGUAGE_DATA
from pinned_release import load_pinned
from public_address import USER_AGENT, DownloadError, PublicAddress
from publish_fixtures import COMMIT_B, PublishTestCase, sha256
from refusal import Refusal
from release_download import FIRST_SET, GZIPPED, PUBLISHED
from release_download import check_download as check
from release_inputs import load_release

ADDRESS = "https://data.example.test"
RELEASE = "2026.10.1"
SMALL_PARTS = 100
DATABASE = "LanguageReferenceData.sqlite3"
KUROMOJI = "Kuromoji/base.dat.gz"
FILES = {
    **{name: f"{name}\n".encode() * 3 for name in FIRST_SET},
    DATABASE: bytes(range(256)) * 3,
    "NOTICE.txt": b"notice\n",
}
DOCUMENT_REQUESTS = 3
EARLIER, LATER = "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"


class Response(io.BytesIO):
    def __init__(self, body: bytes, etag: str, breaks: bool):
        super().__init__(body)
        self.headers = {"ETag": etag}
        self.breaks = breaks

    def read(self, size=-1):
        if self.breaks and self.tell():
            raise http.client.IncompleteRead(b"")
        return super().read(1 if self.breaks else size)


class FakeAddress:
    def __init__(self, store):
        self.store, self.requests, self.status, self.breaks = store, [], None, None

    def key(self, request) -> str:
        return urllib.parse.unquote(request.full_url.removeprefix(f"{ADDRESS}/"))

    def urlopen(self, request, timeout):
        self.requests.append(request)
        key = self.key(request)
        found = self.store.objects.get(key)
        status = self.status or (200 if found else 404)
        if status != 200:
            raise urllib.error.HTTPError(request.full_url, status, "refused", {}, None)
        return Response(found["body"], found["etag"], key == self.breaks)

    def keys(self) -> list[str]:
        return [self.key(request) for request in self.requests]


def published_key(name: str) -> str:
    return file_key({"name": name, "sha256": sha256(FILES[name])})


class ReleaseDownloadTestCase(PublishTestCase):
    def setUp(self):
        super().setUp()
        self.publish_release(RELEASE, FILES)
        self.published = copy.deepcopy(self.store.objects)
        self.address = FakeAddress(self.store)
        self.lines: list[str] = []

    def publish_release(self, release: str, files: dict[str, bytes], when=EARLIER, **options):
        options.setdefault("schemas", FIRST_SET)
        with mock.patch.object(compressed_copies, "PART_BYTES", SMALL_PARTS):
            self.publish(self.staged(release, files, **options), when)

    def reset(self):
        self.store.objects = copy.deepcopy(self.published)
        self.address.requests.clear()
        self.lines.clear()

    def check(self, release: str | None = RELEASE) -> dict:
        address = PublicAddress(f"{ADDRESS}/", self.address.urlopen)
        return check(address, release, log=self.lines.append)

    def compressed(self) -> dict:
        return json.loads(self.store.objects[compressed_copies.compressed_key(RELEASE)]["body"])

    def compressed_files(self) -> dict[str, dict]:
        return {file["name"]: file for file in self.compressed()["files"]}

    def replace(self, key: str, body: bytes):
        self.store.objects[key]["body"] = body

    def relist_part(self, number: int, body: bytes):
        document = self.compressed()
        part = next(f for f in document["files"] if f["name"] == DATABASE)["parts"][number]
        self.replace(part["key"], body)
        part.update(bytes=len(body), sha256=sha256(body))
        key = compressed_copies.compressed_key(RELEASE)
        self.replace(key, compressed_copies.document_bytes(document))


class CheckDownloadTests(ReleaseDownloadTestCase):
    def test_the_first_set_downloads_both_ways_and_every_file_matches_its_manifest(self):
        result = self.check()
        self.assertEqual(result["failures"], [])
        compressed = self.compressed_files()
        self.assertEqual(len(compressed[DATABASE]["parts"]), 8)
        gzipped = [
            [part["key"] for part in compressed[name]["parts"]]
            if name in compressed
            else [published_key(name)]
            for name in FIRST_SET
        ]
        keys = self.address.keys()[DOCUMENT_REQUESTS:]
        self.assertEqual(keys[: -len(FIRST_SET)], [key for keys in gzipped for key in keys])
        self.assertEqual(keys[-len(FIRST_SET) :], [published_key(name) for name in FIRST_SET])
        sizes = {key: len(obj["body"]) for key, obj in self.store.objects.items()}
        self.assertEqual(
            result["downloaded"],
            {
                GZIPPED: sum(sizes[key] for key in keys[: -len(FIRST_SET)]),
                PUBLISHED: sum(len(FILES[name]) for name in FIRST_SET),
            },
        )
        self.assertEqual({r.get_header("User-agent") for r in self.address.requests}, {USER_AGENT})
        log = "\n".join(self.lines)
        self.assertIn(f"{GZIPPED}: {DATABASE}: 8 parts, ", log)
        self.assertIn(f"{GZIPPED}: {KUROMOJI}: no gzipped copy, so as published: ", log)
        self.assertIn(f"{GZIPPED}: 19 of 19 files match the manifest", log)

    def test_a_file_that_differs_as_published_fails_that_way_alone(self):
        self.replace(published_key("KanjiReferenceData.json"), b"changed")
        failures = self.check()["failures"]
        self.assertEqual(len(failures), 1)
        self.assertTrue(
            failures[0].startswith(
                f"{PUBLISHED}: KanjiReferenceData.json: got 7 bytes with sha256 {sha256(b'changed')}"
            ),
            failures[0],
        )

    def test_a_part_that_differs_fails_the_gzipped_way_naming_the_part(self):
        original = self.store.objects[self.compressed_files()[DATABASE]["parts"][1]["key"]]["body"]
        cases = {
            "another gzip stream": (compressed_copies.pack(b"x"), False, "compressed.json lists"),
            "not gzip": (b"not gzip", False, "doesn't unpack as gzip"),
            "data after the stream": (original + b"junk", True, "isn't one whole gzip stream"),
            "a cut stream": (original[:-8], True, "isn't one whole gzip stream"),
        }
        for label, (body, relisted, reason) in cases.items():
            with self.subTest(label):
                self.reset()
                if relisted:
                    self.relist_part(1, body)
                else:
                    self.replace(self.compressed_files()[DATABASE]["parts"][1]["key"], body)
                part = self.compressed_files()[DATABASE]["parts"][1]["key"]
                failures = self.check()["failures"]
                self.assertEqual(len(failures), 1, failures)
                self.assertTrue(failures[0].startswith(f"{GZIPPED}: {DATABASE}: {part}"))
                self.assertIn(reason, failures[0])

    def test_a_missing_file_fails_both_ways_and_the_rest_are_still_checked(self):
        del self.store.objects[published_key(KUROMOJI)]
        result = self.check()
        missing = f"{published_key(KUROMOJI)} answered 404"
        self.assertEqual(
            result["failures"],
            [f"{way}: {KUROMOJI}: {missing}" for way in (GZIPPED, PUBLISHED)],
        )
        matched = [line for line in self.lines if line.endswith("as the manifest lists")]
        self.assertEqual(len(matched), 2 * len(FIRST_SET) - 2)

    def test_a_download_that_stops_partway_fails_that_file(self):
        self.address.breaks = published_key(DATABASE)
        failures = self.check()["failures"]
        self.assertEqual(len(failures), 1)
        self.assertTrue(failures[0].startswith(f"{PUBLISHED}: {DATABASE}: "), failures[0])
        self.assertIn("stopped downloading", failures[0])

    def test_a_first_set_file_the_manifest_does_not_list_fails_both_ways(self):
        files = {name: data for name, data in FILES.items() if name != "RetiredEntries.json"}
        self.publish_release("2026.10.2", files, commit=COMMIT_B)
        result = self.check("2026.10.2")
        self.assertEqual(
            result["failures"],
            [
                f"{way}: RetiredEntries.json: the manifest doesn't list it"
                for way in (GZIPPED, PUBLISHED)
            ],
        )

    def test_a_first_set_file_of_another_schema_fails_both_ways(self):
        cases = {"another version": "zenbu.compound-pitch.v2", "no schema": None}
        for number, (label, schema) in enumerate(cases.items(), start=2):
            with self.subTest(label):
                release = f"2026.10.{number}"
                schemas = {**FIRST_SET, "CompoundPitch.sqlite3": schema}
                self.publish_release(release, FILES, commit=COMMIT_B, schemas=schemas)
                reason = (
                    f"the manifest lists {schema or 'no schema'}, not zenbu.compound-pitch.v1, "
                    "which the extension reads"
                )
                self.assertEqual(
                    self.check(release)["failures"],
                    [f"{way}: CompoundPitch.sqlite3: {reason}" for way in (GZIPPED, PUBLISHED)],
                )

    def test_without_a_release_it_checks_the_newest_by_publication(self):
        self.publish_release("2026.10.2", FILES, LATER, commit=COMMIT_B)
        self.assertEqual(self.check(None)["release"], "2026.10.2")
        index = json.loads(self.store.objects["releases.json"]["body"])
        index["releases"][0]["published_at"] = "2026-10-03T00:00:00Z"
        self.replace("releases.json", json.dumps(index).encode())
        result = self.check(None)
        self.assertEqual((result["release"], result["failures"]), (RELEASE, []))

    def test_without_a_release_an_empty_index_is_refused(self):
        del self.store.objects["releases.json"]
        with self.assertRaisesRegex(Refusal, "releases.json lists no release"):
            self.check(None)

    def test_a_release_that_is_not_published_whole_is_refused(self):
        manifest = f"releases/{RELEASE}/manifest.json"
        compressed = compressed_copies.compressed_key(RELEASE)
        cases = {
            "not listed": (lambda objects: None, "2026.10.9", "releases.json doesn't list"),
            "no releases.json": (lambda objects: objects.pop("releases.json"), RELEASE, "list"),
            "another manifest": (
                lambda objects: objects[manifest].update(body=b"{}"),
                RELEASE,
                "sha256 isn't the",
            ),
            "no compressed.json": (
                lambda objects: objects.pop(compressed),
                RELEASE,
                f"{compressed} doesn't exist",
            ),
        }
        for label, (change, release, reason) in cases.items():
            with self.subTest(label):
                self.reset()
                change(self.store.objects)
                with self.assertRaisesRegex(Refusal, reason):
                    self.check(release)

    def test_an_address_that_refuses_a_request_is_a_download_error(self):
        self.address.status = 403
        with self.assertRaisesRegex(DownloadError, "releases.json answered HTTP 403"):
            self.check()


class CommandLineTests(ReleaseDownloadTestCase):
    def run_command(self, *argv: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            status = check_download.main(["--address", ADDRESS, *argv], self.address.urlopen)
        return status, stdout.getvalue(), stderr.getvalue()

    def test_a_first_set_that_matches_both_ways_passes(self):
        status, stdout, stderr = self.run_command("--release", RELEASE)
        self.assertEqual((status, stderr), (0, ""))
        self.assertTrue(
            stdout.endswith(
                f"Release {RELEASE}'s first set, 19 files, downloaded both ways: every SHA-256 "
                "matches the manifest.\n"
            ),
            stdout,
        )

    def test_without_a_release_it_checks_the_newest(self):
        self.publish_release("2026.10.2", FILES, LATER, commit=COMMIT_B)
        status, stdout, stderr = self.run_command()
        self.assertEqual((status, stderr), (0, ""))
        self.assertIn("Release 2026.10.2: its manifest has the sha256", stdout)
        self.assertTrue(stdout.endswith("every SHA-256 matches the manifest.\n"), stdout)

    def test_a_mismatch_fails_and_lists_each_failure(self):
        self.replace(published_key(KUROMOJI), b"changed")
        status, _, stderr = self.run_command("--release", RELEASE)
        self.assertEqual(status, 1)
        self.assertTrue(stderr.startswith(f"Refused: 2 of 38 downloads of release {RELEASE}'s"))
        self.assertIn(f"  {GZIPPED}: {KUROMOJI}: got 7 bytes", stderr)
        self.assertIn(f"  {PUBLISHED}: {KUROMOJI}: got 7 bytes", stderr)

    def test_a_refusal_is_reported_without_a_traceback(self):
        status, _, stderr = self.run_command("--release", "2026.10.9")
        self.assertEqual((status, stderr), (1, "Refused: releases.json doesn't list 2026.10.9\n"))


class FirstSetTests(unittest.TestCase):
    def test_the_first_set_is_19_files_of_the_pinned_release_with_its_schemas(self):
        release = load_release(LANGUAGE_DATA / "release.json")["release"]
        files = load_pinned(LANGUAGE_DATA / "releases", release)["files"]
        pinned = {f["name"]: f["artifact_schema"] for f in files}
        self.assertEqual(len(FIRST_SET), 19)
        self.assertEqual({name: pinned.get(name, "unlisted") for name in FIRST_SET}, FIRST_SET)


if __name__ == "__main__":
    unittest.main()
