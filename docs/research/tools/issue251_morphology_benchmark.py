#!/usr/bin/env python3
"""Validate and score normalized Japanese Text Analysis evidence for issue #251."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import re
import sys
from pathlib import Path
from typing import Any, Iterable


SCHEMA = "zenbu.japanese-text-analysis-output.v1"
METADATA_KEYS = ("schema", "engine", "engineVersion", "dictionary", "dictionarySHA256")


def _canonical(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode()


def normalized_output_sha256(records: Iterable[dict[str, Any]]) -> str:
    ordered = sorted(records, key=lambda row: row["id"])
    return hashlib.sha256(b"".join(_canonical(row) for row in ordered)).hexdigest()


def validate_candidate(
    record: dict[str, Any], expected_metadata: dict[str, Any] | None = None
) -> None:
    if record.get("schema") != SCHEMA:
        raise ValueError(f"unsupported result schema for {record.get('id')}")
    if expected_metadata:
        for key in METADATA_KEYS:
            if record.get(key) != expected_metadata.get(key):
                raise ValueError(f"metadata drift for {record.get('id')}: {key}")
    digest = record.get("dictionarySHA256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError(f"invalid dictionary checksum for {record.get('id')}")
    text = record.get("text")
    if not isinstance(text, str):
        raise ValueError(f"missing transcript for {record.get('id')}")
    previous_end = 0
    for token in record.get("tokens", []):
        start, end = token.get("start"), token.get("end")
        if (
            not isinstance(start, int)
            or not isinstance(end, int)
            or not (0 <= start < end <= len(text))
        ):
            raise ValueError(f"invalid range for {record.get('id')}")
        if start < previous_end:
            raise ValueError(f"overlapping or unordered ranges for {record.get('id')}")
        if text[start:end] != token.get("surface"):
            raise ValueError(
                f"range does not round-trip for {record.get('id')}: {start}:{end}"
            )
        previous_end = end


def _ratio(correct: int, total: int) -> dict[str, Any]:
    return {
        "correct": correct,
        "total": total,
        "accuracy": (correct / total if total else None),
    }


def _prf(tp: int, predicted: int, expected: int) -> dict[str, Any]:
    precision = tp / predicted if predicted else (1.0 if expected == 0 else 0.0)
    recall = tp / expected if expected else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "truePositive": tp,
        "predicted": predicted,
        "expected": expected,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def _percentile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def bootstrap_paired_difference(
    samples_a: list[float], samples_b: list[float], *, seed: int, replicates: int
) -> dict[str, float | int]:
    if len(samples_a) != len(samples_b) or not samples_a:
        raise ValueError("paired bootstrap requires equal non-empty samples")
    randomizer = random.Random(seed)
    differences = []
    for _ in range(replicates):
        indexes = [randomizer.randrange(len(samples_a)) for _ in samples_a]
        differences.append(
            sum(samples_a[index] - samples_b[index] for index in indexes) / len(indexes)
        )
    observed = sum(a - b for a, b in zip(samples_a, samples_b)) / len(samples_a)
    return {
        "observed": observed,
        "low95": _percentile(differences, 0.025),
        "high95": _percentile(differences, 0.975),
        "replicates": replicates,
        "seed": seed,
    }


def _token_edges(tokens: list[dict[str, Any]], text_length: int) -> set[int]:
    return {token["end"] for token in tokens if token["end"] != text_length}


def provider_metadata(contract_path: Path, provider_key: str) -> dict[str, Any]:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    try:
        return contract["providers"][provider_key]
    except KeyError as error:
        raise ValueError(f"unknown provider contract: {provider_key}") from error


def apple_character_geometry_for_scalar_range(
    text: str, start: int, end: int, character_boxes: list[dict[str, float]]
) -> list[dict[str, float]]:
    """Map a validated analyzer scalar range to retained Vision character geometry."""
    if len(character_boxes) != len(text):
        raise ValueError(
            "Apple character geometry count does not match transcript scalars"
        )
    if not (0 <= start < end <= len(text)):
        raise ValueError("analyzer scalar range is outside Apple transcript")
    return character_boxes[start:end]


def score_records(
    truth_records: list[dict[str, Any]], candidate_records: list[dict[str, Any]]
) -> dict[str, Any]:
    candidate_by_id = {row["id"]: row for row in candidate_records}
    if len(candidate_by_id) != len(candidate_records):
        raise ValueError("duplicate candidate id")
    counters = {field: [0, 0] for field in ("lemma", "reading", "pos", "oov")}
    boundary_tp = boundary_predicted = boundary_expected = 0
    allowed_boundary_tp = allowed_boundary_predicted = allowed_boundary_expected = 0
    exact_span_tp = exact_span_predicted = exact_span_expected = 0
    severe_wrong = 0
    exact_link_correct = 0
    exact_link_total = 0
    abstention_correct = 0
    abstention_total = 0
    sentence_correct = 0
    missing: list[str] = []

    for truth in truth_records:
        candidate = candidate_by_id.get(truth["id"])
        if candidate is None:
            missing.append(truth["id"])
            continue
        validate_candidate(candidate)
        if candidate["text"] != truth["text"]:
            raise ValueError(f"transcript drift for {truth['id']}")
        gold_tokens = truth["tokens"]
        candidate_tokens = candidate["tokens"]
        gold_edges = _token_edges(gold_tokens, len(truth["text"]))
        candidate_edges = _token_edges(candidate_tokens, len(truth["text"]))
        boundary_tp += len(gold_edges & candidate_edges)
        boundary_predicted += len(candidate_edges)
        boundary_expected += len(gold_edges)
        allowed_sets = [
            set(edges) for edges in truth.get("allowedBoundaryEdgeSets", [])
        ]
        if not allowed_sets:
            allowed_sets = [gold_edges]
        allowed_gold = max(
            allowed_sets,
            key=lambda edges: _prf(
                len(edges & candidate_edges), len(candidate_edges), len(edges)
            )["f1"],
        )
        allowed_boundary_tp += len(allowed_gold & candidate_edges)
        allowed_boundary_predicted += len(candidate_edges)
        allowed_boundary_expected += len(allowed_gold)
        gold_spans = {(token["start"], token["end"]): token for token in gold_tokens}
        candidate_spans = {
            (token["start"], token["end"]): token for token in candidate_tokens
        }
        exact_span_tp += len(gold_spans.keys() & candidate_spans.keys())
        exact_span_predicted += len(candidate_spans)
        exact_span_expected += len(gold_spans)
        row_correct = (
            gold_edges == candidate_edges
            and gold_spans.keys() == candidate_spans.keys()
        )

        for span, gold in gold_spans.items():
            observed = candidate_spans.get(span)
            for field in counters:
                if field not in gold or gold[field] is None:
                    continue
                counters[field][1] += 1
                if field == "reading" and gold.get("readingAlternatives"):
                    matched = (
                        observed is not None
                        and observed.get(field) in gold["readingAlternatives"]
                    )
                else:
                    matched = observed is not None and gold[field] == observed.get(
                        field
                    )
                counters[field][0] += int(matched)
                row_correct = row_correct and matched

            link = gold.get("link")
            if not link:
                continue
            observed_links = set((observed or {}).get("linkIds", []))
            candidate_ids = (
                set((observed or {}).get("candidateIds", [])) | observed_links
            )
            if link["kind"] == "exact":
                expected = set(link["ids"])
                exact_link_total += 1
                matched = bool(expected & candidate_ids) and observed_links <= expected
                exact_link_correct += int(matched)
                severe_wrong += len(observed_links - expected)
                row_correct = row_correct and matched
            elif link["kind"] == "abstain":
                abstention_total += 1
                matched = not observed_links
                abstention_correct += int(matched)
                severe_wrong += len(observed_links)
                row_correct = row_correct and matched
            else:
                raise ValueError(f"unsupported link truth for {truth['id']}")
        sentence_correct += int(row_correct)

    evaluated = len(truth_records) - len(missing)
    result = {
        "schema": "zenbu.japanese-morphology-benchmark-result.v1",
        "records": {
            "evaluated": evaluated,
            "expected": len(truth_records),
            "missing": missing,
        },
        "boundary": _prf(boundary_tp, boundary_predicted, boundary_expected),
        "allowedBoundary": _prf(
            allowed_boundary_tp,
            allowed_boundary_predicted,
            allowed_boundary_expected,
        ),
        "exactTokenSpan": _prf(
            exact_span_tp, exact_span_predicted, exact_span_expected
        ),
        "sentenceAllCorrect": {
            "correct": sentence_correct,
            "total": len(truth_records),
        },
        "links": {
            "exactCandidateRecall": _ratio(exact_link_correct, exact_link_total),
            "abstention": _ratio(abstention_correct, abstention_total),
            "severeWrong": severe_wrong,
            "severeWrongRate": (
                severe_wrong / (exact_link_total + abstention_total)
                if exact_link_total + abstention_total
                else None
            ),
        },
        "hardGates": {
            "zeroSevereWrongLinks": severe_wrong == 0,
            "completeCorpus": not missing,
        },
    }
    for field, (correct, total) in counters.items():
        result[field] = _ratio(correct, total)
    oov_true_positive = oov_predicted = oov_expected = 0
    for truth in truth_records:
        candidate = candidate_by_id.get(truth["id"])
        if candidate is None:
            continue
        observed = {
            (token["start"], token["end"]): token for token in candidate["tokens"]
        }
        for gold in truth["tokens"]:
            if "oov" not in gold:
                continue
            predicted = bool(observed.get((gold["start"], gold["end"]), {}).get("oov"))
            expected = bool(gold["oov"])
            oov_true_positive += int(predicted and expected)
            oov_predicted += int(predicted)
            oov_expected += int(expected)
    result["oovDetection"] = _prf(oov_true_positive, oov_predicted, oov_expected)
    link_true_positive = link_predicted = link_expected = 0
    for truth in truth_records:
        candidate = candidate_by_id.get(truth["id"])
        if candidate is None:
            continue
        observed = {
            (token["start"], token["end"]): token for token in candidate["tokens"]
        }
        for gold in truth["tokens"]:
            link = gold.get("link")
            if not link:
                continue
            links = set(
                observed.get((gold["start"], gold["end"]), {}).get("linkIds", [])
            )
            expected = set(link.get("ids", [])) if link["kind"] == "exact" else set()
            link_true_positive += len(links & expected)
            link_predicted += len(links)
            link_expected += len(expected)
    result["links"]["exactLink"] = _prf(
        link_true_positive, link_predicted, link_expected
    )
    return result


def score_with_categories(
    truth_records: list[dict[str, Any]], candidate_records: list[dict[str, Any]]
) -> dict[str, Any]:
    result = score_records(truth_records, candidate_records)
    categories = sorted(
        {
            category
            for record in truth_records
            for category in record.get("category", [])
        }
    )
    result["byCategory"] = {
        category: score_records(
            [
                record
                for record in truth_records
                if category in record.get("category", [])
            ],
            candidate_records,
        )
        for category in categories
    }
    return result


def _unidic_readings(misc: str) -> list[str]:
    marker = "UnidicInfo="
    if marker not in misc:
        return []
    raw = misc.split(marker, 1)[1].split("|", 1)[0]
    try:
        values = next(csv.reader([raw]))
    except (csv.Error, StopIteration):
        return []
    candidates = [
        values[index] for index in (0, 4) if len(values) > index and values[index]
    ]
    return list(dict.fromkeys(candidates))


def load_conllu(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    metadata: dict[str, str] = {}
    token_rows: list[list[str]] = []

    def finish() -> None:
        nonlocal metadata, token_rows
        if not token_rows:
            metadata = {}
            return
        text = metadata.get("text")
        sent_id = metadata.get("sent_id")
        if text is None or sent_id is None:
            raise ValueError("CoNLL-U sentence missing text or sent_id")
        cursor = 0
        tokens = []
        for columns in token_rows:
            if "-" in columns[0] or "." in columns[0]:
                continue
            surface = columns[1]
            start = text.find(surface, cursor)
            if start < 0:
                raise ValueError(
                    f"cannot align {sent_id} token {surface!r} after {cursor}"
                )
            end = start + len(surface)
            readings = _unidic_readings(columns[9])
            tokens.append(
                {
                    "surface": surface,
                    "start": start,
                    "end": end,
                    "lemma": None if columns[2] == "_" else columns[2],
                    "reading": readings[0] if readings else None,
                    "readingAlternatives": readings,
                    "pos": None if columns[3] == "_" else columns[3],
                }
            )
            cursor = end
        records.append({"id": sent_id, "text": text, "tokens": tokens})
        metadata = {}
        token_rows = []

    with path.open(encoding="utf-8") as source:
        for raw_line in source:
            line = raw_line.rstrip("\n")
            if not line:
                finish()
            elif line.startswith("# ") and " = " in line:
                key, value = line[2:].split(" = ", 1)
                metadata[key] = value
            elif not line.startswith("#"):
                columns = line.split("\t")
                if len(columns) != 10:
                    raise ValueError("invalid CoNLL-U row")
                token_rows.append(columns)
    finish()
    return records


def load_truth(path: Path) -> list[dict[str, Any]]:
    if path.suffix == ".conllu":
        return load_conllu(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("cases", payload)
    if isinstance(payload, dict) and "cases" in payload:
        for record in records:
            if "adjudication" not in record or "allowedBoundaryEdgeSets" not in record:
                raise ValueError(f"incomplete adjudication for {record.get('id')}")
    return records


def load_jsonl(path: Path, expected_metadata: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    for row in rows:
        validate_candidate(row, expected_metadata)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("results", type=Path)
    validate_parser.add_argument("--provider-contract", type=Path, required=True)
    validate_parser.add_argument("--provider", required=True)
    validate_parser.add_argument("--expected-output-sha256")
    score_parser = subparsers.add_parser("score")
    score_parser.add_argument("truth", type=Path)
    score_parser.add_argument("results", type=Path)
    score_parser.add_argument("--provider-contract", type=Path, required=True)
    score_parser.add_argument("--provider", required=True)
    score_parser.add_argument("--expected-output-sha256")
    args = parser.parse_args()
    expected_metadata = provider_metadata(args.provider_contract, args.provider)
    rows = load_jsonl(args.results, expected_metadata)
    output_sha256 = normalized_output_sha256(rows)
    if args.expected_output_sha256 and output_sha256 != args.expected_output_sha256:
        raise ValueError("normalized output checksum drift")
    if args.command == "validate":
        print(
            json.dumps(
                {"records": len(rows), "sha256": output_sha256},
                sort_keys=True,
            )
        )
    else:
        print(
            json.dumps(
                score_with_categories(load_truth(args.truth), rows),
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
