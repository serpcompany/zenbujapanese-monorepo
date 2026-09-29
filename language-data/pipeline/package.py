#!/usr/bin/env python3
"""Package a language-data release from the committed files (issue 463, step 2).

  package.py build --out DIR     write DIR/manifest.json and DIR/files/<sha256>/<name>
  package.py lfs-paths           print the Git LFS paths `build` reads, comma-separated
  package.py validate DIR        check DIR/manifest.json against the schema, and the files

Release 1 packages the files exactly as committed; nothing is rebuilt. `build` refuses any file
whose bytes differ from HEAD (a Git LFS file's oid and size, or any other file's Git blob), from
a conformance suite's pin, or from a pin in another release file. What goes in the release is
language-data/release-inputs.json; the release ID is language-data/release.json.

`build` needs only the standard library. `validate` needs `jsonschema` (requirements.txt).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

MANIFEST_SCHEMA = "zenbu.language-data-manifest.v1"
LANGUAGE_REFERENCE_SCHEMA = re.compile(r"^zenbu\.language-reference\.v[1-9][0-9]*$")
ARTIFACT_SCHEMA = re.compile(r"^zenbu\.[a-z0-9]+(-[a-z0-9]+)*\.v[1-9][0-9]*$")
ENT_SEQ_DIGEST = "sha256-ascending-decimal-lf"
LFS_HEADER = b"version https://git-lfs.github.com/spec/v1\n"
SQLITE_HEADER = b"SQLite format 3\x00"
CHUNK = 1 << 20

LANGUAGE_DATA = Path(__file__).resolve().parent.parent
REPO_ROOT = LANGUAGE_DATA.parent
SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-manifest.v1.schema.json"


class Refusal(Exception):
    """A release that must not be packaged, with the reason."""


# --- Inputs ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Inputs:
    files: list[dict]  # name, path (repository-relative), optional artifact_schema
    catalog: str | None
    source_archives: dict[str, str]  # pack ID -> repository-relative path
    conformance: list[str]


def resolve(roots: dict[str, str], path: str) -> str:
    """`resources/x.json` -> the `resources` root's directory joined with `x.json`."""
    root, _, rest = path.partition("/")
    if root not in roots or not rest:
        raise Refusal(f"{path} doesn't start with one of the roots {sorted(roots)}")
    return f"{roots[root].rstrip('/')}/{rest}"


def load_inputs(path: Path) -> Inputs:
    config = json.loads(path.read_text())
    roots = config["roots"]
    files = [dict(entry, path=resolve(roots, entry["path"])) for entry in config["files"]]
    names = [entry["name"] for entry in files]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise Refusal(f"release-inputs.json names these files more than once: {duplicates}")
    catalog = config.get("frequency_pack_catalog")
    return Inputs(
        files=files,
        catalog=resolve(roots, catalog) if catalog else None,
        source_archives={
            pack: resolve(roots, archive)
            for pack, archive in config.get("source_archives", {}).items()
        },
        conformance=[resolve(roots, suite) for suite in config["conformance"]],
    )


def load_release(path: Path) -> dict:
    release = json.loads(path.read_text())
    if bool(release.get("previous_release")) != bool(release.get("previous_manifest_sha256")):
        raise Refusal(
            "release.json needs both previous_release and previous_manifest_sha256, or neither"
        )
    return release


# --- Git ---------------------------------------------------------------------------------------


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True).stdout


@dataclass(frozen=True)
class Committed:
    blob: str  # the Git blob's object ID
    lfs_oid: str | None  # the SHA-256 in its LFS pointer, if it is one
    lfs_size: int | None


def parse_lfs_pointer(content: bytes) -> tuple[str, int] | None:
    if not content.startswith(LFS_HEADER):
        return None
    fields = dict(line.split(" ", 1) for line in content.decode().splitlines() if " " in line)
    oid, size = fields.get("oid", ""), fields.get("size", "")
    if not oid.startswith("sha256:") or not size.isdigit():
        raise Refusal(f"malformed Git LFS pointer: {content[:200]!r}")
    return oid.removeprefix("sha256:"), int(size)


def committed(repo: Path, paths: list[str]) -> dict[str, Committed]:
    """Each path's blob at HEAD, reading LFS pointers without downloading anything."""
    listing = git(repo, "ls-tree", "-z", "-l", "--full-tree", "HEAD", "--", *paths)
    found: dict[str, Committed] = {}
    for record in listing.split(b"\0"):
        if not record:
            continue
        meta, name = record.decode().split("\t", 1)
        mode, kind, blob, size = meta.split()
        if kind != "blob":
            continue
        pointer = None
        if int(size) < 1024:
            pointer = parse_lfs_pointer(git(repo, "cat-file", "blob", blob))
        found[name] = Committed(blob, *(pointer or (None, None)))
    missing = [path for path in paths if path not in found]
    if missing:
        raise Refusal(f"not committed at HEAD: {missing}")
    return found


def lfs_paths(repo: Path, inputs: Inputs) -> list[str]:
    heads = committed(repo, [entry["path"] for entry in inputs.files])
    return [entry["path"] for entry in inputs.files if heads[entry["path"]].lfs_oid]


# --- Hashing and staging -----------------------------------------------------------------------


@dataclass(frozen=True)
class Staged:
    sha256: str
    bytes: int
    path: Path
    git_blob: str  # its Git blob object ID, to compare with HEAD


def stage(source: Path, staging: Path, name: str) -> Staged:
    """Copy `source` to staging/files/<sha256>/<name>, hashing the bytes as they're copied."""
    sha256 = hashlib.sha256()
    size = source.stat().st_size
    blob = hashlib.sha1(f"blob {size}\0".encode())
    tmp = tempfile.NamedTemporaryFile(dir=staging, delete=False)
    try:
        with source.open("rb") as reader, tmp:
            while chunk := reader.read(CHUNK):
                sha256.update(chunk)
                blob.update(chunk)
                tmp.write(chunk)
        digest = sha256.hexdigest()
        target = staging / "files" / digest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp.name, target)
    except BaseException:
        Path(tmp.name).unlink(missing_ok=True)
        raise
    return Staged(digest, size, target, blob.hexdigest())


def check_committed(entry: dict, head: Committed, staged: Staged) -> None:
    name, path = entry["name"], entry["path"]
    if head.lfs_oid:
        if staged.sha256 != head.lfs_oid or staged.bytes != head.lfs_size:
            with staged.path.open("rb") as file:
                is_pointer = file.read(len(LFS_HEADER)) == LFS_HEADER
            hint = " (it's still an LFS pointer: run git lfs pull)" if is_pointer else ""
            raise Refusal(
                f"{name}: {path} has SHA-256 {staged.sha256} and {staged.bytes} bytes, but its "
                f"LFS pointer at HEAD names {head.lfs_oid} and {head.lfs_size} bytes{hint}"
            )
    elif staged.git_blob != head.blob:
        raise Refusal(f"{name}: {path} differs from HEAD (blob {head.blob}); commit or restore it")


# --- Reading the files -------------------------------------------------------------------------


def open_sqlite(path: Path) -> sqlite3.Connection:
    # immutable=1: never write a journal, WAL, or anything else beside the file.
    return sqlite3.connect(f"file:{quote(str(path))}?mode=ro&immutable=1", uri=True)


def is_sqlite(path: Path) -> bool:
    with path.open("rb") as file:
        return file.read(len(SQLITE_HEADER)) == SQLITE_HEADER


def sqlite_facts(path: Path) -> tuple[dict[str, int], dict[str, str]]:
    """Every ordinary table's row count, and the `metadata` table (key -> value) if it has one."""
    with open_sqlite(path) as connection:
        tables = [
            name
            for name, sql in connection.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
            )
            if not name.startswith("sqlite_")
            and not (sql or "").upper().startswith("CREATE VIRTUAL TABLE")
        ]
        counts = {
            name: connection.execute(
                f'SELECT count(*) FROM "{name.replace(chr(34), chr(34) * 2)}"'
            ).fetchone()[0]
            for name in tables
        }
        metadata = {}
        if "metadata" in tables:
            metadata = {
                str(key): str(value)
                for key, value in connection.execute("SELECT key, value FROM metadata")
            }
    return counts, metadata


def ent_seq_ids(path: Path) -> tuple[int, str]:
    with open_sqlite(path) as connection:
        rows = connection.execute(
            "SELECT source_record_id FROM entries WHERE source_identity = 'edrdg.jmdict'"
        ).fetchall()
        total = connection.execute("SELECT count(*) FROM entries").fetchone()[0]
    ids = sorted(row[0] for row in rows)
    if len(rows) != total:
        raise Refusal(f"{path.name}: {total - len(rows)} entries aren't JMdict entries")
    if any(not isinstance(value, int) or value < 0 for value in ids) or len(set(ids)) != len(ids):
        raise Refusal(f"{path.name}: ent_seq values aren't unique non-negative integers")
    digest = hashlib.sha256("".join(f"{value}\n" for value in ids).encode()).hexdigest()
    return len(ids), digest


def json_value(metadata_value: str) -> object:
    """import_jmdict.py stores most metadata values as JSON (strings quoted); others are bare."""
    try:
        return json.loads(metadata_value)
    except json.JSONDecodeError:
        return metadata_value


# --- Building ----------------------------------------------------------------------------------


def workflow_run() -> dict | None:
    env = os.environ
    if env.get("GITHUB_ACTIONS") != "true" or not env.get("GITHUB_RUN_ID"):
        return None
    repository, server = env["GITHUB_REPOSITORY"], env.get(
        "GITHUB_SERVER_URL", "https://github.com"
    )
    return {
        "repository": repository,
        "workflow": env.get("GITHUB_WORKFLOW", ""),
        "run_id": int(env["GITHUB_RUN_ID"]),
        "run_attempt": int(env.get("GITHUB_RUN_ATTEMPT", "1")),
        "url": f"{server}/{repository}/actions/runs/{env['GITHUB_RUN_ID']}",
    }


def conformance_pins(
    repo: Path, suites: list[str]
) -> tuple[list[dict], dict[str, tuple[str, str]]]:
    """Each suite's manifest entry, and every artifact pin across them: name -> (sha256, suite)."""
    entries, pins = [], {}
    for path in suites:
        data = (repo / path).read_bytes()
        suite = json.loads(data)
        artifacts = suite.get("artifacts") or ([suite["artifact"]] if "artifact" in suite else [])
        if not artifacts:
            raise Refusal(f"{path} pins no artifacts")
        for artifact in artifacts:
            name, sha = artifact["name"], artifact["sha256"]
            if name in pins and pins[name][0] != sha:
                raise Refusal(
                    f"{path} pins {name} at {sha}, but {pins[name][1]} pins it at {pins[name][0]}"
                )
            pins.setdefault(name, (sha, Path(path).name))
        entries.append(
            {
                "name": Path(path).name,
                "suite": suite["suite"],
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
            }
        )
    names = [entry["name"] for entry in entries]
    if len(set(names)) != len(names):
        raise Refusal(f"two conformance suites share a file name: {names}")
    return entries, pins


def build(repo: Path, inputs: Inputs, release: dict, out: Path, log=print) -> dict:
    if out.exists() and any(out.iterdir()):
        raise Refusal(f"{out} isn't empty")
    out.mkdir(parents=True, exist_ok=True)
    conformance, pins = conformance_pins(repo, inputs.conformance)
    extra = [inputs.catalog] if inputs.catalog else []
    heads = committed(
        repo,
        [entry["path"] for entry in inputs.files]
        + extra
        + list(inputs.source_archives.values())
        + inputs.conformance,
    )
    for path in extra + inputs.conformance:
        if heads[path].lfs_oid:
            raise Refusal(f"{path} is a Git LFS file; the packager reads it as committed text")
        if git_blob(repo / path) != heads[path].blob:
            raise Refusal(f"{path} differs from HEAD; commit or restore it")

    files: list[dict] = []
    by_sha: dict[str, str] = {}
    sqlite_counts: dict[str, dict[str, int]] = {}
    metadata_by_name: dict[str, dict[str, str]] = {}
    json_by_name: dict[str, object] = {}
    for entry in inputs.files:
        name, path = entry["name"], entry["path"]
        staged = stage(repo / path, out, name)
        check_committed(entry, heads[path], staged)
        if name in pins and pins[name][0] != staged.sha256:
            raise Refusal(
                f"{name}: SHA-256 {staged.sha256}, but {pins[name][1]} pins {pins[name][0]}"
            )
        by_sha.setdefault(staged.sha256, name)

        declared = None
        record: dict = {"name": name}
        if name.endswith(".sqlite3"):
            if not is_sqlite(staged.path):
                raise Refusal(f"{name} isn't a SQLite database")
            counts, metadata = sqlite_facts(staged.path)
            sqlite_counts[name], metadata_by_name[name] = counts, metadata
            declared = metadata.get("artifact_schema")
        elif name.endswith(".json"):
            document = json.loads(staged.path.read_bytes())
            json_by_name[name] = document
            if isinstance(document, dict) and isinstance(document.get("schema"), str):
                declared = document["schema"]
        planned = entry.get("artifact_schema")
        if declared and planned:
            raise Refusal(
                f"{name} declares {declared}; release-inputs.json mustn't name one too ({planned})"
            )
        schema = declared or planned
        if schema and not ARTIFACT_SCHEMA.match(schema):
            raise Refusal(f"{name}: artifact_schema {schema!r} isn't zenbu.<name>.v<N>")
        record.update(
            artifact_schema=schema,
            schema_source="file" if declared else "plan" if planned else "undeclared",
            sha256=staged.sha256,
            bytes=staged.bytes,
            depends_on=[],
        )
        if name in sqlite_counts:
            record["row_counts"] = sqlite_counts[name]
        files.append(record)
        log(
            f"{staged.sha256}  {staged.bytes:>10}  {name}  ({record['artifact_schema'] or 'undeclared'})"
        )

    records = {record["name"]: record for record in files}

    def pinned(owner: str, sha: str, what: str) -> str:
        if sha not in by_sha:
            raise Refusal(f"{owner}: {what} pins {sha}, which is no file in the release")
        return by_sha[sha]

    # Dependencies are the SHA-256 pins a file carries: a pack's `language_data_sha256` metadata,
    # the ranking contract's `databaseSHA256` (with its size and evidence counts).
    for name, metadata in metadata_by_name.items():
        if "language_data_sha256" in metadata:
            records[name]["depends_on"].append(
                pinned(name, metadata["language_data_sha256"], "language_data_sha256")
            )
    for name, document in json_by_name.items():
        if isinstance(document, dict) and "databaseSHA256" in document:
            target = pinned(name, document["databaseSHA256"], "databaseSHA256")
            records[name]["depends_on"].append(target)
            if (
                "databaseBytes" in document
                and document["databaseBytes"] != records[target]["bytes"]
            ):
                raise Refusal(
                    f"{name}: databaseBytes {document['databaseBytes']}, but {target} has {records[target]['bytes']}"
                )
            for table, count in (document.get("evidenceCounts") or {}).items():
                if sqlite_counts.get(target, {}).get(table) != count:
                    raise Refusal(f"{name}: {table} should hold {count} rows in {target}")

    sources = frequency_sources(repo, inputs, heads, records, by_sha, pinned)

    language_references = [
        r
        for r in files
        if r["artifact_schema"] and LANGUAGE_REFERENCE_SCHEMA.match(r["artifact_schema"])
    ]
    if len(language_references) != 1:
        raise Refusal(
            f"the release needs exactly one zenbu.language-reference file, not {len(language_references)}"
        )
    reference = language_references[0]
    count, digest = ent_seq_ids(out / "files" / reference["sha256"] / reference["name"])

    manifest = {
        "manifest_schema": MANIFEST_SCHEMA,
        "release": release["release"],
        "git_commit": git(repo, "rev-parse", "HEAD").decode().strip(),
        "workflow_run": workflow_run(),
        "previous_release": release.get("previous_release"),
        "previous_manifest_sha256": release.get("previous_manifest_sha256"),
        "sources": sources,
        "files": files,
        "ids": {
            "file": reference["name"],
            "ent_seq_count": count,
            "ent_seq_digest": ENT_SEQ_DIGEST,
            "ent_seq_sha256": digest,
        },
        "conformance": conformance,
        "core_sha256": None,
    }
    unpackaged = sorted(set(pins) - set(records))
    if unpackaged:
        log(f"Pinned by a conformance suite but not in the release: {', '.join(unpackaged)}")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


def frequency_sources(repo, inputs, heads, records, by_sha, pinned) -> list[dict]:
    """Check the catalog's bundled packs against the release, and list its CDN-only packs."""
    if not inputs.catalog:
        return []
    catalog = json.loads((repo / inputs.catalog).read_bytes())
    sources = []
    for pack in catalog["packs"]:
        pack_id = pack["packID"]
        if pack.get("bundled"):
            resource = f"{pack['bundledResource']}.sqlite3"
            if resource in records and records[resource]["sha256"] != pack["bundledArtifactSHA256"]:
                raise Refusal(
                    f"{inputs.catalog}: {pack_id} pins {resource} at {pack['bundledArtifactSHA256']}, not {records[resource]['sha256']}"
                )
            if resource in records and pack.get("languageDataSHA256"):
                pinned(pack_id, pack["languageDataSHA256"], "languageDataSHA256")
            continue
        archive = inputs.source_archives.get(pack_id)
        if archive:
            head = heads[archive]
            if head.lfs_oid != pack["sourceSHA256"] or head.lfs_size != pack["sourceBytes"]:
                raise Refusal(
                    f"{pack_id}: the catalog names {pack['sourceSHA256']} ({pack['sourceBytes']} bytes), but {archive} at HEAD is {head.lfs_oid} ({head.lfs_size} bytes)"
                )
        sources.append(
            {
                "name": pack_id,
                "version": pack["packVersion"],
                "url": pack["downloadURL"],
                "sha256": pack["sourceSHA256"],
                "bytes": pack["sourceBytes"],
                "depends_on": [pinned(pack_id, pack["languageDataSHA256"], "languageDataSHA256")],
            }
        )
    unknown = sorted(set(inputs.source_archives) - {source["name"] for source in sources})
    if unknown:
        raise Refusal(f"source_archives names packs the catalog doesn't download: {unknown}")
    return sources


def git_blob(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


# --- Validating --------------------------------------------------------------------------------


def validate(out: Path, schema_path: Path = SCHEMA_PATH) -> dict:
    """The manifest against the schema, the rules the schema can't express, and the staged files."""
    import jsonschema

    manifest = json.loads((out / "manifest.json").read_text())
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
                f"{item['name']} depends on {unknown}, which aren't other files or sources in the release"
            )
    if manifest["ids"]["file"] not in [f["name"] for f in manifest["files"]]:
        raise Refusal(f"ids.file {manifest['ids']['file']} isn't a file in the release")

    expected = {f"files/{f['sha256']}/{f['name']}": f for f in manifest["files"]}
    present = (
        {p.relative_to(out).as_posix() for p in (out / "files").rglob("*") if p.is_file()}
        if (out / "files").exists()
        else set()
    )
    if present != set(expected):
        raise Refusal(
            f"staged files differ from the manifest: missing {sorted(set(expected) - present)}, extra {sorted(present - set(expected))}"
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


# --- Command line ------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--repo", type=Path, default=REPO_ROOT, help="repository root (default: this checkout)"
    )
    parser.add_argument(
        "--inputs", type=Path, help="default: language-data/release-inputs.json in --repo"
    )
    parser.add_argument(
        "--release", type=Path, help="default: language-data/release.json in --repo"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    build_parser = commands.add_parser("build")
    build_parser.add_argument(
        "--out", type=Path, required=True, help="an empty or missing directory"
    )
    commands.add_parser("lfs-paths")
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("out", type=Path)
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    inputs_path = args.inputs or repo / "language-data" / "release-inputs.json"
    release_path = args.release or repo / "language-data" / "release.json"
    try:
        if args.command == "build":
            manifest = build(repo, load_inputs(inputs_path), load_release(release_path), args.out)
            print(
                f"Packaged release {manifest['release']}: {len(manifest['files'])} files, "
                f"{len(manifest['sources'])} sources, {manifest['ids']['ent_seq_count']} entries"
            )
        elif args.command == "lfs-paths":
            print(",".join(lfs_paths(repo, load_inputs(inputs_path))))
        else:
            manifest = validate(args.out)
            print(
                f"manifest.json for release {manifest['release']} is valid, with every staged file"
            )
    except Refusal as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
