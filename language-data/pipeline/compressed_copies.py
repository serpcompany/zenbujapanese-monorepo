from __future__ import annotations

import gzip
import hashlib
import json
import tempfile
from pathlib import Path

from bucket_objects import check_published, download_checked, file_key, put_immutable
from committed_files import sha256_of
from json_schemas import check_against_schema
from locations import LANGUAGE_DATA
from object_store import Store
from refusal import Refusal
from releases_index import read_index, read_listed_manifest

COMPRESSED_SCHEMA = "zenbu.language-data-compressed.v1"
SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-compressed.v1.schema.json"
PART_BYTES = 32 * 1024 * 1024
GZIP_LEVEL = 9
COMPRESSED_SUFFIXES = {".sqlite3", ".json"}
DOWNLOADED_SOURCE = "source"


def compressed_key(release: str) -> str:
    return f"releases/{release}/compressed.json"


def part_key(name: str, sha256: str, number: int) -> str:
    return f"files/{sha256}/{name}.part{number}.gz"


def compressible(manifest: dict) -> list[dict]:
    return [r for r in manifest["files"] if Path(r["name"]).suffix in COMPRESSED_SUFFIXES]


def pack(chunk: bytes) -> bytes:
    return gzip.compress(chunk, compresslevel=GZIP_LEVEL, mtime=0)


def unpack_failure(file: dict) -> Refusal:
    return Refusal(f"{file['name']}'s gzipped parts don't unpack to its sha256 {file['sha256']}")


def stored_part(name: str, data: bytes, number: int, folder: Path) -> tuple[dict, Path]:
    digest = hashlib.sha256(data).hexdigest()
    path = folder / f"{number}.gz"
    path.write_bytes(data)
    return {"key": part_key(name, digest, number), "bytes": len(data), "sha256": digest}, path


def pack_file(record: dict, source: Path, folder: Path) -> list[tuple[dict, Path]]:
    folder.mkdir()
    read, unpacked = hashlib.sha256(), hashlib.sha256()
    parts: list[tuple[dict, Path]] = []
    with source.open("rb") as file:
        while True:
            chunk = file.read(PART_BYTES)
            if parts and not chunk:
                break
            data = pack(chunk)
            read.update(chunk)
            unpacked.update(gzip.decompress(data))
            parts.append(stored_part(record["name"], data, len(parts) + 1, folder))
            if len(chunk) < PART_BYTES:
                break
    if read.hexdigest() != record["sha256"]:
        raise Refusal(f"{file_key(record)} doesn't match its manifest entry")
    if unpacked.hexdigest() != record["sha256"]:
        raise unpack_failure(record)
    return parts


def source_of(store: Store, staged: Path, record: dict, workdir: Path) -> Path:
    staged_file = staged / file_key(record)
    if staged_file.is_file():
        return staged_file
    downloaded = workdir / DOWNLOADED_SOURCE
    try:
        store.download(file_key(record), downloaded)
    except FileNotFoundError:
        raise Refusal(f"{file_key(record)} doesn't exist") from None
    return downloaded


def document_bytes(document: dict) -> bytes:
    return (json.dumps(document, indent=2, ensure_ascii=False) + "\n").encode()


def publish_release_copies(
    store: Store, staged: Path, manifest: dict, manifest_sha256: str, *, log
) -> list[str]:
    release = manifest["release"]
    files, packed = [], []
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for position, record in enumerate(compressible(manifest)):
            source = source_of(store, staged, record, workdir)
            parts = pack_file(record, source, workdir / f"{position}")
            (workdir / DOWNLOADED_SOURCE).unlink(missing_ok=True)
            files.append(
                {
                    "name": record["name"],
                    "sha256": record["sha256"],
                    "bytes": record["bytes"],
                    "parts": [part for part, _ in parts],
                }
            )
            packed += parts
        document = {
            "compressed_schema": COMPRESSED_SCHEMA,
            "release": release,
            "manifest_sha256": manifest_sha256,
            "part_bytes": PART_BYTES,
            "files": files,
        }
        key = compressed_key(release)
        check_against_schema(document, SCHEMA_PATH, key)
        uploaded = []
        for part, path in packed:
            if put_immutable(store, part["key"], path, part["sha256"], part["bytes"]):
                uploaded.append(part["key"])
                log(f"Uploaded {part['key']}")
    body = document_bytes(document)
    put_immutable(store, key, body, sha256_of(body), len(body))
    log(f"Uploaded {key}: {len(packed)} gzipped parts of {len(files)} files")
    return [*uploaded, key]


def publish_compressed_copies(
    store: Store, staged: Path, *, log=print
) -> tuple[list[str], list[str]]:
    index, _ = read_index(store)
    releases, uploaded = [], []
    for entry in index["releases"]:
        if store.head(compressed_key(entry["release"])) is not None:
            continue
        _, manifest = read_listed_manifest(store, entry)
        uploaded += publish_release_copies(
            store, staged, manifest, entry["manifest_sha256"], log=log
        )
        releases.append(entry["release"])
    return releases, uploaded


def verify_compressed_copies(
    store: Store, manifest: dict, manifest_sha256: str, *, hash_files: bool, workdir: Path
) -> int:
    release = manifest["release"]
    key = compressed_key(release)
    got = store.get(key)
    if got is None:
        raise Refusal(f"{key} doesn't exist")
    document = json.loads(got[0])
    check_against_schema(document, SCHEMA_PATH, key)
    if (document["release"], document["manifest_sha256"]) != (release, manifest_sha256):
        raise Refusal(f"{key} isn't for release {release}'s manifest, sha256 {manifest_sha256}")
    listed = [(f["name"], f["sha256"], f["bytes"]) for f in document["files"]]
    if listed != [(r["name"], r["sha256"], r["bytes"]) for r in compressible(manifest)]:
        raise Refusal(f"{key} lists other files than the manifest's SQLite and JSON files")
    size = document["part_bytes"]
    for file in document["files"]:
        if len(file["parts"]) != max(1, -(-file["bytes"] // size)):
            raise Refusal(f"{key} doesn't split {file['name']} into parts of {size} bytes")
        unpacked = hashlib.sha256()
        for number, part in enumerate(file["parts"], start=1):
            if part["key"] != part_key(file["name"], part["sha256"], number):
                raise Refusal(f"{key} lists {part['key']}, which isn't its content-addressed key")
            check_published(store, part["key"], part["sha256"], part["bytes"])
            if hash_files:
                path = workdir / "part"
                download_checked(store, part["key"], path, part["sha256"], part["bytes"])
                data = gzip.decompress(path.read_bytes())
                path.unlink()
                if len(data) != min(size, file["bytes"] - (number - 1) * size):
                    raise Refusal(f"{part['key']} doesn't unpack to its {size}-byte part")
                unpacked.update(data)
        if hash_files and unpacked.hexdigest() != file["sha256"]:
            raise unpack_failure(file)
    return sum(len(file["parts"]) for file in document["files"])
