from __future__ import annotations

import hashlib
import json
from pathlib import Path

from committed_files import CHUNK
from locations import LANGUAGE_DATA
from refusal import Refusal

MANIFEST_SCHEMA = "zenbu.language-data-manifest.v1"
ENT_SEQ_DIGEST = "sha256-ascending-decimal-lf"
SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-manifest.v1.schema.json"


def manifest_bytes(manifest: dict) -> bytes:
    return (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()


def write_manifest(out: Path, manifest: dict) -> None:
    (out / "manifest.json").write_bytes(manifest_bytes(manifest))


def validate(out: Path, schema_path: Path = SCHEMA_PATH) -> dict:
    manifest = json.loads((out / "manifest.json").read_text())
    validate_manifest(manifest, schema_path)

    expected = {f"files/{f['sha256']}/{f['name']}": f for f in manifest["files"]}
    present = (
        {p.relative_to(out).as_posix() for p in (out / "files").rglob("*") if p.is_file()}
        if (out / "files").exists()
        else set()
    )
    if present != set(expected):
        raise Refusal(
            f"staged files differ from the manifest: missing {sorted(set(expected) - present)}, "
            f"extra {sorted(present - set(expected))}"
        )
    for relative, record in expected.items():
        path = out / relative
        digest = hashlib.sha256()
        with path.open("rb") as file:
            while chunk := file.read(CHUNK):
                digest.update(chunk)
        if digest.hexdigest() != record["sha256"] or path.stat().st_size != record["bytes"]:
            raise Refusal(f"{relative} doesn't match its manifest entry")
    return manifest


def validate_manifest(manifest: dict, schema_path: Path = SCHEMA_PATH) -> None:
    import jsonschema

    schema = json.loads(schema_path.read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    errors = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(manifest),
        key=lambda e: list(e.absolute_path),
    )
    if errors:
        raise Refusal(
            "manifest.json doesn't match the schema:\n"
            + "\n".join(
                f"  {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in errors
            )
        )

    names = [f["name"] for f in manifest["files"]] + [s["name"] for s in manifest["sources"]]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise Refusal(f"names used more than once: {duplicates}")
    for item in manifest["files"] + manifest["sources"]:
        unknown = [name for name in item["depends_on"] if name not in names or name == item["name"]]
        if unknown:
            raise Refusal(
                f"{item['name']} depends on {unknown}, which aren't other files or sources in "
                "the release"
            )
    if manifest["ids"]["file"] not in [f["name"] for f in manifest["files"]]:
        raise Refusal(f"ids.file {manifest['ids']['file']} isn't a file in the release")
