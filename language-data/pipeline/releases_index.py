from __future__ import annotations

import json

from locations import LANGUAGE_DATA
from object_store import Store
from refusal import Refusal

INDEX_KEY = "releases.json"
INDEX_SCHEMA = "zenbu.language-data-releases.v1"
INDEX_SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-releases.v1.schema.json"


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
