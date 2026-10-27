from __future__ import annotations

import json

from bucket_objects import manifest_key
from committed_files import sha256_of
from json_schemas import check_against_schema
from locations import LANGUAGE_DATA
from object_store import Store
from refusal import Refusal
from release_manifest import validate_manifest

INDEX_KEY = "releases.json"
INDEX_SCHEMA = "zenbu.language-data-releases.v1"
INDEX_SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-releases.v1.schema.json"


def release_key(release: str) -> tuple[int, ...]:
    return tuple(int(part) for part in release.split("."))


def empty_index() -> dict:
    return {"index_schema": INDEX_SCHEMA, "releases": []}


def validate_index(index: dict) -> None:
    check_against_schema(index, INDEX_SCHEMA_PATH, INDEX_KEY)
    releases = [entry["release"] for entry in index["releases"]]
    for earlier, later in zip(releases, releases[1:]):
        if release_key(later) <= release_key(earlier):
            raise Refusal(f"releases.json lists {later} after {earlier}: releases must increase")


def index_bytes(index: dict) -> bytes:
    return (json.dumps(index, indent=2, ensure_ascii=False) + "\n").encode()


def read_index(store: Store) -> tuple[dict, str | None]:
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


def read_listed_manifest(store: Store, entry: dict) -> tuple[bytes, dict]:
    key = manifest_key(entry["release"])
    got = store.get(key)
    if got is None:
        raise Refusal(f"releases.json lists {entry['release']}, but {key} doesn't exist")
    body = got[0]
    if sha256_of(body) != entry["manifest_sha256"]:
        raise Refusal(f"{key}'s sha256 isn't the {entry['manifest_sha256']} releases.json lists")
    manifest = json.loads(body)
    validate_manifest(manifest)
    return body, manifest
