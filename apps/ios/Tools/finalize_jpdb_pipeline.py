#!/usr/bin/env python3
"""Finalize a complete JPDB snapshot into audited SQLite, MySQL, and pack drafts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Callable


TOOLS = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def mysql_command(arguments: argparse.Namespace) -> list[str]:
    if any(value == "-p" or value.startswith("--password") for value in arguments.mysql_arg):
        raise ValueError("do not pass MySQL passwords on the command line; use a login path")
    login_paths = [value for value in arguments.mysql_arg if value.startswith("--login-path=")]
    if len(login_paths) > 1:
        raise ValueError("specify at most one MySQL login path")
    remaining = [value for value in arguments.mysql_arg if value not in login_paths]
    return [
        arguments.mysql_binary,
        *login_paths,
        "--batch",
        "--skip-column-names",
        "--raw",
        *remaining,
        arguments.mysql_database,
    ]


def mysql_query(arguments: argparse.Namespace, sql: str) -> str:
    result = subprocess.run(
        mysql_command(arguments),
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip() or "MySQL verification query failed")
    return result.stdout.strip()


def mysql_publication_state(
    arguments: argparse.Namespace,
    export_manifest: dict[str, object],
    query: Callable[[argparse.Namespace, str], str] = mysql_query,
) -> dict[str, object]:
    pointer_sql = (
        "SELECT s.snapshot_id,LOWER(HEX(s.snapshot_sha)),LOWER(HEX(s.manifest_sha)),"
        "LOWER(HEX(s.artifact_sha)),LOWER(HEX(s.authorization_sha)),s.state,"
        "COALESCE(DATE_FORMAT(s.published_at,'%Y-%m-%dT%H:%i:%s.%fZ'),''),"
        "COALESCE(DATE_FORMAT(c.switched_at,'%Y-%m-%dT%H:%i:%s.%fZ'),'') "
        "FROM jpdb_current_snapshot c JOIN jpdb_snapshots s USING(snapshot_id) "
        "WHERE c.source_name='jpdb';"
    )
    pointer_output = query(arguments, pointer_sql)
    pointer_rows = [line.split("\t") for line in pointer_output.splitlines() if line]
    if len(pointer_rows) != 1 or len(pointer_rows[0]) != 8:
        raise ValueError("MySQL current JPDB snapshot pointer is missing or ambiguous")
    row = pointer_rows[0]
    snapshot_id = int(row[0])
    expected_snapshot = str(export_manifest["snapshotSHA256"])
    expected_manifest = str(export_manifest["artifactManifestSHA256"])
    expected_artifact = str(export_manifest["artifactSHA256"])
    expected_authorization = str(export_manifest["authorizationSHA256"])
    if (
        row[1] != expected_snapshot
        or row[2] != expected_manifest
        or row[3] != expected_artifact
        or row[4] != expected_authorization
        or row[5] != "published"
    ):
        raise ValueError("MySQL current snapshot identity or publication state does not match export")

    manifest_output = query(
        arguments,
        "SELECT table_name,row_count,LOWER(HEX(content_sha)) "
        "FROM jpdb_snapshot_table_manifests "
        f"WHERE snapshot_id={snapshot_id} ORDER BY table_name;",
    )
    stored_manifests = {
        fields[0]: {"rows": int(fields[1]), "sha256": fields[2]}
        for line in manifest_output.splitlines()
        if line and len(fields := line.split("\t")) == 3
    }
    expected_tables = dict(export_manifest["tables"])
    expected_manifests = {
        name: {"rows": int(metadata["rows"]), "sha256": str(metadata["sha256"])}
        for name, metadata in expected_tables.items()
    }
    if stored_manifests != expected_manifests:
        raise ValueError("MySQL stored table manifests do not match export manifest")

    count_selects: list[str] = []
    for name, metadata in sorted(expected_tables.items()):
        target = str(metadata["target"])
        if not re.fullmatch(r"[A-Za-z0-9_]+", target):
            raise ValueError(f"unsafe MySQL target table name: {target}")
        if name == "extracted_documents":
            count_selects.append(
                "SELECT 'extracted_documents',COUNT(DISTINCT extracted_document_sha) "
                f"FROM jpdb_source_resources WHERE snapshot_id={snapshot_id}"
            )
        else:
            count_selects.append(
                f"SELECT '{name}',COUNT(*) FROM {target} WHERE snapshot_id={snapshot_id}"
            )
    count_output = query(arguments, " UNION ALL ".join(count_selects) + ";")
    actual_counts = {
        fields[0]: int(fields[1])
        for line in count_output.splitlines()
        if line and len(fields := line.split("\t")) == 2
    }
    expected_counts = {name: int(metadata["rows"]) for name, metadata in expected_tables.items()}
    if actual_counts != expected_counts:
        raise ValueError("MySQL actual snapshot row counts do not match export manifest")
    return {
        "snapshotID": snapshot_id,
        "snapshotSHA256": row[1],
        "manifestSHA256": row[2],
        "artifactSHA256": row[3],
        "authorizationSHA256": row[4],
        "state": row[5],
        "publishedAt": row[6],
        "pointerSwitchedAt": row[7],
        "tableCounts": actual_counts,
        "tableManifests": stored_manifests,
    }


def load_mysql_twice_and_verify(
    load_command: list[str],
    arguments: argparse.Namespace,
    export_manifest: dict[str, object],
    runner: Callable[[list[str]], None] = run,
    state_reader: Callable[[argparse.Namespace, dict[str, object]], dict[str, object]] = mysql_publication_state,
) -> dict[str, object]:
    runner(load_command)
    first = state_reader(arguments, export_manifest)
    runner(load_command)
    second = state_reader(arguments, export_manifest)
    if first != second:
        raise ValueError("second identical MySQL load changed published snapshot state")
    return {
        "verified": True,
        "loadAttempts": 2,
        "unchangedAfterSecondLoad": True,
        "firstLoad": first,
        "secondLoad": second,
    }


def corpus_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "global"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--language-data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--frequency-corpus", action="append", default=[])
    parser.add_argument("--mysql-database")
    parser.add_argument("--mysql-binary", default="mysql")
    parser.add_argument("--mysql-arg", action="append", default=[])
    arguments = parser.parse_args()

    snapshot_manifest = arguments.snapshot / "snapshot.json"
    snapshot = json.loads(snapshot_manifest.read_text(encoding="utf-8"))
    if not snapshot.get("complete"):
        raise ValueError("JPDB snapshot is not complete")
    if snapshot.get("schema") != "zenbu.jpdb-structured-snapshot.v2":
        raise ValueError("unsupported JPDB snapshot schema")
    arguments.output.mkdir(parents=True, exist_ok=True)
    audit_path = arguments.output / "JPDB.audit.json"
    sqlite_path = arguments.output / "JPDB.sqlite"
    import_path = arguments.output / "JPDB.import.json"
    mysql_export = arguments.output / "mysql"

    run(
        [
            sys.executable,
            str(TOOLS / "audit_jpdb_snapshot.py"),
            "--snapshot",
            str(arguments.snapshot),
            "--output",
            str(audit_path),
        ]
    )
    run(
        [
            sys.executable,
            str(TOOLS / "import_jpdb.py"),
            "--snapshot",
            str(arguments.snapshot),
            "--authorization",
            str(arguments.authorization),
            "--zenbu-language-data",
            str(arguments.language_data),
            "--output",
            str(sqlite_path),
            "--output-manifest",
            str(import_path),
        ]
    )
    run(
        [
            sys.executable,
            str(TOOLS / "jpdb_mysql" / "warehouse.py"),
            "export",
            "--snapshot",
            str(arguments.snapshot),
            "--sqlite",
            str(sqlite_path),
            "--artifact-manifest",
            str(import_path),
            "--output",
            str(mysql_export),
        ]
    )

    mysql_loaded = False
    mysql_verification: dict[str, object] = {
        "verified": False,
        "reason": "MySQL database not requested",
    }
    mysql_export_manifest_path = mysql_export / "manifest.json"
    mysql_export_manifest = json.loads(
        mysql_export_manifest_path.read_text(encoding="utf-8")
    )
    if arguments.mysql_database:
        common = [
            "--mysql-binary",
            arguments.mysql_binary,
            "--database",
            arguments.mysql_database,
            *[f"--mysql-arg={value}" for value in arguments.mysql_arg],
        ]
        run(
            [
                sys.executable,
                str(TOOLS / "jpdb_mysql" / "warehouse.py"),
                "migrate",
                *common,
            ]
        )
        load_command = [
            sys.executable,
            str(TOOLS / "jpdb_mysql" / "warehouse.py"),
            "load",
            *common,
            "--export",
            str(mysql_export),
            "--extract-root-uri",
            sqlite_path.resolve().as_uri(),
        ]
        mysql_verification = load_mysql_twice_and_verify(
            load_command,
            arguments,
            mysql_export_manifest,
        )
        mysql_loaded = True

    latest = max(str(response["retrievedAt"]) for response in snapshot["responses"])
    snapshot_sha = sha256(snapshot_manifest)
    database = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    try:
        available_corpora = [str(row[0]) for row in database.execute("SELECT DISTINCT corpus FROM frequencies ORDER BY corpus")]
    finally:
        database.close()
    requested_corpora = arguments.frequency_corpus or ["global"]
    missing = sorted(set(requested_corpora) - set(available_corpora))
    if missing:
        raise ValueError(f"frequency corpora unavailable: {', '.join(missing)}")
    packs = []
    for corpus in requested_corpora:
        slug = corpus_slug(corpus)
        source = arguments.output / f"JPDB-{slug}.tsv.xz"
        manifest = arguments.output / f"JPDB-{slug}.source.json"
        draft = arguments.output / f"JPDB-{slug}.catalog-draft.json"
        run(
            [
                sys.executable,
                str(TOOLS / "export_jpdb_frequency_pack.py"),
                "--jpdb-sqlite",
                str(sqlite_path),
                "--corpus",
                corpus,
                "--pack-id",
                f"zenbu.jpdb.{slug}.ja",
                "--pack-version",
                latest[:10],
                "--display-name",
                f"JPDB {corpus.title()}",
                "--domain",
                f"jpdb.{slug}",
                "--domain-description",
                f"JPDB {corpus} Top N frequency bands from indexed public media.",
                "--source-identity",
                f"JPDB {corpus} frequency bands",
                "--source-snapshot",
                snapshot_sha,
                "--retrieved-at",
                latest,
                "--authorization",
                str(arguments.authorization),
                "--output-source",
                str(source),
                "--output-manifest",
                str(manifest),
                "--output-catalog-draft",
                str(draft),
            ]
        )
        packs.append(
            {
                "corpus": corpus,
                "source": str(source),
                "sourceSHA256": sha256(source),
                "manifest": str(manifest),
                "catalogDraft": str(draft),
            }
        )

    summary = {
        "schema": "zenbu.jpdb-finalization.v2",
        "snapshot": str(arguments.snapshot),
        "snapshotManifestSHA256": snapshot_sha,
        "audit": str(audit_path),
        "auditSHA256": sha256(audit_path),
        "sqlite": str(sqlite_path),
        "sqliteSHA256": sha256(sqlite_path),
        "importManifest": str(import_path),
        "mysqlExport": str(mysql_export),
        "mysqlExportManifest": str(mysql_export_manifest_path),
        "mysqlExportManifestSHA256": sha256(mysql_export_manifest_path),
        "mysqlLoaded": mysql_loaded,
        "mysqlVerification": mysql_verification,
        "frequencyPacks": packs,
    }
    summary_path = arguments.output / "JPDB.finalization.json"
    summary_path.write_text(canonical_json(summary) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError, sqlite3.Error, subprocess.CalledProcessError) as error:
        print(f"JPDB finalization failed: {error}", file=sys.stderr)
        raise SystemExit(1)
