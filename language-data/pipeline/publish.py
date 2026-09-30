#!/usr/bin/env python3
"""Publish a packaged language-data release to R2, and verify it (issue 463, step 3).

  publish.py publish DIR      upload DIR (from `package.py build`) and list it in releases.json
  publish.py verify           check a published release: its manifest and every file it lists

The bucket holds, in the order they're written:

  files/<sha256>/<name>              each file, content-addressed; never overwritten
  releases/<release>/manifest.json   each release's manifest; never overwritten
  releases.json                      every release, oldest first; only ever appended to

`publish` fills the manifest's previous_release and previous_manifest_sha256 from the latest entry
in releases.json, then uploads. It never overwrites a file or a manifest. When the release is
already published with the same content (everything but git_commit and workflow_run), it's a
no-op; when the content differs, it refuses: bump language-data/release.json to publish new
content. Each upload is conditional (If-None-Match: *) and sends its SHA-256
(x-amz-checksum-sha256), which R2 checks against the bytes it receives. Each object is then read
back for its size and SHA-256: R2's ChecksumSHA256 when it returns one, otherwise the
x-amz-meta-sha256 the upload recorded, which only says what the uploader meant to send. `verify
--hash all` downloads and hashes every file, which is the check that doesn't rely on either.

The bucket is reached through the AWS CLI at R2's S3 endpoint, with AWS_ACCESS_KEY_ID and
AWS_SECRET_ACCESS_KEY set from the R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY secrets. Only the
`Language data release` workflow runs it; never upload from a workstation.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

import package
from package import Refusal

INDEX_KEY = "releases.json"
INDEX_SCHEMA = "zenbu.language-data-releases.v1"
INDEX_SCHEMA_PATH = package.LANGUAGE_DATA / "schemas" / "language-data-releases.v1.schema.json"
# Fields that say how a manifest was produced rather than what the release contains, so a rerun
# from another commit or workflow run still counts as the same release.
PROVENANCE = ("git_commit", "workflow_run")
IMMUTABLE = "public, max-age=31536000, immutable"
MUTABLE = "no-cache"
CONTENT_TYPES = {
    ".json": "application/json",
    ".sqlite3": "application/vnd.sqlite3",
    ".gz": "application/gzip",
    ".js": "text/javascript; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".sql": "application/sql",
}
CREDENTIALS = {
    "AWS_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
}


# --- The bucket --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Head:
    size: int
    sha256: str | None  # x-amz-meta-sha256: what the uploader said it sent; R2 doesn't check it
    etag: str
    # ChecksumSHA256, in hex: the SHA-256 R2 checked on upload and stored, when it returns one.
    checksum_sha256: str | None = None

    def reported_sha256(self) -> tuple[str | None, str]:
        """The SHA-256 to trust, and where it came from: R2's checksum, else the metadata."""
        if self.checksum_sha256 is not None:
            return self.checksum_sha256, "ChecksumSHA256"
        return self.sha256, "x-amz-meta-sha256"


class PreconditionFailed(Exception):
    """A conditional put lost: the object exists (If-None-Match) or changed (If-Match)."""


class StoreError(Exception):
    """Any other failure talking to the bucket."""


class Store(Protocol):
    def head(self, key: str) -> Head | None: ...

    def get(self, key: str) -> tuple[bytes, str] | None:
        """The object's bytes and ETag, or None when it doesn't exist."""

    def download(self, key: str, path: Path) -> None: ...

    def put(
        self,
        key: str,
        body: bytes | Path,
        *,
        sha256: str,
        content_type: str,
        cache_control: str,
        if_none_match: bool = False,
        if_match: str | None = None,
    ) -> None:
        """Raises PreconditionFailed when a condition fails."""


def checksum_hex(value: str | None) -> str | None:
    """A full-object ChecksumSHA256 (base64) in hex. None when there's none, or when it isn't one
    (a multipart upload's checksum of checksums ends in -<parts>)."""
    if not value:
        return None
    try:
        digest = base64.b64decode(value, validate=True)
    except ValueError:
        return None
    return digest.hex() if len(digest) == 32 else None


class AwsCliStore:
    """An R2 bucket through `aws s3api`, at the account's S3 endpoint."""

    def __init__(self, bucket: str, endpoint: str, run: Callable = subprocess.run):
        self.bucket, self.endpoint, self.run = bucket, endpoint, run

    def _call(self, operation: str, *args: str, outfile: Path | None = None) -> dict:
        command = [
            "aws", "s3api", operation, "--bucket", self.bucket, *args,
            "--endpoint-url", self.endpoint, "--output", "json",
            *([str(outfile)] if outfile is not None else []),
        ]  # fmt: skip
        result = self.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            error = (result.stderr or "").strip()
            if any(code in error for code in ("(404)", "NoSuchKey", "Not Found")):
                raise FileNotFoundError(error)
            if any(code in error for code in ("(412)", "PreconditionFailed", "(409)")):
                raise PreconditionFailed(error)
            raise StoreError(f"aws s3api {operation} failed: {error}")
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def head(self, key: str) -> Head | None:
        try:
            response = self._call("head-object", "--key", key, "--checksum-mode", "ENABLED")
        except FileNotFoundError:
            return None
        metadata = {name.lower(): value for name, value in (response.get("Metadata") or {}).items()}
        return Head(
            int(response["ContentLength"]),
            metadata.get("sha256"),
            response.get("ETag", ""),
            checksum_hex(response.get("ChecksumSHA256")),
        )

    def download(self, key: str, path: Path) -> None:
        self._call("get-object", "--key", key, outfile=path)

    def get(self, key: str) -> tuple[bytes, str] | None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "object"
            try:
                response = self._call("get-object", "--key", key, outfile=path)
            except FileNotFoundError:
                return None
            return path.read_bytes(), response.get("ETag", "")

    def put(
        self,
        key: str,
        body: bytes | Path,
        *,
        sha256: str,
        content_type: str,
        cache_control: str,
        if_none_match: bool = False,
        if_match: str | None = None,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            if isinstance(body, bytes):
                path = Path(tmp) / "body"
                path.write_bytes(body)
            else:
                path = body
            args = [
                "--key", key, "--body", str(path),
                "--content-type", content_type, "--cache-control", cache_control,
                "--metadata", f"sha256={sha256}",
                "--checksum-sha256", base64.b64encode(bytes.fromhex(sha256)).decode(),
            ]  # fmt: skip
            if if_none_match:
                args += ["--if-none-match", "*"]
            if if_match is not None:
                args += ["--if-match", if_match]
            self._call("put-object", *args)


# --- releases.json -----------------------------------------------------------------------------


def release_key(release: str) -> tuple[int, ...]:
    return tuple(int(part) for part in release.split("."))


def empty_index() -> dict:
    return {"index_schema": INDEX_SCHEMA, "releases": []}


def validate_index(index: dict) -> None:
    import jsonschema

    schema = json.loads(INDEX_SCHEMA_PATH.read_text())
    errors = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(index),
        key=lambda e: list(e.absolute_path),
    )
    if errors:
        raise Refusal(
            "releases.json doesn't match its schema:\n"
            + "\n".join(
                f"  {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in errors
            )
        )
    releases = [entry["release"] for entry in index["releases"]]
    for earlier, later in zip(releases, releases[1:]):
        if release_key(later) <= release_key(earlier):
            raise Refusal(f"releases.json lists {later} after {earlier}: releases must increase")


def index_bytes(index: dict) -> bytes:
    return (json.dumps(index, indent=2, ensure_ascii=False) + "\n").encode()


def read_index(store: Store) -> tuple[dict, str | None]:
    """releases.json and its ETag, or an empty index and None when there's none yet."""
    got = store.get(INDEX_KEY)
    if got is None:
        return empty_index(), None
    data, etag = got
    try:
        index = json.loads(data)
    except json.JSONDecodeError as error:
        raise Refusal(f"releases.json isn't JSON: {error}") from None
    validate_index(index)
    return index, etag


# --- Publishing --------------------------------------------------------------------------------


def sha256_of(body: bytes | Path) -> str:
    if isinstance(body, bytes):
        return hashlib.sha256(body).hexdigest()
    digest = hashlib.sha256()
    with body.open("rb") as file:
        while chunk := file.read(package.CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def content_type(name: str) -> str:
    return CONTENT_TYPES.get(Path(name).suffix, "application/octet-stream")


def file_key(record: dict) -> str:
    return f"files/{record['sha256']}/{record['name']}"


def manifest_key(release: str) -> str:
    return f"releases/{release}/manifest.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def check_object(key: str, head: Head, sha256: str, size: int, what: str) -> None:
    reported, source = head.reported_sha256()
    if head.size != size or reported != sha256:
        raise Refusal(
            f"{key} {what} with {head.size} bytes and {source} {reported}, not {size} bytes and "
            f"sha256 {sha256}. Published objects are never overwritten: find out how it got there."
        )


def put_immutable(store: Store, key: str, body: bytes | Path, sha256: str, size: int) -> bool:
    """Upload an object that must never change, unless it's already there with these bytes.
    True when this call uploaded it."""
    head = store.head(key)
    if head is not None:
        check_object(key, head, sha256, size, "already exists")
        return False
    try:
        store.put(
            key,
            body,
            sha256=sha256,
            content_type=content_type(key),
            cache_control=IMMUTABLE,
            if_none_match=True,
        )
    except PreconditionFailed:
        # Another writer got there between the check and the put: accept it only if it's the same.
        head = store.head(key)
        if head is None:
            raise StoreError(f"{key}: the conditional put failed, but the object doesn't exist")
        check_object(key, head, sha256, size, "was written by someone else")
        return False
    head = store.head(key)
    if head is None:
        raise StoreError(f"{key} is missing after its upload")
    check_object(key, head, sha256, size, "reads back")
    return True


def content(manifest: dict) -> dict:
    return {key: value for key, value in manifest.items() if key not in PROVENANCE}


def check_same_release(published: dict, manifest: dict) -> None:
    ours, theirs = content(manifest), content(published)
    if ours == theirs:
        return
    fields = sorted(key for key in ours.keys() | theirs.keys() if ours.get(key) != theirs.get(key))
    detail = ""
    if "files" in fields:
        before = {f["name"]: f["sha256"] for f in published.get("files", [])}
        after = {f["name"]: f["sha256"] for f in manifest["files"]}
        changed = sorted(n for n in before.keys() | after.keys() if before.get(n) != after.get(n))
        detail = f" (files: {', '.join(changed) or 'order or metadata'})"
    raise Refusal(
        f"release {manifest['release']} is already published with different content, in "
        f"{', '.join(fields)}{detail}. Published releases are never overwritten: bump "
        "language-data/release.json to publish this content."
    )


def publish(store: Store, staged: Path, *, now: Callable[[], str] = utc_now, log=print) -> dict:
    """Publish the release `package.py build` staged in `staged`. Returns what it did."""
    manifest = json.loads((staged / "manifest.json").read_text())
    release = manifest["release"]
    index, etag = read_index(store)
    entries = index["releases"]
    position = next((i for i, e in enumerate(entries) if e["release"] == release), None)
    if position is None:
        if entries and release_key(release) <= release_key(entries[-1]["release"]):
            raise Refusal(
                f"release {release} isn't after the latest published release, "
                f"{entries[-1]['release']}: bump language-data/release.json"
            )
        previous = entries[-1] if entries else None
    else:
        previous = entries[position - 1] if position > 0 else None

    # The link to the previous release, then the checks `package.py validate` makes, again.
    manifest["previous_release"] = previous["release"] if previous else None
    manifest["previous_manifest_sha256"] = previous["manifest_sha256"] if previous else None
    package.write_manifest(staged, manifest)
    package.validate(staged)

    key = manifest_key(release)
    published = store.get(key)
    if published is not None:
        body = published[0]
        check_same_release(json.loads(body), manifest)
        log(f"{key} is already published with this content; it stays as it is.")
    elif position is not None:
        raise Refusal(f"releases.json lists {release}, but {key} doesn't exist")
    else:
        body = package.manifest_bytes(manifest)
    manifest_sha256 = sha256_of(body)
    if position is not None and entries[position]["manifest_sha256"] != manifest_sha256:
        raise Refusal(
            f"releases.json lists {release} with manifest sha256 "
            f"{entries[position]['manifest_sha256']}, but {key} has {manifest_sha256}"
        )

    # 1. The files. 2. The manifest, once every file it names is there. 3. releases.json.
    uploaded = []
    for record in manifest["files"]:
        object_key = file_key(record)
        if put_immutable(store, object_key, staged / object_key, record["sha256"], record["bytes"]):
            uploaded.append(object_key)
            log(f"Uploaded {object_key}")
        else:
            log(f"Already there: {object_key}")
    if published is None:
        # The manifest's previous_release came from the releases.json read at the start. If another
        # publish listed a release since, this manifest would link to the wrong one, and once
        # written it can't be replaced, so stop while nothing but content-addressed files is up.
        if read_index(store)[1] != etag:
            raise Refusal(
                "releases.json changed while this release was publishing, before its manifest "
                f"was written. Only content-addressed files were uploaded, and {key} wasn't, so "
                "running the workflow again links the manifest to the new latest release."
            )
        put_immutable(store, key, body, manifest_sha256, len(body))
        uploaded.append(key)
        log(f"Uploaded {key}")

    listed = position is None
    if listed:
        entry = {
            "release": release,
            "manifest_sha256": manifest_sha256,
            "git_commit": json.loads(body)["git_commit"],
            "published_at": now(),
        }
        updated = {"index_schema": INDEX_SCHEMA, "releases": [*entries, entry]}
        validate_index(updated)
        data = index_bytes(updated)
        try:
            store.put(
                INDEX_KEY,
                data,
                sha256=sha256_of(data),
                content_type="application/json",
                cache_control=MUTABLE,
                if_none_match=etag is None,
                if_match=etag,
            )
        except PreconditionFailed:
            # Either this put succeeded and its response was lost (a retry then fails its own
            # condition), or another write got in after the check before the manifest.
            current, _ = read_index(store)
            if any(
                e["release"] == release and e["manifest_sha256"] == manifest_sha256
                for e in current["releases"]
            ):
                log(f"releases.json already lists {release} with this manifest.")
            else:
                raise Refusal(
                    f"releases.json changed after {key} was written, so {release} isn't listed. "
                    "The manifest can't be replaced, and its previous_release may not be the "
                    "latest release any more, so running the workflow again won't list it. It "
                    "stays in the bucket, unlisted and unused: bump language-data/release.json "
                    "to publish this content under a new ID."
                ) from None
        else:
            head = store.head(INDEX_KEY)
            if head is None:
                raise StoreError("releases.json is missing after its upload")
            check_object(INDEX_KEY, head, sha256_of(data), len(data), "reads back")
            after = previous["release"] if previous else "nothing"
            log(f"Listed {release} in releases.json, after {after}")
    else:
        log(f"releases.json already lists {release}.")
    return {
        "release": release,
        "manifest_sha256": manifest_sha256,
        "previous_release": manifest["previous_release"],
        "uploaded": uploaded,
        "listed": listed,
    }


# --- Verifying ---------------------------------------------------------------------------------


def verify(store: Store, release: str, *, hash_files: bool, workdir: Path, log=print) -> dict:
    """Read releases.json and the release's manifest back, and check every file it lists exists
    with its size and SHA-256 metadata; with hash_files, download and hash each one too."""
    index, _ = read_index(store)
    if not index["releases"]:
        raise Refusal("releases.json is missing or lists no releases")
    entries = index["releases"]
    position = next((i for i, e in enumerate(entries) if e["release"] == release), None)
    if position is None:
        raise Refusal(f"releases.json doesn't list {release}")
    entry = entries[position]
    previous = entries[position - 1] if position > 0 else None

    key = manifest_key(release)
    got = store.get(key)
    if got is None:
        raise Refusal(f"{key} doesn't exist")
    body = got[0]
    if sha256_of(body) != entry["manifest_sha256"]:
        raise Refusal(f"{key}'s sha256 isn't the {entry['manifest_sha256']} releases.json lists")
    manifest = json.loads(body)
    package.validate_manifest(manifest)
    expected = {
        "release": release,
        "git_commit": entry["git_commit"],
        "previous_release": previous["release"] if previous else None,
        "previous_manifest_sha256": previous["manifest_sha256"] if previous else None,
    }
    for field, value in expected.items():
        if manifest[field] != value:
            raise Refusal(f"{key}'s {field} is {manifest[field]!r}, not {value!r}")
    head = store.head(key)
    if head is None:
        raise Refusal(f"{key} doesn't exist")
    check_object(key, head, entry["manifest_sha256"], len(body), "reads back")

    for record in manifest["files"]:
        object_key = file_key(record)
        head = store.head(object_key)
        if head is None:
            raise Refusal(f"{object_key} doesn't exist")
        check_object(object_key, head, record["sha256"], record["bytes"], "reads back")
        if hash_files:
            path = workdir / "object"
            try:
                store.download(object_key, path)
            except FileNotFoundError:
                raise Refusal(f"{object_key} disappeared while it was being verified") from None
            try:
                if path.stat().st_size != record["bytes"] or sha256_of(path) != record["sha256"]:
                    raise Refusal(f"{object_key}'s bytes don't match its manifest entry")
            finally:
                path.unlink(missing_ok=True)
    how = "size, SHA-256 metadata and bytes" if hash_files else "size and SHA-256 metadata"
    log(
        f"Release {release} is published: releases.json, {key} (sha256 {entry['manifest_sha256']}) "
        f"and {len(manifest['files'])} files, each checked for its {how}."
    )
    return {"release": release, "files": len(manifest["files"]), "hashed": hash_files}


# --- Command line ------------------------------------------------------------------------------


def missing_credentials(env=os.environ) -> list[str]:
    return [secret for variable, secret in CREDENTIALS.items() if not env.get(variable)]


def main(argv: list[str] | None = None, env=os.environ, store: Store | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--bucket", default=env.get("R2_BUCKET"), help="default: $R2_BUCKET")
    parser.add_argument(
        "--endpoint", default=env.get("R2_ENDPOINT"), help="the S3 endpoint; default: $R2_ENDPOINT"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    publish_parser = commands.add_parser("publish")
    publish_parser.add_argument("staged", type=Path, help="the directory `package.py build` wrote")
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument(
        "--release", help="default: the release in language-data/release.json"
    )
    verify_parser.add_argument(
        "--hash", choices=["all", "none"], default="all", help="download and hash every file"
    )
    args = parser.parse_args(argv)

    try:
        if store is None:
            missing = missing_credentials(env)
            if missing:
                raise Refusal(
                    f"missing the {' and '.join(missing)} secret{'s' if len(missing) > 1 else ''} "
                    "of the language-data-release environment (an R2 token scoped to the bucket)"
                )
            if not args.bucket or not args.endpoint:
                raise Refusal("the bucket and its S3 endpoint are needed (R2_BUCKET, R2_ENDPOINT)")
            store = AwsCliStore(args.bucket, args.endpoint)
        if args.command == "publish":
            result = publish(store, args.staged)
            print(
                f"Published release {result['release']} (manifest sha256 "
                f"{result['manifest_sha256']}, after {result['previous_release'] or 'nothing'}): "
                f"{len(result['uploaded'])} objects uploaded"
                + ("" if result["listed"] else ", already listed in releases.json")
            )
        else:
            release = (
                args.release
                or package.load_release(package.LANGUAGE_DATA / "release.json")["release"]
            )
            with tempfile.TemporaryDirectory() as tmp:
                verify(store, release, hash_files=args.hash == "all", workdir=Path(tmp))
    # OSError covers FileNotFoundError: a missing staged file, or an object deleted mid-run.
    except (Refusal, StoreError, PreconditionFailed, OSError, json.JSONDecodeError) as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
