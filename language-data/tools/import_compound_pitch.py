#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
from collections import Counter
from pathlib import Path

from compound_accent import CompoundGroup, CompoundSplitter, lexicon_parts
from language_data_tools import built_artifact, file_sha256, run_import
from unidic_adapter import lexicon_rows, mora_count

ARTIFACT_SCHEMA = "zenbu.compound-pitch.v1"
SOURCE_IDENTITY = "UniDic 3.1.0 compound accent rules"
COMPOUND_ACCENT = Path(__file__).with_name("compound_accent.py")
FOUR_CHARACTER_IDIOM = "yojijukugo"
ADJECTIVAL_SUFFIX = "的"
FUNCTION_WORD_CLASSES = {
    "expression", "particle", "conjunction", "interjection",
    "auxiliary", "auxiliaryVerb", "auxiliaryAdjective", "copula",
    "prefix", "nounPrefix", "suffix", "nounSuffix",
}
SHIPPED_GROUPS = frozenset(
    CompoundGroup(script, prefixed, tuple(types.split("/")), parts)
    for script, prefixed, types, parts in (
        ("kanji", False, "C1", 2),
        ("kanji", False, "C1", 3),
        ("kanji", False, "C2", 2),
        ("kanji", False, "*/C1", 2),
        ("kanji", False, "*/C2", 2),
        ("kanji", False, "C1/C3", 2),
        ("kanji", False, "C1/C3", 3),
        ("kanji", False, "C2/C3", 3),
        ("kanji", False, "*/C2/C3", 2),
        ("kanji", False, "*/C3/P", 2),
        ("kanji", False, "C4/P", 2),
        ("kanji", True, "C1", 2),
        ("kanji", True, "C1", 3),
        ("kanji", True, "C1/C3", 2),
        ("kanji", True, "C2", 2),
        ("kanji", True, "C2", 3),
        ("kanji", True, "C2/C3", 2),
        ("kanji+kana", False, "C2", 2),
        ("kanji+kana", False, "*/C1", 2),
        ("kanji+kana", False, "C1/C2", 2),
        ("katakana", False, "C1", 2),
        ("katakana", False, "C1", 3),
        ("katakana", False, "*/C1", 2),
        ("katakana", False, "C1/C2", 2),
    )
)


def left_out_kind(headword: str, parts_of_speech: list[str], senses: list[dict]) -> str | None:
    if any(FOUR_CHARACTER_IDIOM in sense.get("usage", ()) for sense in senses):
        return "left_out_as_a_four_character_idiom"
    if headword.endswith(ADJECTIVAL_SUFFIX):
        return "left_out_as_ending_in_teki"
    if parts_of_speech and parts_of_speech[0] in FUNCTION_WORD_CLASSES:
        return "left_out_as_listed_first_as_a_function_word_or_affix"
    return None


def estimated_pitch(splitter: CompoundSplitter, candidates: list[tuple]) -> tuple[list[tuple], Counter, Counter]:
    rows, common, outcomes = [], Counter(), Counter()
    for entry_id, headword, reading, is_common, parts_of_speech_json, senses_json in candidates:
        estimate = splitter.estimate(headword, reading)
        left_out = left_out_kind(headword, json.loads(parts_of_speech_json), json.loads(senses_json))
        if estimate is None:
            outcome = "no_estimate"
        elif estimate.group not in SHIPPED_GROUPS:
            outcome = "estimated_in_a_group_below_the_gate"
        elif left_out:
            outcome = left_out
        else:
            outcome = "estimated"
            pitch = {"downstep": estimate.downstep, "moraCount": mora_count(reading), "sourceIdentity": SOURCE_IDENTITY}
            rows.append((entry_id, json.dumps(pitch, ensure_ascii=False, separators=(",", ":"))))
            common[estimate.group.label()] += is_common
        outcomes[outcome] += 1
        if is_common:
            outcomes[f"common_{outcome}"] += 1
    rows.sort()
    return rows, common, outcomes


def write_artifact(output: Path, rows: list[tuple], metadata: tuple[tuple[str, str], ...]) -> None:
    temporary = output.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    artifact = sqlite3.connect(temporary)
    try:
        artifact.executescript(
            """
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE entry_pitch (
              entry_id BLOB PRIMARY KEY,
              pitch_accent_json TEXT NOT NULL
            ) WITHOUT ROWID;
            """
        )
        artifact.executemany("INSERT INTO metadata(key, value) VALUES (?, ?)", metadata)
        artifact.executemany("INSERT INTO entry_pitch(entry_id, pitch_accent_json) VALUES (?, ?)", rows)
        artifact.commit()
        artifact.execute("VACUUM")
    finally:
        artifact.close()
    temporary.replace(output)


def import_pitch(source: Path, source_manifest: dict, language_data: Path, output: Path) -> dict:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("UniDic archive does not match its pinned SHA-256")
    splitter = CompoundSplitter(lexicon_parts(lexicon_rows(source)))
    database = sqlite3.connect(f"file:{language_data}?mode=ro", uri=True)
    try:
        candidates = database.execute(
            "SELECT id, headword, reading, is_common, parts_of_speech_json, senses_json FROM entries "
            "WHERE pitch_accent_json IS NULL"
        ).fetchall()
    finally:
        database.close()
    rows, common_by_group, outcomes = estimated_pitch(splitter, candidates)
    language_data_sha256 = file_sha256(language_data)
    write_artifact(
        output,
        rows,
        (
            ("artifact_schema", ARTIFACT_SCHEMA),
            ("source_identity", SOURCE_IDENTITY),
            ("source_sha256", source_manifest["sha256"]),
            ("language_data_sha256", language_data_sha256),
        ),
    )
    return {
        "identity": "unidic-compound-accent-rules-v2",
        "artifact_schema": ARTIFACT_SCHEMA,
        "rule": "Split the word into two to four UniDic noun, na-adjective, prefix, or suffix rows by spelling "
        "and kana form, keeping the splits with the fewest parts; combine the parts by UniDic's accent "
        "combination types, moving a downstep off a special mora within a part; give a value only when "
        "every such split agrees, and only in a shipped group.",
        "left_out": "Four-character idioms, words ending in 的, and words listed first as an expression, "
        "particle, conjunction, interjection, auxiliary, or affix.",
        "shipped_groups": sorted(group.label() for group in SHIPPED_GROUPS),
        "entries_without_pitch_considered": len(candidates),
        "entries_estimated": len(rows),
        "common_entries_estimated": sum(common_by_group.values()),
        "common_entries_estimated_by_group": dict(sorted(common_by_group.items())),
        "outcomes": dict(sorted(outcomes.items())),
        "source_sha256": source_manifest["sha256"],
        "language_data_sha256": language_data_sha256,
        "compound_accent_sha256": file_sha256(COMPOUND_ACCENT),
        **built_artifact(Path(__file__), output),
    }


def main() -> None:
    run_import(
        lambda arguments, source_manifest: import_pitch(
            arguments.source, source_manifest, arguments.language_data, arguments.output
        ),
        "--language-data",
    )


if __name__ == "__main__":
    main()
