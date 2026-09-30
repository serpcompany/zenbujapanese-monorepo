from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from pathlib import Path

from committed_files import check_committed, committed, git, git_blob_id, stage
from conformance_suites import conformance_pins
from frequency_catalog import frequency_sources
from ranking_contract import check_ranking_contract
from refusal import Refusal
from release_inputs import Inputs
from release_manifest import ENT_SEQ_DIGEST, MANIFEST_SCHEMA, write_manifest
from sqlite_files import ent_seq_ids, is_sqlite, json_value, sqlite_facts

LANGUAGE_REFERENCE_SCHEMA = re.compile(r"^zenbu\.language-reference\.v[1-9][0-9]*$")
RANKING_CONTRACT_SCHEMA = "zenbu.dictionary-ranking-contract.v1"
ARTIFACT_SCHEMA = re.compile(r"^zenbu\.[a-z0-9]+(-[a-z0-9]+)*\.v[1-9][0-9]*$")


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
