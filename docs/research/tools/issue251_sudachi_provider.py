#!/usr/bin/env python3
"""Disposable Sudachi provider for the issue #251 benchmark schema."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path

from sudachipy import dictionary, tokenizer


BENCHMARK_PATH = Path(__file__).with_name("issue251_morphology_benchmark.py")
SPEC = importlib.util.spec_from_file_location("issue251_benchmark", BENCHMARK_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(benchmark)


def coarse_pos(parts: tuple[str, ...]) -> str | None:
    primary = parts[0]
    if primary == "名詞":
        if len(parts) > 1 and parts[1] == "固有名詞":
            return "PROPN"
        if len(parts) > 1 and parts[1] == "数詞":
            return "NUM"
        if len(parts) > 1 and parts[1] == "助動詞語幹":
            return "AUX"
        return "NOUN"
    return {
        "代名詞": "PRON",
        "動詞": "VERB",
        "形容詞": "ADJ",
        "形状詞": "ADJ",
        "連体詞": "DET",
        "副詞": "ADV",
        "助動詞": "AUX",
        "接続詞": "CCONJ",
        "感動詞": "INTJ",
        "補助記号": "SYM" if len(parts) > 1 and parts[1] == "一般" else "PUNCT",
        "記号": "NOUN",
        "接頭辞": "NOUN",
        "接尾辞": "NOUN",
        "空白": "SPACE",
        "助詞": (
            "SCONJ"
            if len(parts) > 1 and parts[1] in ("接続助詞", "準体助詞")
            else "PART"
            if len(parts) > 1 and parts[1] == "終助詞"
            else "ADP"
        ),
    }.get(primary)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("truth", type=Path)
    parser.add_argument("--mode", choices=("A", "B", "C"), required=True)
    parser.add_argument("--provider-contract", type=Path, required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = benchmark.load_truth(args.truth)
    dictionary_path = (
        Path(importlib.util.find_spec("sudachidict_core").submodule_search_locations[0])
        / "resources"
        / "system.dic"
    )
    dictionary_sha = sha256(dictionary_path)
    analyzer = dictionary.Dictionary(dict=str(dictionary_path)).create()
    split_mode = getattr(tokenizer.Tokenizer.SplitMode, args.mode)
    observed_metadata = {
        "schema": benchmark.SCHEMA,
        "engine": "sudachi.rs",
        "engineVersion": importlib.metadata.version("SudachiPy"),
        "dictionary": f"SudachiDict Core {importlib.metadata.version('SudachiDict-core')} mode {args.mode}",
        "dictionarySHA256": dictionary_sha,
    }
    metadata = benchmark.provider_metadata(args.provider_contract, args.provider)
    if observed_metadata != metadata:
        raise ValueError(
            f"installed Sudachi provider drift: expected {metadata}, observed {observed_metadata}"
        )
    with args.output.open("w", encoding="utf-8") as destination:
        for record in records:
            tokens = []
            for morpheme in analyzer.tokenize(record["text"], split_mode):
                tokens.append(
                    {
                        "surface": morpheme.surface(),
                        "start": morpheme.begin(),
                        "end": morpheme.end(),
                        "lemma": morpheme.dictionary_form(),
                        "reading": morpheme.reading_form() or None,
                        "pos": coarse_pos(morpheme.part_of_speech()),
                        "oov": morpheme.is_oov(),
                    }
                )
            row = {
                **metadata,
                "id": record["id"],
                "text": record["text"],
                "tokens": tokens,
            }
            benchmark.validate_candidate(row, metadata)
            destination.write(
                json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            )


if __name__ == "__main__":
    main()
