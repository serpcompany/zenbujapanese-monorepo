#!/usr/bin/env python3
"""Build a deterministic app-owned Frequency Pack artifact from a curated source."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import lzma
import sqlite3
import sys
import tempfile
import unicodedata
from pathlib import Path


ARTIFACT_SCHEMA = "zenbu.frequency-pack.v1"
MAPPING_SQL = (
    Path(__file__).resolve().parents[1]
    / "Modules/Sources/SearchExperience/Resources/FrequencyPackMappingV1.sql"
)
csv.field_size_limit(16 * 1024 * 1024)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalized_form(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


def artifact_content_sha256(metadata: dict[str, str]) -> str:
    """Digest logical metadata (including mapping SHA), independent of SQLite pages.

    V1 starts with its UTF-8 domain separator, then key-sorted metadata. Each UTF-8
    key and value is prefixed by its unsigned 64-bit big-endian byte length. The
    mapping SHA transitively covers every ordered evidence row and its typed fields.
    """
    digest = hashlib.sha256(b"zenbu.frequency-pack-content.v1\0")
    for key, value in sorted(metadata.items()):
        for item in (key.encode("utf-8"), value.encode("utf-8")):
            digest.update(len(item).to_bytes(8, "big"))
            digest.update(item)
    return digest.hexdigest()


def read_manifest(path: Path) -> dict[str, object]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    required = (
        "packID", "packVersion", "displayName", "domain", "source", "format", "license",
        "rankTiePolicy",
    )
    missing = [key for key in required if not manifest.get(key)]
    if missing:
        raise ValueError(f"source manifest missing required fields: {', '.join(missing)}")
    license_data = manifest["license"]
    if not isinstance(license_data, dict) or not str(license_data.get("attribution", "")).strip():
        raise ValueError("source manifest attribution is required")
    notice = Path(str(license_data.get("notice", "")))
    if not notice.is_file() or not notice.read_text(encoding="utf-8").strip():
        raise ValueError("source manifest license notice is required")
    return manifest


def validate_source(source: Path, manifest: dict[str, object]) -> None:
    source_data = manifest["source"]
    assert isinstance(source_data, dict)
    if source.stat().st_size != int(source_data["bytes"]):
        raise ValueError("source byte count mismatch")
    if sha256(source) != source_data["sha256"]:
        raise ValueError("source SHA-256 mismatch")


def source_rows(
    source: Path, manifest: dict[str, object]
) -> tuple[list[tuple[int, str, int, str, str]], int]:
    source_data = manifest["source"]
    format_data = manifest["format"]
    assert isinstance(source_data, dict)
    assert isinstance(format_data, dict)
    word_column = str(format_data["wordColumn"])
    count_column = str(format_data["countColumn"])
    total_marker = str(format_data["totalMarker"])
    pos_column = str(format_data.get("posColumn", ""))
    expected_total = int(source_data["totalTokens"])
    rows: list[tuple[int, str, int, str, str]] = []
    observed_total: int | None = None
    handle = (
        lzma.open(source, "rt", encoding="utf-8", newline="")
        if source.suffix == ".xz"
        else source.open("r", encoding="utf-8", newline="")
    )
    with handle:
        reader = csv.DictReader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)
        if not reader.fieldnames or word_column not in reader.fieldnames or count_column not in reader.fieldnames:
            raise ValueError("source columns do not match curated manifest")
        for record in reader:
            raw_word = record[word_column]
            count = int(record[count_column])
            if raw_word == total_marker:
                observed_total = count
                continue
            word = normalized_form(raw_word)
            if not word:
                raise ValueError("source contains an empty normalized form")
            rows.append(
                (len(rows) + 1, word, count, record.get(pos_column, ""), canonical_json(record))
            )
    if observed_total != expected_total:
        raise ValueError(
            f"total token mismatch: expected {expected_total}, observed {observed_total}"
        )
    expected_rows = int(source_data["coveredRows"])
    if len(rows) != expected_rows:
        raise ValueError(f"covered row mismatch: expected {expected_rows}, observed {len(rows)}")
    return rows, observed_total


def create_artifact(
    output: Path,
    manifest: dict[str, object],
    rows: list[tuple[int, str, int, str, str]],
    total_tokens: int,
    language_data: Path,
) -> dict[str, object]:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
        candidate = Path(temporary) / output.name
        database = sqlite3.connect(candidate)
        try:
            database.executescript(
                "PRAGMA page_size=4096;"
                "PRAGMA journal_mode=OFF;"
                "PRAGMA synchronous=OFF;"
                "PRAGMA locking_mode=EXCLUSIVE;"
                "PRAGMA auto_vacuum=NONE;"
                "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;"
                "CREATE TABLE source_rows (rank INTEGER PRIMARY KEY, form TEXT NOT NULL, "
                "source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, "
                "source_record_digest BLOB NOT NULL);"
                "CREATE TABLE frequency_evidence ("
                "language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL, "
                "source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, "
                "mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, "
                "source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
            )
            database.executemany(
                "INSERT INTO source_rows VALUES (?, ?, ?, ?, ?)",
                [
                    (rank, form, count, pos, hashlib.sha256(record.encode("utf-8")).digest())
                    for rank, form, count, pos, record in rows
                ],
            )
            mapping_sql = (
                MAPPING_SQL.read_text(encoding="utf-8")
                .replace("{{LANGUAGE_DATA_PATH}}", str(language_data).replace("'", "''"))
                .replace("{{COVERED_SOURCE_ROWS}}", str(len(rows)))
            )
            database.executescript(mapping_sql)
            mapped = database.execute("SELECT count(*) FROM frequency_evidence").fetchone()[0]
            ambiguous = database.execute(
                "SELECT count(*) FROM resolutions "
                "WHERE candidate_count > 1 AND pos_candidate_count != 1"
            ).fetchone()[0]
            matched = database.execute("SELECT count(*) FROM resolutions").fetchone()[0]
            eligible = database.execute("SELECT count(*) FROM eligible").fetchone()[0]
            unmapped = len(rows) - matched
            duplicate_mappings = eligible - mapped
            mapping_digest = hashlib.sha256()
            for identifier, rank, count, form, relation, source_pos, source_digest in database.execute(
                "SELECT language_reference_id, rank, source_count, matched_form, "
                "mapping_relation, source_pos, source_record_digest "
                "FROM frequency_evidence ORDER BY language_reference_id"
            ):
                mapping_digest.update(
                    identifier
                    + rank.to_bytes(8, "big")
                    + count.to_bytes(8, "big")
                    + form.encode("utf-8")
                    + b"\0"
                    + relation.encode("utf-8")
                    + b"\0"
                    + source_pos.encode("utf-8")
                    + b"\0"
                    + source_digest
                )
            mapping_sha256 = mapping_digest.hexdigest()
            metadata = {
                "artifact_schema": ARTIFACT_SCHEMA,
                "pack_id": str(manifest["packID"]),
                "pack_version": str(manifest["packVersion"]),
                "mapping_policy_version": str(manifest.get("mappingPolicyVersion", 1)),
                "presentation_policy_version": str(manifest.get("presentationPolicyVersion", 1)),
                "source_total_tokens": str(total_tokens),
                "covered_source_rows": str(len(rows)),
                "mapped_rows": str(mapped),
                "ambiguous_rows": str(ambiguous),
                "unmapped_rows": str(unmapped),
                "duplicate_mappings": str(duplicate_mappings),
                "mapping_sha256": mapping_sha256,
                "mapping_policy_sha256": sha256(MAPPING_SQL),
                "language_data_sha256": sha256(language_data),
            }
            artifact_content_sha = artifact_content_sha256(metadata)
            database.executemany(
                "INSERT INTO metadata VALUES (?, ?)", sorted(metadata.items())
            )
            database.execute("DROP TABLE source_rows")
            database.execute(
                "CREATE INDEX frequency_evidence_rank_index ON frequency_evidence(rank, language_reference_id)"
            )
            database.commit()
            database.execute("VACUUM")
        finally:
            database.close()
        candidate.replace(output)

    return {
        "mappedRows": mapped,
        "ambiguousRows": ambiguous,
        "unmappedRows": unmapped,
        "duplicateMappings": duplicate_mappings,
        "mappingSHA256": mapping_sha256,
        "artifactContentSHA256": artifact_content_sha,
    }


def import_pack(arguments: argparse.Namespace) -> None:
    source = arguments.source.resolve()
    source_manifest = arguments.source_manifest.resolve()
    language_data = arguments.language_data.resolve()
    output = arguments.output.resolve()
    output_manifest = arguments.output_manifest.resolve()
    manifest = read_manifest(source_manifest)
    validate_source(source, manifest)
    rows, total_tokens = source_rows(source, manifest)
    mapping = create_artifact(output, manifest, rows, total_tokens, language_data)
    import_record = {
        "schema": "zenbu.frequency-pack-import.v1",
        "sourceManifest": manifest,
        "sourceManifestSHA256": sha256(source_manifest),
        "sourceSHA256": sha256(source),
        "languageDataSHA256": sha256(language_data),
        "importerSHA256": sha256(Path(__file__)),
        "mappingPolicySHA256": sha256(MAPPING_SQL),
        "artifactBytes": output.stat().st_size,
        "artifactSHA256": sha256(output),
        **mapping,
    }
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_text(canonical_json(import_record) + "\n", encoding="utf-8")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--source", type=Path, required=True)
    result.add_argument("--source-manifest", type=Path, required=True)
    result.add_argument("--language-data", type=Path, required=True)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--output-manifest", type=Path, required=True)
    return result


if __name__ == "__main__":
    try:
        import_pack(parser().parse_args())
    except (OSError, ValueError, KeyError, sqlite3.Error) as error:
        print(f"frequency pack import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
