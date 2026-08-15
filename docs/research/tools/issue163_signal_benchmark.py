#!/usr/bin/env python3
"""Replay issue #163 signal policies against the exact #151 retrieval artifact."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sqlite3
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal


ROOT = Path(__file__).resolve().parents[3]
DB_REL = "apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
CONTEXTS_REL = "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv"
OBSERVATIONS_REL = "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv"
COMPARISON_REL = "apps/ios/LanguageData/Generated/ExampleSentenceRetrieval-v1-comparison-rows.tsv"
VISIBLE_REL = "apps/ios/LanguageData/Generated/ExampleSentenceRetrieval-v1-rows.tsv"
SNAPSHOT_REL = "docs/research/fixtures/example-sentence-quality-signals-issue-163.json"

EXPECTED_SHA256 = {
    DB_REL: "248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f",
    CONTEXTS_REL: "b91487df29df9bc731765b3a437216d2656bf4761b64c609c12a80189b93a6d8",
    OBSERVATIONS_REL: "ffbad9f0a93843507058045f0820dec6f242c6041db224b0ec8e79574c5c7dbc",
    COMPARISON_REL: "3dd0a21b7628da6352909e32c310a1f0ae63bcccc13aa11b4df9a1f88ecc9100",
    VISIBLE_REL: "65c47a1502c9848f1f8ed18dcb06f025d06bd3586643b90272c0f8f16a6d4d15",
    SNAPSHOT_REL: "b311fadd833e3d57d9de65e2969f5fd17b4f5f6188634bb299898435016b9920",
}
EXPECTED_ROW_COUNT = 9_479
EXPECTED_ROWS_SHA256 = "6131e8f29d8b15f90b8be30e8d525299decd857c72a612e4b7224616b63a74d5"
PAIR_ID_PATTERN = re.compile(r"esp1_[0-9a-f]{32}\Z")
TIMESTAMP_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\Z")
BOOLEAN_FIELDS = {
    "audio", "beginner_list", "both_original", "cc0_both", "cc0_either",
    "either_original", "goodexample_list", "jpn_indexed", "negative_list",
    "negative_tag", "ngsl_level1_list", "positive_tag", "proofread_list", "reviewed",
}
INTEGER_FIELDS = {
    "list_count", "negative_reviews", "ogte_level", "owner_skill", "positive_reviews",
    "review_score", "wordfreq_zipf_milli",
}
TIMESTAMP_FIELDS = {"pair_created_at", "pair_modified_at"}
EXPECTED_ROW_FIELDS = {"pair_id"} | BOOLEAN_FIELDS | INTEGER_FIELDS | TIMESTAMP_FIELDS


@dataclass(frozen=True)
class RankTerm:
    field: str
    direction: Literal["ascending", "descending"]
    missing: Literal["first", "last"] = "last"


@dataclass(frozen=True)
class FilterTerm:
    field: str
    value: bool | int


@dataclass(frozen=True)
class Policy:
    name: str
    rank_terms: tuple[RankTerm, ...] = ()
    filter_term: FilterTerm | None = None


POLICIES = (
    Policy("v1"),
    Policy("positive-review-count-first", (RankTerm("positive_reviews", "descending"), RankTerm("negative_reviews", "ascending"))),
    Policy("review-score-first", (RankTerm("review_score", "descending"), RankTerm("positive_reviews", "descending"))),
    Policy("negative-review-last", (RankTerm("negative_reviews", "ascending"),)),
    Policy("negative-review-filter", filter_term=FilterTerm("negative_reviews", 0)),
    Policy("positive-tag-first", (RankTerm("positive_tag", "descending"),)),
    Policy("negative-tag-last", (RankTerm("negative_tag", "ascending"),)),
    Policy("proofread-list-first", (RankTerm("proofread_list", "descending"),)),
    Policy("proofread-list-filter", filter_term=FilterTerm("proofread_list", True)),
    Policy("public-list-count-first", (RankTerm("list_count", "descending"),)),
    Policy("beginner-list-first", (RankTerm("beginner_list", "descending"),)),
    Policy("ngsl-level1-list-first", (RankTerm("ngsl_level1_list", "descending"),)),
    Policy("goodexample-list-first", (RankTerm("goodexample_list", "descending"),)),
    Policy("negative-list-last", (RankTerm("negative_list", "ascending"),)),
    Policy("ogte-level-first", (RankTerm("ogte_level", "ascending"),)),
    Policy("audio-first", (RankTerm("audio", "descending"),)),
    Policy("both-original-first", (RankTerm("both_original", "descending"),)),
    Policy("either-original-first", (RankTerm("either_original", "descending"),)),
    Policy("cc0-both-first", (RankTerm("cc0_both", "descending"),)),
    Policy("owner-skill-first", (RankTerm("owner_skill", "descending"),)),
    Policy("jpn-indices-first", (RankTerm("jpn_indexed", "descending"),)),
    Policy("jpn-indices-filter", filter_term=FilterTerm("jpn_indexed", True)),
    Policy("wordfreq-whole-phrase-first", (RankTerm("wordfreq_zipf_milli", "descending"),)),
    Policy("pair-created-oldest-first", (RankTerm("pair_created_at", "ascending"),)),
    Policy("pair-created-newest-first", (RankTerm("pair_created_at", "descending"),)),
    Policy("pair-row-update-oldest-first", (RankTerm("pair_modified_at", "ascending"),)),
    Policy("pair-row-update-newest-first", (RankTerm("pair_modified_at", "descending"),)),
)

REVEALED = {
    "RH01": ("book", "esp1_0a2778adc2daccfa9ffbd937376cb00a"),
    "RH02": ("notebook", "esp1_969260f85c35d39c64874f46ef0b3602"),
    "RH03": ("looked after", "esp1_555ca825e1eeb4eb9767c33c77dc5ea8"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sequence_sha256(values: list[str]) -> str:
    return hashlib.sha256(json.dumps(values, separators=(",", ":")).encode()).hexdigest()


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def validate_inputs() -> None:
    failures = []
    for relative, expected in EXPECTED_SHA256.items():
        actual = sha256(ROOT / relative)
        if actual != expected:
            failures.append(f"{relative}: expected {expected}, got {actual}")
    if failures:
        raise RuntimeError("input checksum mismatch\n" + "\n".join(failures))


def validate_snapshot() -> dict[str, dict[str, Any]]:
    raw = json.loads((ROOT / SNAPSHOT_REL).read_text(encoding="utf-8"))
    rows = raw.get("rows")
    if raw.get("schema_version") != 1 or raw.get("row_count") != EXPECTED_ROW_COUNT:
        raise RuntimeError("snapshot schema or declared row count mismatch")
    if not isinstance(rows, list) or len(rows) != EXPECTED_ROW_COUNT:
        raise RuntimeError("snapshot physical row count mismatch")
    rows_hash = hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if rows_hash != EXPECTED_ROWS_SHA256 or raw.get("snapshot_rows_sha256") != EXPECTED_ROWS_SHA256:
        raise RuntimeError("snapshot normalized-row checksum mismatch")
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        if set(row) != EXPECTED_ROW_FIELDS:
            raise RuntimeError("snapshot feature fields mismatch")
        pair_id = row.get("pair_id")
        if not isinstance(pair_id, str) or not PAIR_ID_PATTERN.fullmatch(pair_id):
            raise RuntimeError(f"invalid app-owned pair ID: {pair_id!r}")
        if pair_id in indexed:
            raise RuntimeError(f"duplicate app-owned pair ID: {pair_id}")
        for field in BOOLEAN_FIELDS:
            if not isinstance(row[field], bool):
                raise RuntimeError(f"invalid boolean {field} for {pair_id}")
        for field in INTEGER_FIELDS:
            if isinstance(row[field], bool) or not isinstance(row[field], int):
                raise RuntimeError(f"invalid integer {field} for {pair_id}")
        for field in TIMESTAMP_FIELDS:
            value = row.get(field)
            if value is not None and (not isinstance(value, str) or not TIMESTAMP_PATTERN.fullmatch(value)):
                raise RuntimeError(f"invalid {field} for {pair_id}")
            if value is not None:
                datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        indexed[pair_id] = row
    return indexed


def phrase_range(text: str, raw_offsets: str) -> tuple[int, int] | None:
    values = [int(value) for value in raw_offsets.split()]
    if len(values) % 4:
        raise RuntimeError("invalid FTS offsets")
    offsets = [dict(term=values[i + 1], byte=values[i + 2], length=values[i + 3]) for i in range(0, len(values), 4)]
    if not offsets:
        return None
    term_count = max(item["term"] for item in offsets) + 1
    ordered = sorted(offsets, key=lambda item: (item["byte"], item["term"]))
    encoded = text.encode("utf-8")
    for start in range(len(ordered)):
        if ordered[start]["term"] != 0:
            continue
        phrase = ordered[start : start + term_count]
        if [item["term"] for item in phrase] != list(range(term_count)):
            continue
        if any(
            any(mark in encoded[left["byte"] + left["length"] : right["byte"]].decode("utf-8") for mark in (". ", "? ", "! "))
            for left, right in zip(phrase, phrase[1:])
        ):
            continue
        before = encoded[: phrase[0]["byte"]].decode("utf-8")
        matched = encoded[phrase[0]["byte"] : phrase[-1]["byte"] + phrase[-1]["length"]].decode("utf-8")
        return len(before), len(matched)
    return None


def english_candidates(db: sqlite3.Connection, query: str) -> list[str]:
    expression = f'"{query}"'
    exact: dict[str, tuple[int, int] | None] = {}
    for row in db.execute(
        """
        SELECT 'esp1_' || lower(hex(m.pair_id)) id, e.english,
               offsets(example_sentence_english_exact_fts) matched_offsets
        FROM example_sentence_english_exact_fts x
        JOIN example_sentence_fts_map m ON m.fts_rowid=x.docid
        JOIN example_sentences e ON e.id=m.pair_id
        WHERE example_sentence_english_exact_fts MATCH ?
        """,
        (expression,),
    ):
        exact[row["id"]] = phrase_range(row["english"], row["matched_offsets"])
    candidates = []
    for row in db.execute(
        """
        SELECT 'esp1_' || lower(hex(e.id)) id, e.japanese, e.english,
               offsets(example_sentence_english_porter_fts) matched_offsets,
               matchinfo(example_sentence_english_porter_fts, 'l') document_length
        FROM example_sentence_english_porter_fts f
        JOIN example_sentence_fts_map m ON m.fts_rowid=f.docid
        JOIN example_sentences e ON e.id=m.pair_id
        WHERE example_sentence_english_porter_fts MATCH ?
        """,
        (expression,),
    ):
        porter = phrase_range(row["english"], row["matched_offsets"])
        if porter is None:
            continue
        exact_range = exact.get(row["id"])
        chosen = exact_range or porter
        term_count = int.from_bytes(row["document_length"][:4], "little")
        rank = (0 if exact_range else 1, chosen[0], term_count, len(row["japanese"]), row["id"])
        candidates.append((row["id"], rank))
    if not any(rank[0] == 0 for _, rank in candidates):
        return []
    return [pair_id for pair_id, _ in sorted(candidates, key=lambda item: item[1])]


def scalar_rank(value: Any, term: RankTerm) -> tuple[int, int]:
    if value is None or (term.field == "owner_skill" and value == -1):
        return (1 if term.missing == "last" else -1, 0)
    if isinstance(value, bool):
        normalized = int(value)
    elif isinstance(value, int):
        normalized = value
    elif isinstance(value, str) and TIMESTAMP_PATTERN.fullmatch(value):
        normalized = int(re.sub(r"\D", "", value))
    else:
        raise RuntimeError(f"unsupported rank value {term.field}={value!r}")
    return (0, normalized if term.direction == "ascending" else -normalized)


def apply_policy(ids: list[str], policy: Policy, features: dict[str, dict[str, Any]]) -> list[str]:
    if policy.filter_term is None:
        filtered = list(ids)
    else:
        term = policy.filter_term
        filtered = [pair_id for pair_id in ids if features[pair_id][term.field] == term.value]
    base_rank = {pair_id: index for index, pair_id in enumerate(filtered)}
    return sorted(
        filtered,
        key=lambda pair_id: tuple(scalar_rank(features[pair_id][term.field], term) for term in policy.rank_terms)
        + (base_rank[pair_id],),
    )


def load_inputs(db: sqlite3.Connection, features: dict[str, dict[str, Any]]):
    context_rows = read_tsv(ROOT / CONTEXTS_REL)
    context_ids = [row["context_id"] for row in context_rows]
    complete: dict[str, list[str]] = defaultdict(list)
    for row in sorted(
        (row for row in read_tsv(ROOT / COMPARISON_REL) if row["in_v1"] == "true"),
        key=lambda row: (row["context_id"], int(row["v1_rank"])),
    ):
        complete[row["context_id"]].append(row["pair_id"])
    frozen: dict[str, list[str]] = defaultdict(list)
    for row in sorted(read_tsv(ROOT / VISIBLE_REL), key=lambda row: (row["context_id"], int(row["result_rank"]))):
        frozen[row["context_id"]].append(row["pair_id"])
    for context_id in context_ids:
        complete[context_id]
        frozen[context_id]

    revealed_sets = {key: english_candidates(db, query) for key, (query, _) in REVEALED.items()}
    wanted = {pair_id for ids in complete.values() for pair_id in ids}
    wanted.update(pair_id for ids in revealed_sets.values() for pair_id in ids)
    if wanted != set(features):
        raise RuntimeError(f"snapshot ID set mismatch: wanted={len(wanted)} snapshot={len(features)}")

    db.execute("CREATE TEMP TABLE wanted(pair_id BLOB PRIMARY KEY) WITHOUT ROWID")
    db.executemany("INSERT INTO wanted VALUES (?)", [(bytes.fromhex(pair_id[5:]),) for pair_id in wanted])
    provider_to_app = {}
    for row in db.execute(
        """
        SELECT 'esp1_' || lower(hex(p.pair_id)) pair_id,
               min(p.source_japanese_record_id) japanese_id,
               min(p.source_english_record_id) english_id
        FROM example_sentence_provenance p JOIN wanted w ON w.pair_id=p.pair_id
        WHERE p.source_identity='tatoeba.weekly-export' GROUP BY p.pair_id
        """
    ):
        key = f"{row['japanese_id']}:{row['english_id']}"
        if key in provider_to_app:
            raise RuntimeError(f"ambiguous retained provenance coordinate: {key}")
        provider_to_app[key] = row["pair_id"]

    observed_ranked: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for row in read_tsv(ROOT / OBSERVATIONS_REL):
        provider_key = f"{row['japanese_id']}:{row['english_id']}"
        if provider_key not in provider_to_app:
            raise RuntimeError(f"observation provenance missing from exact database: {provider_key}")
        observed_ranked[row["context_id"]].append((int(row["rank"]), provider_to_app[provider_key]))
    observed = {context_id: [pair_id for _, pair_id in sorted(rows)] for context_id, rows in observed_ranked.items()}
    return context_ids, complete, frozen, observed, revealed_sets


def context_metrics(
    ranked: list[str], baseline: list[str], reference: list[str], frozen: list[str]
) -> dict[str, Any]:
    return {
        "candidate_count": len(baseline),
        "result_count": len(ranked),
        "set_loss": len(baseline) - len(ranked),
        "reference_count": len(reference),
        "discovery_positions": sum(index < len(ranked) and ranked[index] == pair_id for index, pair_id in enumerate(reference)),
        "discovery_top1": bool(reference) and ranked[:1] == reference[:1],
        "exact_reference_prefix": ranked[: len(reference)] == reference,
        "reference_prefix_sha256": sequence_sha256(reference),
        "frozen_count": len(frozen),
        "frozen_positions": sum(index < len(ranked) and ranked[index] == pair_id for index, pair_id in enumerate(frozen)),
        "exact_frozen_prefix": ranked[: len(frozen)] == frozen,
        "frozen_prefix_sha256": sequence_sha256(ranked[: len(frozen)]),
        "complete_sequence_unchanged": ranked == baseline,
        "complete_sequence_sha256": sequence_sha256(ranked),
    }


def policy_metrics(
    policy: Policy,
    context_ids: list[str],
    complete: dict[str, list[str]],
    frozen: dict[str, list[str]],
    observed: dict[str, list[str]],
    revealed_sets: dict[str, list[str]],
    features: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    revealed = {}
    for key, (_, expected) in REVEALED.items():
        ranked = apply_policy(revealed_sets[key], policy, features)
        revealed[key] = {
            "candidate_count": len(revealed_sets[key]),
            "result_count": len(ranked),
            "reference_rank": ranked.index(expected) + 1 if expected in ranked else None,
            "reference_is_top1": ranked[:1] == [expected],
            "sequence_sha256": sequence_sha256(ranked),
        }
    contexts = {}
    for context_id in context_ids:
        ranked = apply_policy(complete[context_id], policy, features)
        contexts[context_id] = context_metrics(ranked, complete[context_id], observed.get(context_id, []), frozen[context_id])
    return {
        "policy": asdict(policy),
        "revealed": revealed,
        "aggregate": {
            "revealed_top1": sum(item["reference_is_top1"] for item in revealed.values()),
            "discovery_positions": sum(item["discovery_positions"] for item in contexts.values()),
            "discovery_rows": sum(item["reference_count"] for item in contexts.values()),
            "discovery_top1": sum(item["discovery_top1"] for item in contexts.values()),
            "discovery_nonempty_contexts": sum(item["reference_count"] > 0 for item in contexts.values()),
            "exact_reference_prefixes": sum(item["exact_reference_prefix"] for item in contexts.values()),
            "frozen_positions": sum(item["frozen_positions"] for item in contexts.values()),
            "frozen_rows": sum(item["frozen_count"] for item in contexts.values()),
            "exact_frozen_prefixes": sum(item["exact_frozen_prefix"] for item in contexts.values()),
            "complete_sequences_unchanged": sum(item["complete_sequence_unchanged"] for item in contexts.values()),
            "set_loss": sum(item["set_loss"] for item in contexts.values()),
            "candidate_occurrences": sum(item["candidate_count"] for item in contexts.values()),
        },
        "contexts": contexts,
    }


def covered(field: str, value: Any) -> bool:
    if field in ("pair_created_at", "pair_modified_at"):
        return value is not None
    if field == "owner_skill":
        return value >= 0
    if field == "ogte_level":
        return value < 100
    return bool(value)


def main() -> None:
    if len(sys.argv) > 1 and Path(sys.argv[1]).resolve() != ROOT:
        raise SystemExit(f"this pinned harness must run against {ROOT}")
    validate_inputs()
    features = validate_snapshot()
    db = sqlite3.connect(ROOT / DB_REL)
    db.row_factory = sqlite3.Row
    context_ids, complete, frozen, observed, revealed_sets = load_inputs(db, features)
    db.close()

    discovery_ids = [pair_id for context_id in context_ids for pair_id in complete[context_id]]
    distinct_discovery_ids = set(discovery_ids)
    coverage = {}
    for field in sorted(next(iter(features.values())).keys() - {"pair_id"}):
        coverage[field] = {
            "candidate_occurrences": sum(covered(field, features[pair_id][field]) for pair_id in discovery_ids),
            "candidate_occurrence_total": len(discovery_ids),
            "distinct_pairs": sum(covered(field, features[pair_id][field]) for pair_id in distinct_discovery_ids),
            "distinct_pair_total": len(distinct_discovery_ids),
        }

    output = {
        "schema_version": 1,
        "inputs": {relative: expected for relative, expected in sorted(EXPECTED_SHA256.items())},
        "snapshot_rows_sha256": EXPECTED_ROWS_SHA256,
        "denominators": {
            "candidate_restricted_pairs": len(features),
            "discovery_contexts": len(context_ids),
            "nonempty_discovery_contexts": sum(bool(observed.get(context_id)) for context_id in context_ids),
            "discovery_candidate_occurrences": len(discovery_ids),
            "distinct_discovery_pairs": len(distinct_discovery_ids),
            "discovery_rows": sum(len(observed.get(context_id, [])) for context_id in context_ids),
            "frozen_rows": sum(len(frozen[context_id]) for context_id in context_ids),
        },
        "coverage": coverage,
        "policies": [
            policy_metrics(policy, context_ids, complete, frozen, observed, revealed_sets, features) for policy in POLICIES
        ],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
