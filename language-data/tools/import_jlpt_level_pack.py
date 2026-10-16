#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

from import_frequency_pack import artifact_content_sha256, sha256
from jmdict_normalization import language_reference_id


ARTIFACT_SCHEMA = "zenbu.level-pack.v1"
JMDICT_SOURCE_IDENTITY = "edrdg.jmdict"
REPOSITORY = Path(__file__).resolve().parents[3]


def mapping_sha256(rows: list[tuple[bytes, int]]) -> str:
    digest = hashlib.sha256()
    for identifier, level in rows:
        digest.update(identifier)
        digest.update(level.to_bytes(8, "big"))
    return digest.hexdigest()


def read_levels(
    record: dict[str, object], sources: Path, database: sqlite3.Connection
) -> tuple[dict[bytes, int], dict[str, int]]:
    levels: dict[bytes, int] = {}
    counts = {"sourceRows": 0, "unmappedRows": 0, "duplicateMappings": 0}
    source = record["source"]
    assert isinstance(source, dict)
    for file in source["files"]:
        path = sources / file["path"]
        if path.stat().st_size != file["bytes"] or sha256(path) != file["sha256"]:
            raise ValueError(f"{path}: checksum mismatch")
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                counts["sourceRows"] += 1
                sequence = row["jmdict_seq"].strip()
                if not sequence:
                    counts["unmappedRows"] += 1
                    continue
                identifier = language_reference_id(JMDICT_SOURCE_IDENTITY, sequence)
                exists = database.execute(
                    "SELECT 1 FROM entries WHERE id = ?", (identifier,)
                ).fetchone()
                if not exists:
                    counts["unmappedRows"] += 1
                    continue
                if identifier in levels:
                    counts["duplicateMappings"] += 1
                levels[identifier] = max(levels.get(identifier, 0), int(file["level"]))
    return levels, counts


def build(record_path: Path, language_data: Path, output: Path) -> dict[str, object]:
    record = json.loads(record_path.read_text(encoding="utf-8"))
    with sqlite3.connect(f"file:{language_data}?mode=ro", uri=True) as database:
        levels, counts = read_levels(record, record_path.parent, database)
    rows = sorted(levels.items())
    mapping = mapping_sha256(rows)
    metadata = {
        "artifact_schema": ARTIFACT_SCHEMA,
        "pack_id": record["packID"],
        "pack_version": record["packVersion"],
        "source_rows": str(counts["sourceRows"]),
        "mapped_rows": str(len(rows)),
        "unmapped_rows": str(counts["unmappedRows"]),
        "duplicate_mappings": str(counts["duplicateMappings"]),
        "mapping_sha256": mapping,
        "language_data_sha256": sha256(language_data),
        "offline_importer_sha256": sha256(Path(__file__)),
    }
    with tempfile.TemporaryDirectory() as directory:
        staged = Path(directory) / output.name
        with sqlite3.connect(staged) as artifact:
            artifact.executescript(
                """
                PRAGMA page_size = 4096;
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
                CREATE TABLE level_evidence (
                  language_reference_id BLOB PRIMARY KEY,
                  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5)
                ) WITHOUT ROWID;
                """
            )
            artifact.executemany(
                "INSERT INTO metadata VALUES (?, ?)", sorted(metadata.items())
            )
            artifact.executemany("INSERT INTO level_evidence VALUES (?, ?)", rows)
        with sqlite3.connect(staged) as artifact:
            artifact.execute("VACUUM")
        output.write_bytes(staged.read_bytes())
    smoke = min(identifier for identifier, level in rows if level == 5)
    source_digest = hashlib.sha256()
    for file in record["source"]["files"]:
        source_digest.update((record_path.parent / file["path"]).read_bytes())
    return {
        "sourceBytes": sum(file["bytes"] for file in record["source"]["files"]),
        "sourceSHA256": source_digest.hexdigest(),
        "coveredSourceRows": counts["sourceRows"],
        "mappedRows": len(rows),
        "unmappedRows": counts["unmappedRows"],
        "duplicateMappings": counts["duplicateMappings"],
        "mappingSHA256": mapping,
        "artifactContentSHA256": artifact_content_sha256(metadata),
        "offlineImporterSHA256": metadata["offline_importer_sha256"],
        "languageDataSHA256": metadata["language_data_sha256"],
        "bundledArtifactSHA256": sha256(output),
        "levelCounts": {
            f"N{level}": sum(1 for _, value in rows if value == level) for level in range(5, 0, -1)
        },
        "smokeTest": {"languageReferenceID": smoke.hex(), "rank": 5},
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the bundled JLPT level pack from Waller's lists with stephenmk's JMdict IDs."
    )
    parser.add_argument(
        "--record",
        type=Path,
        default=REPOSITORY / "apps/ios/LanguageData/Sources/JLPT-Waller-2025-08-26.source.json",
    )
    parser.add_argument(
        "--language-data",
        type=Path,
        default=REPOSITORY
        / "apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPOSITORY
        / "apps/ios/Modules/Sources/SearchExperience/Resources/JLPTLevelPack.sqlite3",
    )
    arguments = parser.parse_args()
    report = build(arguments.record, arguments.language_data, arguments.output)
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
