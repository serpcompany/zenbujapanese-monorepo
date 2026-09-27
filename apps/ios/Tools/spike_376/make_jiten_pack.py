#!/usr/bin/env python3
"""Spike #376: package one or more Jiten CSVs as a V2 ordered-JSON source and print its catalog manifest.

The source is `[dictionary form, reading]` pairs in Jiten order with the unobserved tail dropped,
zipped deterministically. Manifest counts and digests are computed exactly as
FrequencyPackInstaller verifies them on device.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import MAPPING_V2, jiten_pairs  # noqa: E402
from analyze_ordered_json_frequency_lists import (  # noqa: E402
    artifact_content_sha256,
    canonical_json,
    normalized,
    sha256,
)


def write_source(csv_paths: list[Path], archive: Path, entry: str) -> list[list[str]]:
    pairs = [list(pair) for pair in jiten_pairs(csv_paths)]
    raw = json.dumps(pairs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    info = zipfile.ZipInfo(entry, date_time=(2026, 9, 27, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr(info, raw)
    return pairs


def mapping_fields(pairs: list[list[str]], language_data: Path, pack_id: str, version: str) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        database = sqlite3.connect(Path(directory) / "pack.sqlite3")
        database.executescript(
            "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, "
            "source_reading TEXT NOT NULL, source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, "
            "source_record_digest BLOB NOT NULL);"
            "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL, "
            "source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, mapping_relation TEXT NOT NULL, "
            "matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
        )
        database.executemany(
            "INSERT INTO source_rows VALUES (?, ?, ?, 0, '', ?)",
            ((rank, normalized(word), normalized(reading),
              hashlib.sha256(canonical_json([word, reading])).digest())
             for rank, (word, reading) in enumerate(pairs, 1)),
        )
        database.executescript(
            MAPPING_V2.read_text(encoding="utf-8")
            .replace("{{LANGUAGE_DATA_PATH}}", str(language_data).replace("'", "''"))
            .replace("{{COVERED_SOURCE_ROWS}}", str(len(pairs)))
        )
        one = lambda sql: database.execute(sql).fetchone()[0]  # noqa: E731
        mapped = one("SELECT count(*) FROM frequency_evidence")
        ambiguous = one("SELECT count(*) FROM resolutions WHERE candidate_count>1 AND pos_candidate_count != 1")
        unmapped = len(pairs) - one("SELECT count(*) FROM resolutions")
        duplicates = one("SELECT count(*) FROM eligible") - mapped
        digest = hashlib.sha256()
        for identifier, rank, count, form, relation, pos, source_digest in database.execute(
            "SELECT language_reference_id, rank, source_count, matched_form, mapping_relation, "
            "source_pos, source_record_digest FROM frequency_evidence ORDER BY language_reference_id"
        ):
            digest.update(identifier + rank.to_bytes(8, "big") + count.to_bytes(8, "big")
                          + form.encode() + b"\0" + relation.encode() + b"\0" + pos.encode()
                          + b"\0" + source_digest)
        smoke = database.execute(
            "SELECT lower(hex(language_reference_id)), rank FROM frequency_evidence "
            "ORDER BY rank, language_reference_id LIMIT 1").fetchone()
        database.close()
    fields = {
        "coveredSourceRows": len(pairs), "mappedRows": mapped, "ambiguousRows": ambiguous,
        "unmappedRows": unmapped, "duplicateMappings": duplicates, "mappingSHA256": digest.hexdigest(),
    }
    fields["artifactContentSHA256"] = artifact_content_sha256({
        "artifact_schema": "zenbu.frequency-pack.v1", "pack_id": pack_id, "pack_version": version,
        "mapping_policy_version": "2", "presentation_policy_version": "1", "source_total_tokens": "0",
        "covered_source_rows": str(len(pairs)), "mapped_rows": str(mapped),
        "ambiguous_rows": str(ambiguous), "unmapped_rows": str(unmapped),
        "duplicate_mappings": str(duplicates), "mapping_sha256": fields["mappingSHA256"],
        "mapping_policy_sha256": sha256(MAPPING_V2), "language_data_sha256": sha256(language_data),
    })
    fields["smokeTest"] = {"languageReferenceID": smoke[0], "rank": smoke[1]}
    return fields


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", type=Path, required=True, help="pack spec JSON (see packs.json)")
    parser.add_argument("--id", required=True, help="pack spec id to build")
    parser.add_argument("--jiten-dir", type=Path, required=True, help="dir holding <mediaType>.csv")
    parser.add_argument("--language-data", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--analysis", type=Path, help="generated analysis record to update")
    arguments = parser.parse_args()
    spec = next(p for p in json.loads(arguments.spec.read_text(encoding="utf-8"))["packs"]
                if p["id"] == arguments.id)
    csv_paths = [arguments.jiten_dir / f"{media}.csv" for media in spec["jitenMediaTypes"]]
    media = " + ".join(spec["jitenMediaTypes"])
    entry = f"jiten-{spec['id']}.json"
    archive = arguments.out_dir / f"{entry}.zip"
    arguments.out_dir.mkdir(parents=True, exist_ok=True)
    pairs = write_source(csv_paths, archive, entry)
    with zipfile.ZipFile(archive) as package:
        raw_bytes = package.getinfo(entry).file_size
    pack_id, version = f"zenbu.jiten.{spec['id']}.ja.ordered-v2", spec["packVersion"]
    merge = (" Lists are merged by mean list percentile; a word missing from a list counts as "
             "its last position." if len(csv_paths) > 1 else "")
    manifest = {
        "packID": pack_id,
        "packVersion": version,
        "displayName": spec["displayName"],
        "domain": spec["domain"],
        "domainDescription": (
            f"{spec['description']} Built from Jiten (jiten.moe) {media} frequency data, CC BY-SA 4.0. "
            "Rank is the one-based position in the list; occurrence counts are not supplied."),
        "sourceIdentity": f"Jiten frequency list · {media}",
        "sourceSnapshot": ",".join(sha256(path) for path in csv_paths),
        "measurement": "ordered-list position (occurrence counts unavailable)",
        "tokenizer": "Jiten (JMdict-linked)",
        "normalization": "NFKC dictionary forms and readings; canonical app forms",
        "rankTiePolicy": ("One-based position in Jiten's published order; the unobserved tail bucket "
                          "is dropped and every remaining row receives a distinct rank." + merge),
        "downloadURL": f"{arguments.base_url.rstrip('/')}/{archive.name}",
        "sourceBytes": archive.stat().st_size,
        "sourceSHA256": sha256(archive),
        "sourceTotalTokens": 0,
        **mapping_fields(pairs, arguments.language_data, pack_id, version),
        "mappingPolicyVersion": 2,
        "mappingPolicySHA256": sha256(MAPPING_V2),
        "offlineImporterSHA256": sha256(Path(__file__)),
        "runtimeInstallerVersion": 1,
        "presentationPolicyVersion": 1,
        "presentationCapabilities": ["orderedSourceRank", "numericTopPercentile"],
        "languageDataSHA256": sha256(arguments.language_data),
        "bundledArtifactSHA256": None,
        "corpusDocuments": None, "corpusVideos": None, "corpusChannels": None,
        "attribution": f"Jiten (jiten.moe) {media} frequency data, CC BY-SA 4.0; modified.",
        "bundled": False,
        "removable": True,
        "orderedJSONSource": {"archiveEntry": entry, "rawJSONBytes": raw_bytes},
    }
    manifest["smokeTest"] = manifest.pop("smokeTest")
    if arguments.analysis:
        record_analysis(arguments.analysis, manifest, spec, csv_paths)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def record_analysis(path: Path, manifest: dict, spec: dict, csv_paths: list[Path]) -> None:
    """Upsert this pack's evidence into the generated Jiten analysis record."""
    record = (json.loads(path.read_text(encoding="utf-8")) if path.is_file()
              else {"schema": "zenbu.frequency-candidate-analysis.v2", "candidates": []})
    keys = ("coveredSourceRows", "mappedRows", "ambiguousRows", "unmappedRows",
            "duplicateMappings", "mappingSHA256", "artifactContentSHA256", "smokeTest")
    candidate = {
        "id": spec["id"],
        "packID": manifest["packID"],
        "packVersion": manifest["packVersion"],
        "jitenCSVSHA256": {p.stem: sha256(p) for p in csv_paths},
        "sourceSHA256": manifest["sourceSHA256"],
        "analysis": {key: manifest[key] for key in keys},
    }
    record.update({
        "builderSHA256": manifest["offlineImporterSHA256"],
        "mappingPolicySHA256": manifest["mappingPolicySHA256"],
        "languageDataSHA256": manifest["languageDataSHA256"],
    })
    record["candidates"] = sorted(
        [c for c in record["candidates"] if c["packID"] != manifest["packID"]] + [candidate],
        key=lambda c: c["packID"])
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8")


if __name__ == "__main__":
    main()
