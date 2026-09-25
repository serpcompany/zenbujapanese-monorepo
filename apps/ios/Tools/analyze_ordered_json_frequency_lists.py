#!/usr/bin/env python3
"""Analyze checksum-pinned ordered JSON frequency archives without shipping them.

This tool intentionally emits reports, not runtime artifacts. Candidate archives whose
redistribution rights are unresolved must not enter the app catalog merely because they
are publicly downloadable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import tempfile
import unicodedata
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MAPPING_SQL = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackMappingV1.sql"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


def read_rows(archive: Path, candidate: dict[str, object]) -> list[tuple[int, str, str, bytes]]:
    if archive.stat().st_size != candidate["bytes"] or sha256(archive) != candidate["sha256"]:
        raise ValueError(f"{archive.name}: archive size or SHA-256 mismatch")
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        if names != [candidate["entry"]]:
            raise ValueError(f"{archive.name}: expected exactly {candidate['entry']!r}, found {names!r}")
        value = json.loads(package.read(names[0]))
    if not isinstance(value, list) or len(value) != candidate["rows"]:
        raise ValueError(f"{archive.name}: expected {candidate['rows']} rows")
    result: list[tuple[int, str, str, bytes]] = []
    for rank, row in enumerate(value, 1):
        if isinstance(row, str):
            raw_form, raw_reading = row, ""
        elif isinstance(row, list) and len(row) == 2 and all(isinstance(item, str) for item in row):
            raw_form, raw_reading = row
        else:
            raise ValueError(f"{archive.name}: row {rank} is not a string or [written form, reading] pair")
        form, reading = normalized(raw_form), normalized(raw_reading)
        if not form:
            raise ValueError(f"{archive.name}: row {rank} has an empty normalized form")
        result.append((rank, form, reading, hashlib.sha256(canonical_json(row)).digest()))
    return result


def mapping_report(
    rows: list[tuple[int, str, str, bytes]], language_data: Path, tubelex: Path
) -> dict[str, object]:
    with tempfile.TemporaryDirectory() as directory:
        database = sqlite3.connect(Path(directory) / "candidate.sqlite3")
        database.executescript(
            "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, "
            "source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, "
            "source_record_digest BLOB NOT NULL);"
            "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, "
            "rank INTEGER NOT NULL, source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, "
            "mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, "
            "source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
        )
        count = len(rows)
        database.executemany(
            "INSERT INTO source_rows VALUES (?, ?, ?, '', ?)",
            ((rank, form, count - rank + 1, digest) for rank, form, _, digest in rows),
        )
        mapping = (
            MAPPING_SQL.read_text(encoding="utf-8")
            .replace("{{LANGUAGE_DATA_PATH}}", str(language_data).replace("'", "''"))
            .replace("{{COVERED_SOURCE_ROWS}}", str(count))
        )
        database.executescript(mapping)
        mapped = database.execute("SELECT count(*) FROM frequency_evidence").fetchone()[0]
        ambiguous = database.execute(
            "SELECT count(*) FROM resolutions WHERE candidate_count > 1 AND pos_candidate_count != 1"
        ).fetchone()[0]
        matched = database.execute("SELECT count(*) FROM resolutions").fetchone()[0]
        eligible = database.execute("SELECT count(*) FROM eligible").fetchone()[0]
        repeated_forms = count - len({form for _, form, _, _ in rows})
        repeated_pairs = count - len({(form, reading) for _, form, reading, _ in rows})
        database.execute("ATTACH DATABASE ? AS tubelex", (str(tubelex),))
        shared = database.execute(
            "SELECT count(*) FROM frequency_evidence c JOIN tubelex.frequency_evidence t "
            "ON t.language_reference_id = c.language_reference_id"
        ).fetchone()[0]
        top1000_shared = database.execute(
            "SELECT count(*) FROM frequency_evidence c JOIN tubelex.frequency_evidence t "
            "ON t.language_reference_id = c.language_reference_id WHERE c.rank <= 1000 AND t.rank <= 1000"
        ).fetchone()[0]
        top1000_candidate = database.execute(
            "SELECT count(*) FROM frequency_evidence WHERE rank <= 1000"
        ).fetchone()[0]
        top1000_tubelex = database.execute(
            "SELECT count(*) FROM tubelex.frequency_evidence WHERE rank <= 1000"
        ).fetchone()[0]
        rank_pairs = database.execute(
            "SELECT CAST(c.rank AS REAL), CAST(t.rank AS REAL) FROM frequency_evidence c "
            "JOIN tubelex.frequency_evidence t ON t.language_reference_id = c.language_reference_id"
        ).fetchall()
        rho = pearson(rank_pairs)
        return {
            "sourceRows": count,
            "uniqueNormalizedForms": count - repeated_forms,
            "repeatedNormalizedForms": repeated_forms,
            "repeatedWrittenReadingPairs": repeated_pairs,
            "mappedRows": mapped,
            "ambiguousRows": ambiguous,
            "unmappedRows": count - matched,
            "duplicateMappings": eligible - mapped,
            "mappedPercent": round(mapped * 100 / count, 2),
            "tubelex": {
                "sharedMappedLanguageReferenceIDs": shared,
                "candidateMappedOverlapPercent": round(shared * 100 / mapped, 2) if mapped else 0,
                "top1000MappedJaccard": round(
                    top1000_shared / (top1000_candidate + top1000_tubelex - top1000_shared), 4
                ),
                "sharedRankPearson": round(rho, 4) if rho is not None else None,
            },
        }


def pearson(pairs: list[tuple[float, float]]) -> float | None:
    if len(pairs) < 2:
        return None
    x_mean = sum(x for x, _ in pairs) / len(pairs)
    y_mean = sum(y for _, y in pairs) / len(pairs)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in pairs)
    x_sum = sum((x - x_mean) ** 2 for x, _ in pairs)
    y_sum = sum((y - y_mean) ** 2 for _, y in pairs)
    denominator = math.sqrt(x_sum * y_sum)
    return numerator / denominator if denominator else None


def main(arguments: argparse.Namespace) -> None:
    catalog = json.loads(arguments.catalog.read_text(encoding="utf-8"))
    output: dict[str, object] = {
        "schema": "zenbu.frequency-candidate-analysis.v1",
        "analysisToolSHA256": sha256(Path(__file__)),
        "candidateCatalogSHA256": sha256(arguments.catalog),
        "languageDataSHA256": sha256(arguments.language_data),
        "mappingPolicySHA256": sha256(MAPPING_SQL),
        "tubelexArtifactSHA256": sha256(arguments.tubelex),
        "distributionDecision": catalog["distributionDecision"],
        "candidates": [],
    }
    for candidate in catalog["candidates"]:
        archive = arguments.archives / candidate["archive"]
        rows = read_rows(archive, candidate)
        report = {key: candidate[key] for key in ("id", "name", "domain", "description", "url", "archive", "bytes", "sha256")}
        report["analysis"] = mapping_report(rows, arguments.language_data, arguments.tubelex)
        output["candidates"].append(report)
        print(f"{candidate['name']}: {report['analysis']['mappedRows']:,} mapped")
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--catalog", type=Path, required=True)
    result.add_argument("--archives", type=Path, required=True)
    result.add_argument("--language-data", type=Path, required=True)
    result.add_argument("--tubelex", type=Path, required=True)
    result.add_argument("--output", type=Path, required=True)
    return result


if __name__ == "__main__":
    main(parser().parse_args())
