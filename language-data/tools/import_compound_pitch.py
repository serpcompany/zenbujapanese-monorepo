#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from compound_accent import (
    CompoundGroup,
    CompoundSplitter,
    Lexeme,
    lexicon_parts,
    two_part_c2_downstep,
    two_part_lexemes,
)
from language_data_tools import built_artifact, file_sha256, run_import
from unidic_adapter import hiragana, lexicon_rows, mora_count

ARTIFACT_SCHEMA = "zenbu.compound-pitch.v1"
SOURCE_IDENTITY = "UniDic 3.1.0 compound accent rules"
COMPOUND_ACCENT = Path(__file__).with_name("compound_accent.py")
UNIDIC_ADAPTER = Path(__file__).with_name("unidic_adapter.py")
FOUR_CHARACTER_IDIOM = "yojijukugo"
ADJECTIVAL_SUFFIX = ("的", "てき")
PURPOSE = ("目的", "もくてき")
C2_FALLBACK = "C2 where the rule gives none, 2 parts"
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


@dataclass(frozen=True)
class Estimators:
    splitter: CompoundSplitter
    lexemes: dict[str, frozenset[Lexeme]]
    words: frozenset[tuple[str, str]]


def ends_in_adjectival_suffix(headword: str, reading: str, words: frozenset[tuple[str, str]]) -> bool:
    (suffix, suffix_reading), (noun, noun_reading) = ADJECTIVAL_SUFFIX, PURPOSE
    reading = hiragana(reading)
    if not headword.endswith(suffix) or not reading.endswith(suffix_reading):
        return False
    stem = (headword[: -len(suffix)], reading[: -len(suffix_reading)])
    return not (headword.endswith(noun) and reading.endswith(noun_reading) and stem not in words)


def left_out_kind(headword: str, reading: str, entry: tuple[str, str], words: frozenset[tuple[str, str]]) -> str | None:
    parts_of_speech, senses = (json.loads(column) for column in entry)
    if any(FOUR_CHARACTER_IDIOM in sense.get("usage", ()) for sense in senses):
        return "left_out_as_a_four_character_idiom"
    if ends_in_adjectival_suffix(headword, reading, words):
        return "left_out_as_ending_in_the_suffix_teki"
    if parts_of_speech and parts_of_speech[0] in FUNCTION_WORD_CLASSES:
        return "left_out_as_listed_first_as_a_function_word_or_affix"
    return None


def estimated_pitch(estimators: Estimators, candidates: list[tuple]) -> tuple[list[tuple], Counter, Counter]:
    rows, common, outcomes = [], Counter(), Counter()
    for entry_id, headword, reading, is_common, *entry in candidates:
        estimate = estimators.splitter.estimate(headword, reading)
        shipped = estimate if estimate is not None and estimate.group in SHIPPED_GROUPS else None
        fallback = None if shipped else two_part_c2_downstep(headword, reading, estimators.lexemes)
        left_out = left_out_kind(headword, reading, tuple(entry), estimators.words)
        if shipped is None and fallback is None:
            outcome = "no_estimate" if estimate is None else "estimated_in_a_group_below_the_gate"
        elif left_out:
            outcome = left_out
        else:
            outcome = "estimated" if shipped else "estimated_by_the_c2_fallback"
            downstep, group = (shipped.downstep, shipped.group.label()) if shipped else (fallback, C2_FALLBACK)
            pitch = {"downstep": downstep, "moraCount": mora_count(reading), "sourceIdentity": SOURCE_IDENTITY}
            rows.append((entry_id, json.dumps(pitch, ensure_ascii=False, separators=(",", ":"))))
            common[group] += is_common
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
    database = sqlite3.connect(f"file:{language_data}?mode=ro", uri=True)
    try:
        candidates = database.execute(
            "SELECT id, headword, reading, is_common, parts_of_speech_json, senses_json FROM entries "
            "WHERE pitch_accent_json IS NULL"
        ).fetchall()
        words = frozenset(
            (form, hiragana(reading))
            for headword, reading, written in database.execute(
                "SELECT headword, reading, written_forms_json FROM entries"
            )
            for form in (headword, *(written_form["value"] for written_form in json.loads(written)))
        )
    finally:
        database.close()
    estimators = Estimators(
        CompoundSplitter(lexicon_parts(lexicon_rows(source))), two_part_lexemes(lexicon_rows(source)), words
    )
    rows, common_by_group, outcomes = estimated_pitch(estimators, candidates)
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
        "combination types, moving a downstep off a special mora within a part. The splits with the "
        "fewest parts that give a value must all agree; a split that gives no value is left out. Ship "
        "the value only in a shipped group. Where the rule gives none, a two-part kanji "
        "compound whose second part is C2 keeps that rule's downstep, on the second part's first mora.",
        "left_out": "Four-character idioms, words ending in the suffix 的 (not the noun 目的), and words "
        "listed first as an expression, particle, conjunction, interjection, auxiliary, or affix.",
        "shipped_groups": sorted(group.label() for group in SHIPPED_GROUPS),
        "entries_without_pitch_considered": len(candidates),
        "entries_estimated": len(rows),
        "common_entries_estimated": sum(common_by_group.values()),
        "common_entries_estimated_by_group": dict(sorted(common_by_group.items())),
        "outcomes": dict(sorted(outcomes.items())),
        "source_sha256": source_manifest["sha256"],
        "language_data_sha256": language_data_sha256,
        "compound_accent_sha256": file_sha256(COMPOUND_ACCENT),
        "unidic_adapter_sha256": file_sha256(UNIDIC_ADAPTER),
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
