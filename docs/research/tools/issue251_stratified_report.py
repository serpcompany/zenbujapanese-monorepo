#!/usr/bin/env python3
"""Regenerate deterministic #251 script/domain strata from committed evidence."""

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


def metrics(result: dict) -> dict:
    return {
        "boundaryF1": result["boundary"]["f1"],
        "tokenSpanF1": result["exactTokenSpan"]["f1"],
        "lemmaAccuracy": result["lemma"]["accuracy"],
        "readingAccuracy": result["reading"]["accuracy"],
        "posAccuracy": result["pos"]["accuracy"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("truth", type=Path)
    parser.add_argument("--provider-contract", type=Path, required=True)
    parser.add_argument(
        "--candidate",
        action="append",
        nargs=3,
        metavar=("NAME", "PROVIDER", "JSONL"),
        required=True,
    )
    args = parser.parse_args()
    truth = benchmark.load_truth(args.truth)
    output = {
        "schema": "zenbu.issue251.stratified-result.v1",
        "domain": "UD GSD news/blog",
        "strata": {},
    }
    for name, provider, result_path in args.candidate:
        rows = benchmark.load_jsonl(
            Path(result_path),
            benchmark.provider_metadata(args.provider_contract, provider),
        )
        for stratum in ("mixedLatinOrNumber", "kanjiKana", "kanaOrSymbolOnly"):
            selected = [
                record
                for record in truth
                if benchmark.script_stratum(record["text"]) == stratum
            ]
            entry = output["strata"].setdefault(stratum, {"records": len(selected)})
            entry[name] = metrics(benchmark.score_records(selected, rows))
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
