#!/usr/bin/env python3
"""Produce paired sentence-bootstrap comparisons for two #251 result files."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


BENCHMARK_PATH = Path(__file__).with_name("issue251_morphology_benchmark.py")
SPEC = importlib.util.spec_from_file_location("issue251_benchmark", BENCHMARK_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(benchmark)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("truth", type=Path)
    parser.add_argument("candidate_a", type=Path)
    parser.add_argument("candidate_b", type=Path)
    parser.add_argument("--provider-contract", type=Path, required=True)
    parser.add_argument("--provider-a", required=True)
    parser.add_argument("--provider-b", required=True)
    args = parser.parse_args()
    truth = benchmark.load_truth(args.truth)
    candidate_a = {
        row["id"]: row
        for row in benchmark.load_jsonl(
            args.candidate_a,
            benchmark.provider_metadata(args.provider_contract, args.provider_a),
        )
    }
    candidate_b = {
        row["id"]: row
        for row in benchmark.load_jsonl(
            args.candidate_b,
            benchmark.provider_metadata(args.provider_contract, args.provider_b),
        )
    }
    fields = ("boundary", "exactTokenSpan", "lemma", "reading", "pos")
    samples = {field: ([], []) for field in fields}
    for record in truth:
        score_a = benchmark.score_records([record], [candidate_a[record["id"]]])
        score_b = benchmark.score_records([record], [candidate_b[record["id"]]])
        for field in fields:
            key = "f1" if field in ("boundary", "exactTokenSpan") else "accuracy"
            value_a = score_a[field][key]
            value_b = score_b[field][key]
            if value_a is not None and value_b is not None:
                samples[field][0].append(value_a)
                samples[field][1].append(value_b)
    comparison = {
        "schema": "zenbu.japanese-morphology-paired-bootstrap.v1",
        "candidateA": next(iter(candidate_a.values()))["dictionary"],
        "candidateB": next(iter(candidate_b.values()))["dictionary"],
        "unit": "sentence",
        "metrics": {
            field: benchmark.bootstrap_paired_difference(
                values_a,
                values_b,
                seed=25120260903,
                replicates=10000,
            )
            for field, (values_a, values_b) in samples.items()
        },
    }
    print(json.dumps(comparison, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
