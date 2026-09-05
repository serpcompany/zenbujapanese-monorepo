#!/usr/bin/env python3
"""Build the frozen never-scored #251 confirmation set from UD GSD train."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


EXPECTED_SOURCE_SHA256 = (
    "99f67fd88257e7cfe81d81c4b8ee98aff85fc22bb525d907475a2856c8cfa9f3"
)
SELECTION_DOMAIN = b"zenbu.issue251.confirmation.v1\0"
COUNT = 512

BENCHMARK_PATH = Path(__file__).with_name("issue251_morphology_benchmark.py")
SPEC = importlib.util.spec_from_file_location("issue251_benchmark", BENCHMARK_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(benchmark)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def selection_key(record: dict) -> bytes:
    return hashlib.sha256(SELECTION_DOMAIN + record["id"].encode()).digest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if sha256(args.source) != EXPECTED_SOURCE_SHA256:
        raise ValueError("UD GSD train checksum drift")
    records = sorted(benchmark.load_conllu(args.source), key=selection_key)[:COUNT]
    for record in records:
        record["adjudication"] = {
            "status": "upstream-human-annotation-and-conversion",
            "uncertainty": "See the pinned UD Japanese GSD 2.18 annotation caveat in the source manifest.",
        }
        record["allowedBoundaryEdgeSets"] = [
            sorted(benchmark._token_edges(record["tokens"], len(record["text"])))
        ]
    selected_ids = sorted(record["id"] for record in records)
    payload = {
        "schema": "zenbu.japanese-morphology-confirmation-holdout.v1",
        "sourceSHA256": EXPECTED_SOURCE_SHA256,
        "selection": {
            "domain": "zenbu.issue251.confirmation.v1\\0",
            "rule": "512 records with lexicographically lowest SHA-256(domain || UTF-8 sent_id)",
            "count": COUNT,
            "selectedIDsSHA256": hashlib.sha256(
                ("\n".join(selected_ids) + "\n").encode()
            ).hexdigest(),
        },
        "cases": records,
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
