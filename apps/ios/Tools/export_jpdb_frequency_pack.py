#!/usr/bin/env python3
"""Export explicit JPDB ranks into a non-distributable Frequency Pack v2 source draft."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import lzma
import sqlite3
from pathlib import Path


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sqlite_rows(path: Path, corpus: str) -> list[tuple[int, int, int | None]]:
    database = sqlite3.connect(path)
    try:
        return [
            (int(rank), int(source_record_id), None)
            for rank, source_record_id in database.execute(
                "SELECT frequencies.rank,vocabulary.upstream_vid "
                "FROM frequencies JOIN vocabulary ON vocabulary.id=frequencies.vocabulary_id "
                "WHERE frequencies.corpus=? ORDER BY frequencies.rank,vocabulary.upstream_vid",
                (corpus,),
            )
        ]
    finally:
        database.close()


def tsv_rows(path: Path) -> list[tuple[int, int, int | None]]:
    with path.open("r", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source, delimiter="\t")
        required = {"rank", "source_record_id"}
        if not reader.fieldnames or not required <= set(reader.fieldnames):
            raise ValueError("input TSV requires rank and source_record_id")
        return [
            (
                int(row["rank"]),
                int(row["source_record_id"]),
                int(row["source_count"]) if row.get("source_count", "") else None,
            )
            for row in reader
        ]


def validate_rows(rows: list[tuple[int, int, int | None]]) -> None:
    if not rows:
        raise ValueError("JPDB rank export is empty")
    rows.sort(key=lambda row: (row[0], row[1]))
    seen: set[int] = set()
    previous_rank = 0
    for rank, record_id, count in rows:
        if rank < 1 or rank < previous_rank or rank > len(rows) or record_id < 1:
            raise ValueError("ranks and source_record_id must be positive and ordered")
        if record_id in seen:
            raise ValueError("duplicate source_record_id")
        if count is not None and count < 0:
            raise ValueError("source_count cannot be negative")
        seen.add(record_id)
        previous_rank = rank


def export(arguments: argparse.Namespace) -> None:
    if arguments.total_tokens is not None and arguments.total_tokens <= 0:
        raise ValueError("total_tokens must be positive when supplied")
    rows = (
        sqlite_rows(arguments.jpdb_sqlite, arguments.corpus)
        if arguments.jpdb_sqlite
        else tsv_rows(arguments.input_tsv)
    )
    validate_rows(rows)
    count_available = any(row[2] is not None for row in rows)
    if count_available and not all(row[2] is not None for row in rows):
        raise ValueError("source_count must be available for every row or no rows")
    arguments.output_source.parent.mkdir(parents=True, exist_ok=True)
    with lzma.open(arguments.output_source, "wt", encoding="utf-8", newline="") as output:
        columns = ["rank", "source_record_id"] + (["source_count"] if count_available else [])
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow(columns)
        for rank, record_id, count in rows:
            writer.writerow([rank, record_id] + ([count] if count_available else []))
    authorization = json.loads(arguments.authorization.read_text(encoding="utf-8"))
    source_manifest = {
        "schemaVersion": 2,
        "packID": arguments.pack_id,
        "packVersion": arguments.pack_version,
        "displayName": arguments.display_name,
        "locale": "ja",
        "domain": arguments.domain,
        "domainDescription": arguments.domain_description,
        "source": {
            "identity": arguments.source_identity,
            "owner": "JPDB",
            "snapshot": arguments.source_snapshot,
            "url": arguments.output_source.name,
            "retrievedAt": arguments.retrieved_at,
            "bytes": arguments.output_source.stat().st_size,
            "sha256": sha256(arguments.output_source),
            "coveredRows": len(rows),
            "totalTokens": arguments.total_tokens,
        },
        "format": {
            "compression": "xz-lzma2",
            "measurement": "explicit source rank" + (" and occurrence count" if count_available else ""),
            "tokenizer": "JPDB",
            "rankColumn": "rank",
            "sourceRecordIDColumn": "source_record_id",
            "countColumn": "source_count" if count_available else None,
        },
        "license": {
            "identifier": "RIGHTS-UNCONFIRMED",
            "attribution": "JPDB (owner-authorized internal evaluation only)",
            "url": "https://jpdb.io/about",
            "notice": str(arguments.authorization),
        },
        "mappingPolicyVersion": 2,
        "rankTiePolicy": "JPDB Top N frequency-band upper bound; equal bands remain tied and are ordered by source_record_id only for deterministic serialization.",
        "presentationPolicyVersion": 2,
        "presentationCapabilities": [
            "explicitTiedRank",
            "rankBandUpperBound",
            "sourceRecordIDMapping",
            "numericTopPercentile",
            *(["count"] if count_available else []),
        ],
        "runtimeInstallerVersion": 2,
        "distributionAllowed": False,
        "authorizationSHA256": hashlib.sha256(arguments.authorization.read_bytes()).hexdigest(),
        "authorizationScope": authorization.get("scope", ""),
    }
    arguments.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    arguments.output_manifest.write_text(canonical_json(source_manifest) + "\n", encoding="utf-8")
    catalog_draft = {
        "warning": "Draft only. Do not add to FrequencyPackCatalog until redistribution rights and final artifact checksums are confirmed.",
        "packID": arguments.pack_id,
        "packVersion": arguments.pack_version,
        "displayName": arguments.display_name,
        "domain": arguments.domain,
        "domainDescription": arguments.domain_description,
        "sourceIdentity": arguments.source_identity,
        "sourceSnapshot": arguments.source_snapshot,
        "measurement": source_manifest["format"]["measurement"],
        "rankTiePolicy": source_manifest["rankTiePolicy"],
        "sourceTotalTokens": arguments.total_tokens,
        "coveredSourceRows": len(rows),
        "mappingPolicyVersion": 2,
        "runtimeInstallerVersion": 2,
        "presentationPolicyVersion": 2,
        "presentationCapabilities": source_manifest["presentationCapabilities"],
        "bundled": False,
        "removable": True,
        "distributionAllowed": False,
    }
    arguments.output_catalog_draft.parent.mkdir(parents=True, exist_ok=True)
    arguments.output_catalog_draft.write_text(canonical_json(catalog_draft) + "\n", encoding="utf-8")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    inputs = result.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--jpdb-sqlite", type=Path)
    inputs.add_argument("--input-tsv", type=Path)
    result.add_argument("--corpus", default="global")
    result.add_argument("--pack-id", required=True)
    result.add_argument("--pack-version", required=True)
    result.add_argument("--display-name", required=True)
    result.add_argument("--domain", required=True)
    result.add_argument("--domain-description", required=True)
    result.add_argument("--source-identity", required=True)
    result.add_argument("--source-snapshot", required=True)
    result.add_argument("--retrieved-at", required=True)
    result.add_argument("--total-tokens", type=int)
    result.add_argument("--authorization", type=Path, required=True)
    result.add_argument("--output-source", type=Path, required=True)
    result.add_argument("--output-manifest", type=Path, required=True)
    result.add_argument("--output-catalog-draft", type=Path, required=True)
    return result


if __name__ == "__main__":
    export(parser().parse_args())
