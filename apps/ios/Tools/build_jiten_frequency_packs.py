#!/usr/bin/env python3
"""Build downloadable Frequency Pack sources from pinned Jiten lists and update the catalog.

Each pack in `Jiten-<date>.source.json` becomes a ZIP holding one JSON array of
`[dictionary form, reading]` pairs in rank order. The app installs it with
FrequencyPackMappingV2, which matches on both form and reading. Manifest counts and digests are
computed exactly as FrequencyPackInstaller verifies them on device.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import lzma
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from analyze_ordered_json_frequency_lists import (  # noqa: E402
    artifact_content_sha256,
    canonical_json,
    normalized,
    sha256,
)

IOS = TOOLS.parent
RESOURCES = IOS / "Modules/Sources/SearchExperience/Resources"
MAPPING_V2 = RESOURCES / "FrequencyPackMappingV2.sql"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
LANGUAGE_DATA = RESOURCES / "LanguageReferenceData.sqlite3"
SOURCE_RECORD = IOS / "LanguageData/Sources/Jiten-2026-09-27.source.json"
ANALYSIS = IOS / "LanguageData/Generated/Jiten-2026-09-27.analysis.json"
CDN_ORIGIN = "https://cdn.zenbujapanese.com/frequency-packs"
ZIP_TIMESTAMP = (2026, 9, 27, 0, 0, 0)


def assign_ranks(source_ranks: list[int]) -> tuple[list[int], int]:
    """Return (rank for each kept row, number of leading rows to keep).

    Drop the final bucket at max(source_ranks), which holds words Jiten never observed, then rank
    by row position. Position keeps the "every row receives a distinct rank" contract; Jiten's
    order inside a tie bucket is kept as published.
    """
    if not source_ranks:
        return [], 0
    tail = max(source_ranks)
    keep = len(source_ranks)
    while keep and source_ranks[keep - 1] == tail:
        keep -= 1
    if keep == 0 or len(source_ranks) - keep < 2:  # no real tail bucket: keep everything
        keep = len(source_ranks)
    return list(range(1, keep + 1)), keep


def read_list(path: Path, expected_sha256: str | None = None) -> list[tuple[str, str]]:
    raw = lzma.open(path).read() if path.suffix == ".xz" else path.read_bytes()
    if expected_sha256 and hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError(f"{path.name}: CSV SHA-256 does not match the source record")
    records = list(csv.DictReader(io.StringIO(raw.decode("utf-8"), newline="")))
    if not records or list(records[0]) != ["Word", "Form", "Rank"]:
        raise ValueError(f"{path.name}: expected Word,Form,Rank")
    _, keep = assign_ranks([int(r["Rank"]) for r in records])
    return [(r["Word"], r["Form"]) for r in records[:keep]]


def jiten_pairs(lists: list[list[tuple[str, str]]]) -> list[tuple[str, str]]:
    """Merge ranked lists by mean list percentile (position / kept rows).

    A pair missing from a list counts as percentile 1.0, so a word must be common across all the
    merged media to rank high. Ties keep first-seen order. One list is returned unchanged.
    """
    if len(lists) == 1:
        return lists[0]
    percentiles: dict[tuple[str, str], list[float]] = {}
    for index, pairs in enumerate(lists):
        for position, pair in enumerate(pairs, 1):
            slots = percentiles.setdefault(pair, [1.0] * len(lists))
            slots[index] = min(slots[index], position / len(pairs))
    order = {pair: i for i, pair in enumerate(percentiles)}
    return sorted(percentiles, key=lambda pair: (sum(percentiles[pair]) / len(lists), order[pair]))


def write_source(pairs: list[tuple[str, str]], archive: Path, entry: str) -> int:
    raw = json.dumps([list(p) for p in pairs], ensure_ascii=False, separators=(",", ":")).encode()
    info = zipfile.ZipInfo(entry, date_time=ZIP_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr(info, raw)
    return len(raw)


def mapping_fields(pairs: list[tuple[str, str]], pack_id: str, version: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory() as directory:
        database = sqlite3.connect(Path(directory) / "pack.sqlite3")
        database.executescript(
            "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, "
            "source_reading TEXT NOT NULL, source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, "
            "source_record_digest BLOB NOT NULL);"
            "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, "
            "rank INTEGER NOT NULL, source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, "
            "mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, "
            "source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
        )
        database.executemany(
            "INSERT INTO source_rows VALUES (?, ?, ?, 0, '', ?)",
            ((rank, normalized(word), normalized(reading),
              hashlib.sha256(canonical_json([word, reading])).digest())
             for rank, (word, reading) in enumerate(pairs, 1)),
        )
        database.executescript(
            MAPPING_V2.read_text(encoding="utf-8")
            .replace("{{LANGUAGE_DATA_PATH}}", str(LANGUAGE_DATA).replace("'", "''"))
            .replace("{{COVERED_SOURCE_ROWS}}", str(len(pairs)))
        )

        def one(sql: str) -> int:
            return database.execute(sql).fetchone()[0]

        mapped = one("SELECT count(*) FROM frequency_evidence")
        ambiguous = one(
            "SELECT count(*) FROM resolutions WHERE candidate_count>1 AND pos_candidate_count != 1")
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
    metadata = {
        "artifact_schema": "zenbu.frequency-pack.v1", "pack_id": pack_id, "pack_version": version,
        "mapping_policy_version": "2", "presentation_policy_version": "1",
        "source_total_tokens": "0", "covered_source_rows": str(len(pairs)),
        "mapped_rows": str(mapped), "ambiguous_rows": str(ambiguous),
        "unmapped_rows": str(unmapped), "duplicate_mappings": str(duplicates),
        "mapping_sha256": digest.hexdigest(), "mapping_policy_sha256": sha256(MAPPING_V2),
        "language_data_sha256": sha256(LANGUAGE_DATA),
    }
    return {
        "coveredSourceRows": len(pairs), "mappedRows": mapped, "ambiguousRows": ambiguous,
        "unmappedRows": unmapped, "duplicateMappings": duplicates,
        "mappingSHA256": digest.hexdigest(),
        "artifactContentSHA256": artifact_content_sha256(metadata),
        "smokeTest": {"languageReferenceID": smoke[0], "rank": smoke[1]},
    }


def manifest_for(spec: dict, record: dict, out_dir: Path) -> dict[str, object]:
    media = spec["jitenMediaTypes"]
    files = [record["files"][m] for m in media]
    lists = [read_list(SOURCE_RECORD.parent / f["file"], f["csvSHA256"]) for f in files]
    pairs = jiten_pairs(lists)
    pack_id, version = f"zenbu.jiten.{spec['id']}.ja.ordered-v2", record["retrievedAt"]
    entry = f"jiten-{spec['id']}.json"
    archive = out_dir / f"{pack_id}.json.zip"
    raw_bytes = write_source(pairs, archive, entry)
    source_sha = sha256(archive)
    joined = " + ".join(media)
    merge = (" Lists are merged by mean list percentile; a word missing from a list counts as "
             "its last position." if len(media) > 1 else "")
    fields = mapping_fields(pairs, pack_id, version)
    return {
        "packID": pack_id,
        "packVersion": version,
        "displayName": spec["displayName"],
        "domain": spec["domain"],
        "domainDescription": (
            f"{spec['description']} Built from Jiten (jiten.moe) {joined} frequency data, "
            "CC BY-SA 4.0. Rank is the one-based position in the list; occurrence counts are "
            "not supplied."),
        "sourceIdentity": f"Jiten frequency list · {joined}",
        "sourceSnapshot": ",".join(f["csvSHA256"] for f in files),
        "measurement": "ordered-list position (occurrence counts unavailable)",
        "tokenizer": "Jiten (JMdict-linked)",
        "normalization": "NFKC dictionary forms and readings; canonical app forms",
        "rankTiePolicy": ("One-based position in Jiten's published order; the unobserved tail "
                          "bucket is dropped and every remaining row receives a distinct rank."
                          + merge),
        "downloadURL": f"{CDN_ORIGIN}/{pack_id}/{source_sha}.json.zip",
        "sourceBytes": archive.stat().st_size,
        "sourceSHA256": source_sha,
        "sourceTotalTokens": 0,
        **{k: v for k, v in fields.items() if k != "smokeTest"},
        "mappingPolicyVersion": 2,
        "mappingPolicySHA256": sha256(MAPPING_V2),
        "offlineImporterSHA256": sha256(Path(__file__)),
        "runtimeInstallerVersion": 1,
        "presentationPolicyVersion": 1,
        "presentationCapabilities": ["orderedSourceRank", "numericTopPercentile"],
        "languageDataSHA256": sha256(LANGUAGE_DATA),
        "bundledArtifactSHA256": None,
        "corpusDocuments": None,
        "corpusVideos": None,
        "corpusChannels": None,
        "attribution": f"Jiten (jiten.moe) {joined} frequency data, CC BY-SA 4.0; modified.",
        "bundled": False,
        "removable": True,
        "orderedJSONSource": {"archiveEntry": entry, "rawJSONBytes": raw_bytes},
        "smokeTest": fields["smokeTest"],
    }


def update_catalog(manifests: list[dict[str, object]]) -> None:
    """Replace every Jiten pack in the catalog with `manifests`, after the licensed core packs.

    A replaced manifest that changed moves to `trustedHistoricalManifests`, so a pack a learner
    already installed from it stays trusted.
    """
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    rebuilt = {m["packID"]: m for m in manifests}
    for old in catalog["packs"]:
        if old["packID"] in rebuilt and old != rebuilt[old["packID"]] \
                and old not in catalog["trustedHistoricalManifests"]:
            catalog["trustedHistoricalManifests"].append(old)
    others = [m for m in catalog["packs"] if not m["packID"].startswith("zenbu.jiten.")]
    core = [m for m in others if m["bundled"] or m["packID"].startswith("zenbu.wikipedia.")]
    rest = [m for m in others if m not in core]
    catalog["packs"] = core + manifests + rest
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_analysis(manifests: list[dict[str, object]], record: dict) -> None:
    keys = ("coveredSourceRows", "mappedRows", "ambiguousRows", "unmappedRows",
            "duplicateMappings", "mappingSHA256", "artifactContentSHA256", "smokeTest")
    analysis = {
        "schema": "zenbu.frequency-candidate-analysis.v2",
        "builderSHA256": sha256(Path(__file__)),
        "sourceRecordSHA256": sha256(SOURCE_RECORD),
        "mappingPolicySHA256": sha256(MAPPING_V2),
        "languageDataSHA256": sha256(LANGUAGE_DATA),
        "candidates": [
            {"packID": m["packID"], "packVersion": m["packVersion"],
             "sourceSHA256": m["sourceSHA256"], "analysis": {k: m[k] for k in keys}}
            for m in manifests
        ],
    }
    ANALYSIS.write_text(json.dumps(analysis, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                        encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True,
                        help="where to write the source ZIPs for publish_frequency_pack_sources.py")
    arguments = parser.parse_args()
    arguments.out_dir.mkdir(parents=True, exist_ok=True)
    record = json.loads(SOURCE_RECORD.read_text(encoding="utf-8"))
    manifests = []
    for spec in record["packs"]:
        manifest = manifest_for(spec, record, arguments.out_dir)
        manifests.append(manifest)
        print(f"{manifest['displayName']}: {manifest['mappedRows']:,} mapped", file=sys.stderr)
    update_catalog(manifests)
    write_analysis(manifests, record)


if __name__ == "__main__":
    main()
