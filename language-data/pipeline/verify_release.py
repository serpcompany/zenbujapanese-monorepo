from __future__ import annotations

import json
from pathlib import Path

from bucket_objects import check_object, file_key, manifest_key, sha256_of
from object_store import Store
from refusal import Refusal
from release_manifest import validate_manifest
from releases_index import read_index


def verify(store: Store, release: str, *, hash_files: bool, workdir: Path, log=print) -> dict:
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
    validate_manifest(manifest)
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
