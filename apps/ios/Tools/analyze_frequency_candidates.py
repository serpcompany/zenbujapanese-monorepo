#!/usr/bin/env python3
"""Map frequency-list candidates and compare them with current packs, TUBELEX, and Wikipedia.

Reports coverage (mapped / ambiguous / unmapped) under FrequencyPackMappingV1 and, for lists with
readings, FrequencyPackMappingV2, plus overlap, top-1k Jaccard, and rank correlation. Used for
#376 to choose the Jiten packs; results are in LanguageData/Generated/Frequency-candidates-376.analysis.json.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import lzma
import sqlite3
import sys
import zipfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from build_jiten_frequency_packs import jiten_pairs, read_list  # noqa: E402
from analyze_ordered_json_frequency_lists import (  # noqa: E402
    MAPPING_SQL as MAPPING_V1,
    canonical_json,
    comparison,
    normalized,
    sha256,
)

MAPPING_V2 = MAPPING_V1.with_name("FrequencyPackMappingV2.sql")
TUBELEX = TOOLS.parent / "LanguageData/Sources/TUBELEX-ja-310-lemma-pos.tsv.xz"

# (rank, form, reading, count, pos, digest)
Row = tuple[int, str, str, int, str, bytes]


def jiten_rows(paths: list[Path]) -> list[Row]:
    rows: list[Row] = []
    for rank, (word, reading) in enumerate(jiten_pairs([read_list(p) for p in paths]), 1):
        digest = hashlib.sha256(canonical_json([word, reading])).digest()
        rows.append((rank, normalized(word), normalized(reading), 0, "", digest))
    return rows


def tubelex_category_rows(categories: list[str]) -> list[Row]:
    """Rank TUBELEX lemma+POS rows by the sum of the chosen `count:<category>` columns.

    Output is TSV-path compatible: word, summed count, POS, so the V1 runtime can install it.
    """
    columns = [f"count:{name}" for name in categories]
    scored: list[tuple[int, int, str, str, bytes]] = []
    with lzma.open(TUBELEX, "rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)
        missing = [c for c in columns if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"TUBELEX lacks {missing}")
        for order, record in enumerate(reader):
            if record["word"] == "[TOTAL]":
                continue
            count = sum(int(record[c]) for c in columns)
            if count <= 0:
                continue
            derived = {"word": record["word"], "count": str(count), "pos": record["pos"]}
            scored.append((-count, order, normalized(record["word"]), record["pos"],
                           hashlib.sha256(canonical_json(derived)).digest()))
    scored.sort()  # count descending; ties keep TUBELEX file order
    return [(i, form, "", -neg, pos, d) for i, (neg, _, form, pos, d) in enumerate(scored, 1)]


def ordered_json_rows(archive: Path) -> list[Row]:
    with zipfile.ZipFile(archive) as package:
        (name,) = package.namelist()
        value = json.loads(package.read(name))
    rows: list[Row] = []
    for rank, row in enumerate(value, 1):
        form, reading = (row, "") if isinstance(row, str) else row
        rows.append((rank, normalized(form), normalized(reading), 0, "",
                     hashlib.sha256(canonical_json(row)).digest()))
    return rows


def map_rows(rows: list[Row], policy: Path, language_data: Path, output: Path) -> dict[str, object]:
    """Run a mapping policy exactly as the importer does and keep the artifact for comparisons."""
    output.unlink(missing_ok=True)
    database = sqlite3.connect(output)
    database.executescript(
        "PRAGMA page_size=4096; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;"
        "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, "
        "source_reading TEXT NOT NULL, source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, "
        "source_record_digest BLOB NOT NULL);"
        "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, "
        "rank INTEGER NOT NULL, source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, "
        "mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, "
        "source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
    )
    # The mapping SQL groups by `rank`, so tied source rows must stay distinct: map on row
    # position, keep the assigned rank in `source_rank`, and swap it back in afterwards.
    database.execute("ALTER TABLE source_rows ADD COLUMN source_rank INTEGER")
    database.executemany(
        "INSERT INTO source_rows(rank, form, source_reading, source_count, source_pos, "
        "source_record_digest, source_rank) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ((position, form, reading, count, pos, digest, rank)
         for position, (rank, form, reading, count, pos, digest) in enumerate(rows, 1)),
    )
    sql = (policy.read_text(encoding="utf-8")
           .replace("{{LANGUAGE_DATA_PATH}}", str(language_data).replace("'", "''"))
           .replace("{{COVERED_SOURCE_ROWS}}", str(len(rows))))
    database.executescript(sql)
    # Re-express evidence rank in the chosen source-rank policy (position → assigned rank).
    database.execute(
        "UPDATE frequency_evidence SET rank = (SELECT s.source_rank FROM source_rows s "
        "WHERE s.rank = frequency_evidence.rank)"
    )
    count = len(rows)
    mapped = database.execute("SELECT count(*) FROM frequency_evidence").fetchone()[0]
    ambiguous = database.execute(
        "SELECT count(*) FROM resolutions WHERE candidate_count > 1 AND pos_candidate_count != 1"
    ).fetchone()[0]
    matched = database.execute("SELECT count(*) FROM resolutions").fetchone()[0]
    eligible = database.execute("SELECT count(*) FROM eligible").fetchone()[0]
    relations = dict(database.execute(
        "SELECT mapping_relation, count(*) FROM frequency_evidence GROUP BY 1 ORDER BY 1"))
    top_ambiguous = [form for (form,) in database.execute(
        "SELECT s.form || '【' || s.source_reading || '】' FROM resolutions r "
        "JOIN source_rows s ON s.rank = r.rank "
        "WHERE r.candidate_count > 1 AND r.pos_candidate_count != 1 ORDER BY r.rank LIMIT 15")]
    top_unmapped = [form for (form,) in database.execute(
        "SELECT s.form || '【' || s.source_reading || '】' FROM source_rows s "
        "WHERE s.rank NOT IN (SELECT rank FROM resolutions) ORDER BY s.rank LIMIT 15")]
    database.execute("DROP TABLE source_rows")
    database.execute("CREATE INDEX frequency_evidence_rank_index ON frequency_evidence(rank, language_reference_id)")
    database.commit()
    database.execute("VACUUM")
    database.close()
    return {
        "mappingPolicy": policy.name,
        "sourceRows": count,
        "mappedRows": mapped,
        "ambiguousRows": ambiguous,
        "unmappedRows": count - matched,
        "duplicateMappings": eligible - mapped,
        "mappedPercent": round(mapped * 100 / count, 2) if count else 0,
        "mappingRelations": relations,
        "projectedRuntimeSQLiteBytes": output.stat().st_size,
        "firstAmbiguous": top_ambiguous,
        "firstUnmapped": top_unmapped,
    }


def compare(artifact: Path, references: dict[str, Path]) -> dict[str, object]:
    database = sqlite3.connect(artifact)
    mapped = database.execute("SELECT count(*) FROM frequency_evidence").fetchone()[0]
    result = {}
    for name, reference in references.items():
        alias = name.replace("-", "_")
        database.execute(f"ATTACH DATABASE ? AS {alias}", (str(reference),))
        result[name] = comparison(database, alias, mapped)
        database.execute(f"DETACH DATABASE {alias}")
    database.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True, help="JSON list of candidates")
    parser.add_argument("--language-data", type=Path, required=True)
    parser.add_argument("--tubelex-artifact", type=Path, required=True)
    parser.add_argument("--wikipedia-artifact", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True, help="scratch dir for artifacts")
    parser.add_argument("--current-archives", type=Path, default=Path("."),
                        help="dir holding the current packs' source archives named in the plan")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    plan = json.loads(arguments.plan.read_text(encoding="utf-8"))
    arguments.work.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "schema": "zenbu.spike-376.analysis.v1",
        "languageDataSHA256": sha256(arguments.language_data),
        "mappingV1SHA256": sha256(MAPPING_V1),
        "mappingV2SHA256": sha256(MAPPING_V2),
        "candidates": [],
        "current": [],
    }
    artifacts: dict[str, Path] = {}
    # Current packs first so replacements can be compared against them.
    for current in plan.get("current", []):
        rows = ordered_json_rows(arguments.current_archives / current["archive"])
        out = arguments.work / f"current-{current['id']}.sqlite3"
        mapping = map_rows(rows, MAPPING_V1, arguments.language_data, out)
        artifacts[f"current_{current['id']}"] = out
        report["current"].append({"id": current["id"], "mapping": mapping})
        print(f"current {current['id']}: {mapping['mappedRows']:,} mapped", file=sys.stderr)
    base_refs = {"tubelex": arguments.tubelex_artifact, "wikipedia": arguments.wikipedia_artifact}
    for candidate in plan["candidates"]:
        if candidate["kind"] == "jiten":
            sources = [Path(c) for c in candidate["csv"]]
            rows = jiten_rows(sources)
            identity = {"csv": {c.stem: sha256(c) for c in sources}}
            policies = [MAPPING_V1, MAPPING_V2]
        else:
            rows = tubelex_category_rows(candidate["categories"])
            identity = {"tubelexSHA256": sha256(TUBELEX), "categories": candidate["categories"]}
            policies = [MAPPING_V1]
        entry = {"id": candidate["id"], "kind": candidate["kind"], **identity, "mappings": []}
        for policy in policies:
            out = arguments.work / f"{candidate['id']}-{policy.stem.split('.')[0]}.sqlite3"
            mapping = map_rows(rows, policy, arguments.language_data, out)
            refs = dict(base_refs)
            refs.update({f"current_{c}": artifacts[f"current_{c}"] for c in candidate.get("replaces", [])})
            refs.update({f"cand_{c}": artifacts[c] for c in candidate.get("compareWith", []) if c in artifacts})
            mapping["comparisons"] = compare(out, refs)
            entry["mappings"].append(mapping)
            artifacts[candidate["id"] if policy == policies[-1] else f"{candidate['id']}_v1"] = out
            print(f"{candidate['id']} {policy.name}: {mapping['mappedRows']:,} mapped", file=sys.stderr)
        report["candidates"].append(entry)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                                encoding="utf-8")


if __name__ == "__main__":
    main()
