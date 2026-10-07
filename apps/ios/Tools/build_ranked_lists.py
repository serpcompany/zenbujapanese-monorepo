#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sqlite3
import tempfile
from pathlib import Path

from import_frequency_pack import evidence_sha256, sha256

ARTIFACT_SCHEMA = "zenbu.ranked-lists.v1"
RANKED_PACK_PREFIXES = ("zenbu.wikipedia.", "zenbu.jiten.")


def ranked_manifests(catalog: dict[str, object]) -> list[dict[str, object]]:
    packs = catalog["packs"]
    assert isinstance(packs, list)
    return [pack for pack in packs if str(pack["packID"]).startswith(RANKED_PACK_PREFIXES)]


def evidence_path(manifest: dict[str, object], wikipedia: Path, jiten: Path) -> Path:
    pack_id = str(manifest["packID"])
    return wikipedia if pack_id.startswith("zenbu.wikipedia.") else jiten / f"{pack_id}.sqlite3"


def checked_evidence(
    manifest: dict[str, object], path: Path, language_data_sha256: str
) -> list[tuple[int, bytes]]:
    pack_id = manifest["packID"]
    if manifest["languageDataSHA256"] != language_data_sha256:
        raise ValueError(f"{pack_id}'s manifest was built for other language data")
    database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        if evidence_sha256(database) != manifest["mappingSHA256"]:
            raise ValueError(f"{pack_id}'s evidence isn't the mapping its manifest pins")
        rows = database.execute(
            "SELECT rank, language_reference_id FROM frequency_evidence "
            "ORDER BY rank, language_reference_id"
        ).fetchall()
    finally:
        database.close()
    if len(rows) != manifest["mappedRows"]:
        raise ValueError(f"{pack_id} maps {len(rows)} entries, not {manifest['mappedRows']}")
    return rows


def write_artifact(
    output: Path, metadata: dict[str, str], lists: list[tuple[dict[str, object], list[tuple[int, bytes]]]]
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as directory:
        staged = Path(directory) / output.name
        database = sqlite3.connect(staged)
        try:
            database.executescript(
                """
                PRAGMA page_size = 4096;
                PRAGMA journal_mode = OFF;
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
                CREATE TABLE ranked_lists (
                  list_id INTEGER PRIMARY KEY,
                  pack_id TEXT NOT NULL UNIQUE,
                  pack_version TEXT NOT NULL,
                  mapping_sha256 TEXT NOT NULL,
                  mapped_rows INTEGER NOT NULL
                );
                CREATE TABLE ranked_evidence (
                  list_id INTEGER NOT NULL REFERENCES ranked_lists(list_id),
                  rank INTEGER NOT NULL,
                  language_reference_id BLOB NOT NULL,
                  PRIMARY KEY (list_id, rank, language_reference_id)
                ) WITHOUT ROWID;
                """
            )
            database.executemany("INSERT INTO metadata VALUES (?, ?)", sorted(metadata.items()))
            for list_id, (manifest, rows) in enumerate(lists, 1):
                database.execute(
                    "INSERT INTO ranked_lists VALUES (?, ?, ?, ?, ?)",
                    (
                        list_id,
                        manifest["packID"],
                        manifest["packVersion"],
                        manifest["mappingSHA256"],
                        len(rows),
                    ),
                )
                database.executemany(
                    "INSERT INTO ranked_evidence VALUES (?, ?, ?)",
                    ((list_id, rank, identifier) for rank, identifier in rows),
                )
            database.commit()
            database.execute("VACUUM")
        finally:
            database.close()
        staged.replace(output)


def build(arguments: argparse.Namespace) -> dict[str, object]:
    catalog = json.loads(arguments.catalog.read_text(encoding="utf-8"))
    language_data_sha256 = sha256(arguments.language_data)
    lists = [
        (
            manifest,
            checked_evidence(
                manifest,
                evidence_path(manifest, arguments.wikipedia, arguments.jiten),
                language_data_sha256,
            ),
        )
        for manifest in ranked_manifests(catalog)
    ]
    metadata = {
        "artifact_schema": ARTIFACT_SCHEMA,
        "language_data_sha256": language_data_sha256,
        "builder_sha256": sha256(Path(__file__)),
    }
    write_artifact(arguments.output, metadata, lists)
    return {
        "schema": "zenbu.ranked-lists-import.v1",
        "importerSHA256": metadata["builder_sha256"],
        "languageDataSHA256": language_data_sha256,
        "lists": [
            {
                "packID": manifest["packID"],
                "packVersion": manifest["packVersion"],
                "mappingSHA256": manifest["mappingSHA256"],
                "mappedRows": len(rows),
            }
            for manifest, rows in lists
        ],
        "artifactBytes": arguments.output.stat().st_size,
        "artifactSHA256": sha256(arguments.output),
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Collect the Wikipedia and Jiten packs' mapped ranks for the dictionary service."
    )
    result.add_argument("--catalog", type=Path, required=True)
    result.add_argument("--language-data", type=Path, required=True)
    result.add_argument("--wikipedia", type=Path, required=True, help="the mapped Wikipedia pack")
    result.add_argument("--jiten", type=Path, required=True, help="the Jiten packs' mapped evidence")
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--import-manifest", type=Path, required=True)
    return result


def main() -> None:
    arguments = parser().parse_args()
    report = build(arguments)
    arguments.import_manifest.parent.mkdir(parents=True, exist_ok=True)
    arguments.import_manifest.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
