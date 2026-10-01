from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from bucket_objects import MUTABLE, check_object, file_key, manifest_key, put_immutable, sha256_of
from object_store import PreconditionFailed, Store, StoreError
from refusal import Refusal
from release_manifest import manifest_bytes, validate, write_manifest
from releases_index import (
    INDEX_KEY,
    INDEX_SCHEMA,
    index_bytes,
    read_index,
    release_key,
    validate_index,
)

PROVENANCE = ("git_commit", "workflow_run")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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

    manifest["previous_release"] = previous["release"] if previous else None
    manifest["previous_manifest_sha256"] = previous["manifest_sha256"] if previous else None
    write_manifest(staged, manifest)
    validate(staged)

    key = manifest_key(release)
    published = store.get(key)
    if published is not None:
        body = published[0]
        check_same_release(json.loads(body), manifest)
        log(f"{key} is already published with this content; it stays as it is.")
    elif position is not None:
        raise Refusal(f"releases.json lists {release}, but {key} doesn't exist")
    else:
        body = manifest_bytes(manifest)
    manifest_sha256 = sha256_of(body)
    if position is not None and entries[position]["manifest_sha256"] != manifest_sha256:
        raise Refusal(
            f"releases.json lists {release} with manifest sha256 "
            f"{entries[position]['manifest_sha256']}, but {key} has {manifest_sha256}"
        )

    uploaded = []
    for record in manifest["files"]:
        object_key = file_key(record)
        if put_immutable(store, object_key, staged / object_key, record["sha256"], record["bytes"]):
            uploaded.append(object_key)
            log(f"Uploaded {object_key}")
        else:
            log(f"Already there: {object_key}")
    if published is None:
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
