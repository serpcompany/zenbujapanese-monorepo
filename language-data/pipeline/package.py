#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

DESCRIPTION = "Package a language-data release from the committed files."
MANIFEST_SCHEMA = "zenbu.language-data-manifest.v1"
LANGUAGE_REFERENCE_SCHEMA = re.compile(r"^zenbu\.language-reference\.v[1-9][0-9]*$")
RANKING_CONTRACT_SCHEMA = "zenbu.dictionary-ranking-contract.v1"
ARTIFACT_SCHEMA = re.compile(r"^zenbu\.[a-z0-9]+(-[a-z0-9]+)*\.v[1-9][0-9]*$")
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)?$")
RELEASE = re.compile(r"^[0-9]{4}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$")
ENT_SEQ_DIGEST = "sha256-ascending-decimal-lf"
LFS_HEADER = b"version https://git-lfs.github.com/spec/v1\n"
SQLITE_HEADER = b"SQLite format 3\x00"
FTS_SHADOW_SUFFIXES = ("content", "docsize", "segdir", "segments", "stat", "data", "idx", "config")
CHUNK = 1 << 20

LANGUAGE_DATA = Path(__file__).resolve().parent.parent
REPO_ROOT = LANGUAGE_DATA.parent
SCHEMA_PATH = LANGUAGE_DATA / "schemas" / "language-data-manifest.v1.schema.json"


class Refusal(Exception):
    pass


@dataclass(frozen=True)
class Inputs:
    files: list[dict]
    catalog: str | None
    source_archives: dict[str, str]
    conformance: list[str]


def check_name(name: object, what: str) -> str:
    if (
        not isinstance(name, str)
        or not NAME.match(name)
        or any(segment in (".", "..") for segment in name.split("/"))
    ):
        raise Refusal(f"{what} {name!r} isn't a release name (one or two plain path segments)")
    return name


def check_relative(path: object, what: str) -> str:
    if (
        not isinstance(path, str)
        or not path
        or path.startswith("/")
        or "\\" in path
        or any(segment in ("", ".", "..") for segment in path.rstrip("/").split("/"))
    ):
        raise Refusal(f"{what} {path!r} must be a plain path relative to the repository root")
    return path


def resolve(roots: dict[str, str], path: str) -> str:
    check_relative(path, "release-inputs.json path")
    root, _, rest = path.partition("/")
    if root not in roots or not rest:
        raise Refusal(f"{path} doesn't start with one of the roots {sorted(roots)}")
    return f"{roots[root].rstrip('/')}/{rest}"


def load_inputs(path: Path) -> Inputs:
    config = json.loads(path.read_text())
    roots = config["roots"]
    for root, directory in roots.items():
        check_relative(directory, f"root {root}")
    files = []
    for entry in config["files"]:
        check_name(entry.get("name"), "file name")
        files.append(dict(entry, path=resolve(roots, entry["path"])))
    names = [entry["name"] for entry in files]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise Refusal(f"release-inputs.json names these files more than once: {duplicates}")
    catalog = config.get("frequency_pack_catalog")
    return Inputs(
        files=files,
        catalog=resolve(roots, catalog) if catalog else None,
        source_archives={
            check_name(pack, "source"): resolve(roots, archive)
            for pack, archive in config.get("source_archives", {}).items()
        },
        conformance=[resolve(roots, suite) for suite in config["conformance"]],
    )


def load_release(path: Path) -> dict:
    release = json.loads(path.read_text())
    if not isinstance(release.get("release"), str) or not RELEASE.match(release["release"]):
        raise Refusal(f"release.json's release {release.get('release')!r} isn't YYYY.MM.N")
    return release


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True).stdout


@dataclass(frozen=True)
class Committed:
    blob_id: str
    lfs_oid: str | None
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


def git_blob_id(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


@dataclass(frozen=True)
class Staged:
    sha256: str
    bytes: int
    path: Path
    blob_id: str


def stage(source: Path, staging: Path, name: str) -> Staged:
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
    elif staged.blob_id != head.blob_id:
        raise Refusal(
            f"{name}: {path} differs from HEAD (blob {head.blob_id}); commit or restore it"
        )


def open_sqlite(path: Path) -> closing[sqlite3.Connection]:
    return closing(sqlite3.connect(f"file:{quote(str(path))}?mode=ro&immutable=1", uri=True))


def is_sqlite(path: Path) -> bool:
    with path.open("rb") as file:
        return file.read(len(SQLITE_HEADER)) == SQLITE_HEADER


def quoted(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def count(connection: sqlite3.Connection, table: str) -> int:
    return connection.execute(f"SELECT count(*) FROM {quoted(table)}").fetchone()[0]


def sqlite_facts(path: Path) -> tuple[dict[str, int], dict[str, str]]:
    with open_sqlite(path) as connection:
        tables = {
            name: (sql or "")
            for name, sql in connection.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table'"
            )
            if not name.startswith("sqlite_")
        }
        virtual = sorted(
            name for name, sql in tables.items() if sql.upper().startswith("CREATE VIRTUAL TABLE")
        )
        shadows = {f"{name}_{suffix}" for name in virtual for suffix in FTS_SHADOW_SUFFIXES}
        counts = {}
        for name in sorted(tables):
            if name in virtual:
                source = next(
                    (f"{name}_{s}" for s in ("docsize", "content") if f"{name}_{s}" in tables),
                    name,
                )
                counts[name] = count(connection, source)
            elif name not in shadows:
                counts[name] = count(connection, name)
        metadata = {}
        if "metadata" in tables:
            metadata = {
                str(key): str(value)
                for key, value in connection.execute("SELECT key, value FROM metadata")
            }
    return counts, metadata


def json_value(metadata_value: str) -> object:
    try:
        return json.loads(metadata_value)
    except json.JSONDecodeError:
        return metadata_value


def ent_seq_ids(path: Path) -> tuple[int, str]:
    with open_sqlite(path) as connection:
        rows = connection.execute(
            "SELECT source_record_id FROM entries WHERE source_identity = 'edrdg.jmdict'"
        ).fetchall()
        total = count(connection, "entries")
    ids = sorted(row[0] for row in rows)
    if len(rows) != total:
        raise Refusal(f"{path.name}: {total - len(rows)} entries aren't JMdict entries")
    if any(not isinstance(value, int) or value < 0 for value in ids) or len(set(ids)) != len(ids):
        raise Refusal(f"{path.name}: ent_seq values aren't unique non-negative integers")
    digest = hashlib.sha256("".join(f"{value}\n" for value in ids).encode()).hexdigest()
    return len(ids), digest


EVIDENCE_KEYS = (
    "form_priority_profiles",
    "canonical_senses",
    "gloss_atoms",
    "sense_form_restrictions",
    "reading_form_restrictions",
)
SEARCH_INDEX_KEYS = ("schema", "technology", "gloss_rows", "form_rows")
TOOL_KEYS = (
    "import_tool_sha256",
    "dictionary_ranking_adapter_sha256",
    "dictionary_ranking_contract_sha256",
    "shared_tooling_sha256",
    "unidic_adapter_sha256",
    "tatoeba_adapter_sha256",
)


def check_ranking_contract(name: str, contract: dict, database: Path, metadata: dict) -> None:
    def refuse(what: str) -> None:
        raise Refusal(f"{name}: {what} disagrees with {database.name}")

    def meta(key: str) -> object:
        if key not in metadata:
            refuse(f"metadata {key} (missing)")
        return json_value(metadata[key])

    def fields(value: object, keys: tuple[str, ...]) -> dict | None:
        if not isinstance(value, dict) or any(key not in value for key in keys):
            return None
        return {key: value[key] for key in keys}

    if database.stat().st_size != contract.get("databaseBytes"):
        refuse("databaseBytes")
    if meta("dictionary_ranking_policy") != contract.get("policy"):
        refuse("policy")
    if meta("dictionary_ranking_schema_version") != contract.get("schemaVersion"):
        refuse("schemaVersion")
    if meta("dictionary_ranking_mapping_sha256") != contract.get("mappingSHA256"):
        refuse("mappingSHA256")
    evidence = fields(contract.get("evidenceCounts"), EVIDENCE_KEYS)
    if evidence is None or fields(meta("dictionary_ranking_evidence"), EVIDENCE_KEYS) != evidence:
        refuse("evidenceCounts")
    search_index = fields(contract.get("searchIndex"), SEARCH_INDEX_KEYS)
    if (
        search_index is None
        or fields(meta("dictionary_search_index"), SEARCH_INDEX_KEYS) != search_index
    ):
        refuse("searchIndex")
    if search_index["schema"] != "zenbu.dictionary-search-index.v1":
        refuse("searchIndex.schema")
    if search_index["technology"] != "sqlite-fts4":
        refuse("searchIndex.technology")
    equivalence = contract.get("semanticEquivalence") or {}
    if equivalence.get("normalization") != "opaque-app-id-lexicographic-min-v1":
        refuse("semanticEquivalence.normalization")
    tools = fields(contract.get("toolSHA256"), TOOL_KEYS)
    if tools is None:
        refuse("toolSHA256")
    for key, expected in tools.items():
        if meta(key) != expected:
            refuse(f"toolSHA256.{key}")

    with open_sqlite(database) as connection:
        groups, rows = connection.execute(
            "SELECT count(*), total(group_size) FROM (SELECT count(*) AS group_size FROM entries "
            "GROUP BY semantic_fingerprint HAVING count(*) > 1)"
        ).fetchone()
        if (groups, rows) != (equivalence.get("duplicate_groups"), equivalence.get("source_rows")):
            refuse("semanticEquivalence")
        tables = [(key, evidence[key]) for key in EVIDENCE_KEYS] + [
            ("dictionary_gloss_fts", search_index["gloss_rows"]),
            ("dictionary_form_fts", search_index["form_rows"]),
        ]
        for table, expected in tables:
            if count(connection, table) != expected:
                refuse(f"the row count of {table}")


def workflow_run() -> dict | None:
    env = os.environ
    if env.get("GITHUB_ACTIONS") != "true" or not env.get("GITHUB_RUN_ID"):
        return None
    repository = env["GITHUB_REPOSITORY"]
    server = env.get("GITHUB_SERVER_URL", "https://github.com")
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
                "name": check_name(Path(path).name, "conformance suite"),
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
    created = not out.exists()
    out.mkdir(parents=True, exist_ok=True)
    try:
        return build_into(repo, inputs, release, out, log)
    except BaseException:
        for child in out.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        if created:
            out.rmdir()
        raise


def build_into(repo: Path, inputs: Inputs, release: dict, out: Path, log) -> dict:
    conformance, pins = conformance_pins(repo, inputs.conformance)
    file_paths = [entry["path"] for entry in inputs.files]
    catalog_only = [inputs.catalog] if inputs.catalog and inputs.catalog not in file_paths else []
    heads = committed(
        repo,
        file_paths + catalog_only + list(inputs.source_archives.values()) + inputs.conformance,
    )
    unpackaged_sha256_by_name: dict[str, str] = {}
    for path in catalog_only + inputs.conformance:
        data = (repo / path).read_bytes()
        if heads[path].lfs_oid:
            raise Refusal(f"{path} is a Git LFS file; the packager reads it as committed text")
        if git_blob_id(data) != heads[path].blob_id:
            raise Refusal(f"{path} differs from HEAD; commit or restore it")
        if path in catalog_only:
            unpackaged_sha256_by_name[Path(path).name] = hashlib.sha256(data).hexdigest()

    files: list[dict] = []
    by_sha: dict[str, list[str]] = {}
    metadata_by_name: dict[str, dict[str, str]] = {}
    json_by_name: dict[str, object] = {}
    for entry in inputs.files:
        name, path = entry["name"], entry["path"]
        staged = stage(repo / path, out, name)
        check_committed(entry, heads[path], staged)
        by_sha.setdefault(staged.sha256, []).append(name)

        declared, record = None, {"name": name}
        if name.endswith(".sqlite3"):
            if not is_sqlite(staged.path):
                raise Refusal(f"{name} isn't a SQLite database")
            counts, metadata = sqlite_facts(staged.path)
            metadata_by_name[name] = metadata
            if "artifact_schema" in metadata:
                declared = json_value(metadata["artifact_schema"])
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
        if schema and (not isinstance(schema, str) or not ARTIFACT_SCHEMA.match(schema)):
            raise Refusal(f"{name}: artifact_schema {schema!r} isn't zenbu.<name>.v<N>")
        record.update(
            artifact_schema=schema,
            schema_source="file" if declared else "plan" if planned else "undeclared",
            sha256=staged.sha256,
            bytes=staged.bytes,
            depends_on=[],
        )
        if name.endswith(".sqlite3"):
            record["row_counts"] = counts
        files.append(record)
        log(f"{staged.sha256}  {staged.bytes:>10}  {name}  ({schema or 'undeclared'})")

    records = {record["name"]: record for record in files}

    for name, (sha, suite) in sorted(pins.items()):
        actual = (
            records[name]["sha256"] if name in records else unpackaged_sha256_by_name.get(name)
        )
        if actual is not None and actual != sha:
            raise Refusal(f"{name}: SHA-256 {actual}, but {suite} pins {sha}")
    unread = sorted(
        name for name in pins if name not in records and name not in unpackaged_sha256_by_name
    )

    references = [
        r
        for r in files
        if r["artifact_schema"] and LANGUAGE_REFERENCE_SCHEMA.match(r["artifact_schema"])
    ]
    if len(references) != 1:
        raise Refusal(
            f"the release needs exactly one zenbu.language-reference file, not {len(references)}"
        )
    reference = references[0]
    reference_path = out / "files" / reference["sha256"] / reference["name"]

    def language_reference(owner: str, sha: object, what: str) -> str:
        if sha != reference["sha256"]:
            raise Refusal(
                f"{owner}: {what} pins {sha}, not {reference['name']} ({reference['sha256']})"
            )
        return reference["name"]

    def depend(record: dict, target: str) -> None:
        if target != record["name"] and target not in record["depends_on"]:
            record["depends_on"].append(target)

    for name, metadata in metadata_by_name.items():
        if "language_data_sha256" in metadata:
            sha = json_value(metadata["language_data_sha256"])
            depend(records[name], language_reference(name, sha, "language_data_sha256"))
        if "mapping_policy_sha256" in metadata:
            for target in by_sha.get(json_value(metadata["mapping_policy_sha256"]), []):
                depend(records[name], target)
    for name, document in json_by_name.items():
        if records[name]["artifact_schema"] == RANKING_CONTRACT_SCHEMA:
            sha = document.get("databaseSHA256")
            depend(records[name], language_reference(name, sha, "databaseSHA256"))
            check_ranking_contract(
                name, document, reference_path, metadata_by_name[reference["name"]]
            )

    sources = frequency_sources(repo, inputs, heads, records, by_sha, language_reference, depend)
    count_, digest = ent_seq_ids(reference_path)

    manifest = {
        "manifest_schema": MANIFEST_SCHEMA,
        "release": release["release"],
        "git_commit": git(repo, "rev-parse", "HEAD").decode().strip(),
        "workflow_run": workflow_run(),
        "previous_release": None,
        "previous_manifest_sha256": None,
        "sources": sources,
        "files": files,
        "ids": {
            "file": reference["name"],
            "ent_seq_count": count_,
            "ent_seq_digest": ENT_SEQ_DIGEST,
            "ent_seq_sha256": digest,
        },
        "conformance": conformance,
        "core_sha256": None,
    }
    if unread:
        log(f"Pinned by a conformance suite, but not read or packaged: {', '.join(unread)}")
    write_manifest(out, manifest)
    return manifest


def manifest_bytes(manifest: dict) -> bytes:
    return (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()


def write_manifest(out: Path, manifest: dict) -> None:
    (out / "manifest.json").write_bytes(manifest_bytes(manifest))


def frequency_sources(repo, inputs, heads, records, by_sha, language_reference, depend):
    if not inputs.catalog:
        return []
    catalog_name = next((f["name"] for f in inputs.files if f["path"] == inputs.catalog), None)
    catalog = json.loads((repo / inputs.catalog).read_bytes())
    sources = []
    for pack in catalog["packs"]:
        pack_id = check_name(pack["packID"], "frequency pack")
        reference = language_reference(
            pack_id, pack.get("languageDataSHA256"), "languageDataSHA256"
        )
        policies = by_sha.get(pack.get("mappingPolicySHA256"), [])
        if pack.get("bundled"):
            resource = f"{pack['bundledResource']}.sqlite3"
            if resource not in records:
                raise Refusal(f"{pack_id} is bundled as {resource}, which isn't in the release")
            if records[resource]["sha256"] != pack["bundledArtifactSHA256"]:
                raise Refusal(
                    f"{inputs.catalog}: {pack_id} pins {resource} at "
                    f"{pack['bundledArtifactSHA256']}, not {records[resource]['sha256']}"
                )
            if catalog_name:
                for target in [reference, resource, *policies]:
                    depend(records[catalog_name], target)
            continue
        archive = inputs.source_archives.get(pack_id)
        if archive:
            head = heads[archive]
            if head.lfs_oid != pack["sourceSHA256"] or head.lfs_size != pack["sourceBytes"]:
                raise Refusal(
                    f"{pack_id}: the catalog names {pack['sourceSHA256']} "
                    f"({pack['sourceBytes']} bytes), but {archive} at HEAD is {head.lfs_oid} "
                    f"({head.lfs_size} bytes)"
                )
        source = {
            "name": pack_id,
            "version": pack["packVersion"],
            "url": pack["downloadURL"],
            "sha256": pack["sourceSHA256"],
            "bytes": pack["sourceBytes"],
            "depends_on": [],
        }
        for target in [reference, *policies]:
            depend(source, target)
        if catalog_name:
            for target in [reference, *policies]:
                depend(records[catalog_name], target)
        sources.append(source)
    unknown = sorted(set(inputs.source_archives) - {source["name"] for source in sources})
    if unknown:
        raise Refusal(f"source_archives names packs the catalog doesn't download: {unknown}")
    return sources


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
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
    build_parser = commands.add_parser(
        "build", help="write OUT/manifest.json and OUT/files/<sha256>/<name>"
    )
    build_parser.add_argument(
        "--out", type=Path, required=True, help="an empty or missing directory"
    )
    commands.add_parser("lfs-paths", help="print the Git LFS paths build reads, comma-separated")
    validate_parser = commands.add_parser(
        "validate", help="check OUT/manifest.json against the schema, and the staged files"
    )
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
