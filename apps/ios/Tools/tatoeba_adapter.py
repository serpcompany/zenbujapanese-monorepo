"""Tatoeba source adapter for app-owned offline example pairs."""

from __future__ import annotations

import bz2
import sqlite3
from collections import Counter
from pathlib import Path


CC0_LICENSE = "CC0 1.0"
CC_BY_LICENSE = "CC BY 2.0 FR"
NAMED_CONTRIBUTOR = "named"
UNASSIGNED_CONTRIBUTOR = "not-supplied"


def _read_cc0_ids(source: Path, language: str) -> set[int]:
    sentence_ids: set[int] = set()
    with bz2.open(source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, row_language, _sentence, _modified_at = line.rstrip("\n").split("\t", maxsplit=3)
            if row_language != language:
                raise ValueError(f"CC0 export language mismatch: expected {language}, got {row_language}")
            sentence_ids.add(int(sentence_id_text))
    return sentence_ids


def _read_detailed_records(
    source: Path,
    language: str,
    retained_ids: set[int],
) -> dict[int, tuple[str, str | None]]:
    records: dict[int, tuple[str, str | None]] = {}
    with bz2.open(source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, row_language, sentence, username, _created_at, _modified_at = line.rstrip("\n").split(
                "\t", maxsplit=5
            )
            sentence_id = int(sentence_id_text)
            if sentence_id not in retained_ids:
                continue
            if row_language != language:
                raise ValueError(f"detailed export language mismatch: expected {language}, got {row_language}")
            records[sentence_id] = (sentence, None if username == r"\N" else username)
    missing = retained_ids.difference(records)
    if missing:
        first = min(missing)
        raise ValueError(f"detailed export is missing retained {language} sentence {first}")
    return records


def import_tatoeba_examples(
    database: sqlite3.Connection,
    japanese_source: Path,
    english_source: Path,
    links_source: Path,
    japanese_detailed_source: Path,
    english_detailed_source: Path,
    japanese_cc0_source: Path,
    english_cc0_source: Path,
    snapshot_date: str,
    snapshot_sha256: str,
) -> dict[str, int]:
    """Import one deterministic, fully attributed English translation per Japanese sentence."""

    english_id_by_japanese_id: dict[int, int] = {}
    with bz2.open(links_source, mode="rt", encoding="utf-8") as links:
        for line in links:
            japanese_id_text, english_id_text = line.rstrip("\n").split("\t", maxsplit=1)
            japanese_id, english_id = int(japanese_id_text), int(english_id_text)
            current = english_id_by_japanese_id.get(japanese_id)
            if current is None or english_id < current:
                english_id_by_japanese_id[japanese_id] = english_id

    japanese_by_id: dict[int, str] = {}
    with bz2.open(japanese_source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, language, sentence = line.rstrip("\n").split("\t", maxsplit=2)
            sentence_id = int(sentence_id_text)
            if language == "jpn" and sentence_id in english_id_by_japanese_id:
                japanese_by_id[sentence_id] = sentence

    japanese_ids_by_english_id: dict[int, list[int]] = {}
    for japanese_id, english_id in english_id_by_japanese_id.items():
        if japanese_id in japanese_by_id:
            japanese_ids_by_english_id.setdefault(english_id, []).append(japanese_id)
    for japanese_ids in japanese_ids_by_english_id.values():
        japanese_ids.sort()

    english_by_id: dict[int, str] = {}
    with bz2.open(english_source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, language, english = line.rstrip("\n").split("\t", maxsplit=2)
            english_id = int(sentence_id_text)
            if language == "eng" and english_id in japanese_ids_by_english_id:
                english_by_id[english_id] = english

    retained_english_ids = set(english_by_id)
    retained_japanese_ids = {
        japanese_id
        for english_id, japanese_ids in japanese_ids_by_english_id.items()
        if english_id in retained_english_ids
        for japanese_id in japanese_ids
    }
    japanese_details = _read_detailed_records(japanese_detailed_source, "jpn", retained_japanese_ids)
    english_details = _read_detailed_records(english_detailed_source, "eng", retained_english_ids)
    japanese_cc0_ids = _read_cc0_ids(japanese_cc0_source, "jpn")
    english_cc0_ids = _read_cc0_ids(english_cc0_source, "eng")

    contributor_counts: Counter[str] = Counter()
    retained = 0
    cc0_pairs = 0
    attributed_pairs = 0
    unassigned_sides = 0
    pending: list[tuple[object, ...]] = []
    for english_id in sorted(english_by_id):
        english = english_by_id[english_id]
        detailed_english, english_contributor = english_details[english_id]
        if detailed_english != english:
            raise ValueError(f"English detailed/general text mismatch for sentence {english_id}")

        english_license = CC0_LICENSE if english_id in english_cc0_ids else CC_BY_LICENSE
        english_status = NAMED_CONTRIBUTOR if english_contributor else UNASSIGNED_CONTRIBUTOR
        for japanese_id in japanese_ids_by_english_id[english_id]:
            japanese = japanese_by_id[japanese_id]
            detailed_japanese, japanese_contributor = japanese_details[japanese_id]
            if detailed_japanese != japanese:
                raise ValueError(f"Japanese detailed/general text mismatch for sentence {japanese_id}")

            japanese_license = CC0_LICENSE if japanese_id in japanese_cc0_ids else CC_BY_LICENSE
            japanese_status = NAMED_CONTRIBUTOR if japanese_contributor else UNASSIGNED_CONTRIBUTOR
            pair_license = (
                CC0_LICENSE
                if japanese_license == CC0_LICENSE and english_license == CC0_LICENSE
                else CC_BY_LICENSE
            )
            pair_id = f"tatoeba:{japanese_id}:{english_id}"
            pending.append(
                (
                    pair_id,
                    "tatoeba.weekly-export",
                    str(japanese_id),
                    japanese_id,
                    english_id,
                    japanese_contributor,
                    english_contributor,
                    japanese_status,
                    english_status,
                    japanese_license,
                    english_license,
                    pair_license,
                    snapshot_date,
                    snapshot_sha256,
                    japanese,
                    english,
                )
            )
            for contributor in (japanese_contributor, english_contributor):
                if contributor:
                    contributor_counts[contributor] += 1
                else:
                    unassigned_sides += 1
            if pair_license == CC0_LICENSE:
                cc0_pairs += 1
            else:
                attributed_pairs += 1

        if len(pending) >= 5_000:
            database.executemany(
                "INSERT INTO example_sentences VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                pending,
            )
            retained += len(pending)
            pending.clear()
    if pending:
        database.executemany(
            "INSERT INTO example_sentences VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            pending,
        )
        retained += len(pending)

    database.executemany(
        "INSERT INTO example_sentence_contributors(username, sentence_side_count) VALUES (?, ?)",
        sorted(contributor_counts.items()),
    )
    return {
        "retained_pairs": retained,
        "cc0_pairs": cc0_pairs,
        "attributed_pairs": attributed_pairs,
        "named_contributors": len(contributor_counts),
        "unassigned_sentence_sides": unassigned_sides,
    }
