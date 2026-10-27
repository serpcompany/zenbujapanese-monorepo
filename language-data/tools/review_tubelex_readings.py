#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from import_frequency_pack import (
    REPOSITORY,
    RESOURCES,
    mapping_facts,
    mapping_sql_path,
    reviewed_readings_path,
    source_readings,
    source_rows,
    validate_source,
)
from tubelex_reading_evidence import Review, SourceRow, read_jiten, read_lexicon, review_rows, write_excerpt

SOURCES = REPOSITORY / "language-data/sources"
TUBELEX_RECORD = SOURCES / "TUBELEX-ja-310-lemma-pos.source.json"
LANGUAGE_DATA = RESOURCES / "LanguageReferenceData.sqlite3"
UNIDIC = SOURCES / "unidic-cwj-3.1.0.zip"
EXCERPT = REPOSITORY / "language-data/tools/tests/fixtures/unidic-cwj-3.1.0-reviewed-readings.csv"
TOP_ROWS = 5000


@dataclass
class Listed:
    manifest: dict[str, object]
    rows: list[SourceRow]
    path: Path
    review: dict[str, object]
    ranks: dict[int, SourceRow] = field(init=False)

    def __post_init__(self) -> None:
        self.ranks = {row[0]: row for row in self.rows}


def listed(record: Path = TUBELEX_RECORD) -> Listed:
    manifest = json.loads(record.read_text(encoding="utf-8"))
    source = record.with_name(record.name.removesuffix(".source.json") + ".tsv.xz")
    validate_source(source, manifest)
    rows, _ = source_rows(source, manifest)
    path = reviewed_readings_path(manifest)
    if path is None:
        raise ValueError(f"{record.name} names no reviewed readings")
    return Listed(manifest, rows, path, json.loads(path.read_text(encoding="utf-8")))


def evidence_review(listing: Listed, unidic: Path) -> Review:
    evidence = listing.review["evidence"]
    jiten = read_jiten(SOURCES / evidence["record"])
    if jiten.lists != evidence["lists"]:
        raise ValueError(f"{listing.path.name} names Jiten's lists {evidence['lists']}, not {jiten.lists}")
    keys = {(row[1], row[3]) for row in listing.rows[:TOP_ROWS]}
    return Review(jiten, read_lexicon(unidic, keys), LANGUAGE_DATA, mapping_sql_path(listing.manifest))


def computed(listing: Listed, review: Review, ranks: list[int]) -> dict[int, dict[str, object]]:
    return review_rows(review, [listing.ranks[rank] for rank in ranks])


def scope(listing: Listed, unidic: Path) -> list[int]:
    manifest = copy.deepcopy(listing.manifest)
    del manifest["readingSource"]["reviewedReadings"]
    readings = source_readings(listing.rows, manifest, LANGUAGE_DATA, unidic)
    unplaced, _, _ = mapping_facts(listing.rows, readings, mapping_sql_path(manifest), LANGUAGE_DATA)
    return sorted(rank for rank in unplaced if rank <= TOP_ROWS)


def problems(listing: Listed, found: dict[int, dict[str, object]]) -> list[str]:
    source_ranks = {(form, pos): rank for rank, form, _, pos, _ in listing.rows}
    result = []
    for row in listing.review["rows"]:
        name = f"{row['form']} ({row['pos']}, row {row['rank']})"
        if source_ranks.get((row["form"], row["pos"])) != row["rank"]:
            result.append(f"{name} isn't that TUBELEX row")
            continue
        computed_row = found[row["rank"]]
        if row.get("jiten") != computed_row["jiten"] or row.get("verdict") != computed_row["verdict"]:
            result.append(f"{name}: its evidence or verdict isn't what the tool computes")
        verdict = computed_row["verdict"]
        if row["reading"] and (
            verdict["rule"] != "rank" or row["reading"] != verdict["reading"] or row["entry"] != verdict["entry"]
        ):
            result.append(f"{name} keeps {row['reading']} (JMdict {row['entry']}), which the rule doesn't rank")
        if not row["reading"] and row["entry"] is not None:
            result.append(f"{name} names an entry but no reading")
        if not str(row["reason"]).strip():
            result.append(f"{name} has no reason")
    return result


def rewritten(listing: Listed, found: dict[int, dict[str, object]], ranks: list[int]) -> dict[str, object]:
    reviewed = {(row["form"], row["pos"]): row for row in listing.review["rows"]}
    rows = []
    for rank in ranks:
        _, form, _, pos, _ = listing.ranks[rank]
        kept = reviewed.get((form, pos), {"reading": None, "entry": None, "reason": ""})
        rows.append(
            {"rank": rank, "form": form, "pos": pos, "reading": kept["reading"], "entry": kept["entry"], "reason": kept["reason"]}
            | found[rank]
        )
    return {**listing.review, "rows": rows}


def serialized(review: dict[str, object]) -> str:
    lines = ["{"]
    for key, value in review.items():
        if key != "rows":
            text = json.dumps(value, ensure_ascii=False, indent=2).replace("\n", "\n  ")
            lines.append(f"  {json.dumps(key)}: {text},")
    rows = [json.dumps(row, ensure_ascii=False, separators=(", ", ": ")) for row in review["rows"]]
    lines.append('  "rows": [')
    lines.extend(f"    {row}{',' if index < len(rows) - 1 else ''}" for index, row in enumerate(rows))
    lines.extend(["  ]", "}"])
    return "\n".join(lines) + "\n"


def run(arguments: argparse.Namespace) -> int:
    listing = listed()
    review = evidence_review(listing, arguments.unidic)
    ranks = scope(listing, arguments.unidic) if arguments.scope else [row["rank"] for row in listing.review["rows"]]
    found = computed(listing, review, ranks)
    if arguments.command == "excerpt":
        count = write_excerpt(arguments.unidic, review.lexicon, arguments.output)
        print(f"wrote {count} UniDic rows the review reads to {arguments.output}")
        return 0
    if arguments.command == "write":
        listing.path.write_text(serialized(rewritten(listing, found, ranks)), encoding="utf-8")
        listing = listed()
    listed_ranks = [row["rank"] for row in listing.review["rows"]]
    found_problems = problems(listing, found) + (
        [f"the list holds rows {listed_ranks}, not the unplaced rows {ranks}"] if listed_ranks != ranks else []
    )
    for problem in found_problems:
        print(problem, file=sys.stderr)
    kept = sum(1 for row in listing.review["rows"] if row["reading"])
    print(f"{len(listing.review['rows'])} rows: {kept} ranked, {len(found_problems)} problems")
    return 1 if found_problems else 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Rebuild the YouTube reviewed readings' evidence and rule verdicts from the pinned sources."
    )
    result.add_argument("command", choices=("check", "write", "excerpt"))
    result.add_argument("--unidic", type=Path, default=UNIDIC, help="unidic-cwj-3.1.0.zip, or a zip of its excerpt")
    result.add_argument("--scope", action="store_true", help="check the rows against the unplaced rows: needs all of UniDic")
    result.add_argument("--output", type=Path, default=EXCERPT, help="where excerpt writes the rows the review reads")
    return result


if __name__ == "__main__":
    raise SystemExit(run(parser().parse_args()))
