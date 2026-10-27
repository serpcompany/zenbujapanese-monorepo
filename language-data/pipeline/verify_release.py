from __future__ import annotations

from pathlib import Path

from bucket_objects import check_published, download_checked, file_key, manifest_key
from compressed_copies import verify_compressed_copies
from object_store import Store
from pinned_release import check_pinned
from refusal import Refusal
from releases_index import read_index, read_listed_manifest


def verify(
    store: Store, release: str, pinned: dict, *, hash_files: bool, workdir: Path, log=print
) -> dict:
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
    body, manifest = read_listed_manifest(store, entry)
    expected = {
        "release": release,
        "git_commit": entry["git_commit"],
        "previous_release": previous["release"] if previous else None,
        "previous_manifest_sha256": previous["manifest_sha256"] if previous else None,
    }
    for field, value in expected.items():
        if manifest[field] != value:
            raise Refusal(f"{key}'s {field} is {manifest[field]!r}, not {value!r}")
    check_pinned(manifest, pinned, key)
    check_published(store, key, entry["manifest_sha256"], len(body))

    for record in manifest["files"]:
        object_key = file_key(record)
        check_published(store, object_key, record["sha256"], record["bytes"])
        if hash_files:
            path = workdir / "object"
            download_checked(store, object_key, path, record["sha256"], record["bytes"])
            path.unlink()
    parts = verify_compressed_copies(
        store, manifest, entry["manifest_sha256"], hash_files=hash_files, workdir=workdir
    )
    how = "size, SHA-256 metadata and bytes" if hash_files else "size and SHA-256 metadata"
    log(
        f"Release {release} is published: releases.json, {key} (sha256 {entry['manifest_sha256']}), "
        f"{len(manifest['files'])} files and {parts} gzipped parts, each checked for its {how}."
    )
    return {
        "release": release,
        "files": len(manifest["files"]),
        "compressed_parts": parts,
        "hashed": hash_files,
    }
