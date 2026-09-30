from __future__ import annotations

import hashlib
from pathlib import Path

from committed_files import CHUNK
from object_store import Head, PreconditionFailed, Store, StoreError
from refusal import Refusal

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


def sha256_of(body: bytes | Path) -> str:
    if isinstance(body, bytes):
        return hashlib.sha256(body).hexdigest()
    digest = hashlib.sha256()
    with body.open("rb") as file:
        while chunk := file.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def content_type(name: str) -> str:
    return CONTENT_TYPES.get(Path(name).suffix, "application/octet-stream")


def file_key(record: dict) -> str:
    return f"files/{record['sha256']}/{record['name']}"


def manifest_key(release: str) -> str:
    return f"releases/{release}/manifest.json"


def check_object(key: str, head: Head, sha256: str, size: int, what: str) -> None:
    reported, source = head.reported_sha256()
    if head.size != size or reported != sha256:
        raise Refusal(
            f"{key} {what} with {head.size} bytes and {source} {reported}, not {size} bytes and "
            f"sha256 {sha256}. Published objects are never overwritten: find out how it got there."
        )


def put_immutable(store: Store, key: str, body: bytes | Path, sha256: str, size: int) -> bool:
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
