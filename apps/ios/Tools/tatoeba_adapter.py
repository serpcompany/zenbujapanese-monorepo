"""Tatoeba source adapter for app-owned offline example pairs."""

from __future__ import annotations

import bz2
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


CC0_LICENSE = "CC0 1.0"
CC_BY_LICENSE = "CC BY 2.0 FR"
NAMED_CONTRIBUTOR = "named"
UNASSIGNED_CONTRIBUTOR = "not-supplied"


@dataclass(frozen=True)
class TatoebaSnapshotInputs:
    japanese_sentences: Path
    english_sentences: Path
    japanese_english_links: Path
    japanese_detailed_sentences: Path
    english_detailed_sentences: Path
    japanese_cc0_sentences: Path
    english_cc0_sentences: Path
    snapshot_date: str
    aggregate_sha256: str


@dataclass(frozen=True)
class DetailedSentence:
    text: str
    contributor: str | None


@dataclass(frozen=True)
class ExampleProvenanceRow:
    pair_id: str
    japanese_id: int
    english_id: int
    japanese_contributor: str | None
    english_contributor: str | None
    japanese_contributor_status: str
    english_contributor_status: str
    japanese_license: str
    english_license: str
    pair_license: str
    snapshot_date: str
    snapshot_sha256: str
    japanese: str
    english: str

    def sql_parameters(self) -> tuple[object, ...]:
        return (
            self.pair_id,
            "tatoeba.weekly-export",
            str(self.japanese_id),
            self.japanese_id,
            self.english_id,
            self.japanese_contributor,
            self.english_contributor,
            self.japanese_contributor_status,
            self.english_contributor_status,
            self.japanese_license,
            self.english_license,
            self.pair_license,
            self.snapshot_date,
            self.snapshot_sha256,
            self.japanese,
            self.english,
        )


EXAMPLE_INSERT = """
INSERT INTO example_sentences(
  id, source_identity, source_record_id,
  japanese_source_record_id, english_source_record_id,
  japanese_contributor, english_contributor,
  japanese_contributor_status, english_contributor_status,
  japanese_license, english_license, pair_license,
  source_snapshot_date, source_snapshot_sha256,
  japanese, english
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


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
) -> dict[int, DetailedSentence]:
    records: dict[int, DetailedSentence] = {}
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
            records[sentence_id] = DetailedSentence(sentence, None if username == r"\N" else username)
    missing = retained_ids.difference(records)
    if missing:
        first = min(missing)
        raise ValueError(f"detailed export is missing retained {language} sentence {first}")
    return records


def import_tatoeba_examples(
    database: sqlite3.Connection,
    snapshot: TatoebaSnapshotInputs,
) -> dict[str, int]:
    """Import one deterministic English translation with explicit provenance per Japanese sentence."""

    english_id_by_japanese_id: dict[int, int] = {}
    with bz2.open(snapshot.japanese_english_links, mode="rt", encoding="utf-8") as links:
        for line in links:
            japanese_id_text, english_id_text = line.rstrip("\n").split("\t", maxsplit=1)
            japanese_id, english_id = int(japanese_id_text), int(english_id_text)
            current = english_id_by_japanese_id.get(japanese_id)
            if current is None or english_id < current:
                english_id_by_japanese_id[japanese_id] = english_id

    japanese_by_id: dict[int, str] = {}
    with bz2.open(snapshot.japanese_sentences, mode="rt", encoding="utf-8") as sentences:
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
    with bz2.open(snapshot.english_sentences, mode="rt", encoding="utf-8") as sentences:
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
    japanese_details = _read_detailed_records(
        snapshot.japanese_detailed_sentences, "jpn", retained_japanese_ids
    )
    english_details = _read_detailed_records(
        snapshot.english_detailed_sentences, "eng", retained_english_ids
    )
    japanese_cc0_ids = _read_cc0_ids(snapshot.japanese_cc0_sentences, "jpn")
    english_cc0_ids = _read_cc0_ids(snapshot.english_cc0_sentences, "eng")

    contributor_counts: Counter[str] = Counter()
    retained = 0
    cc0_pairs = 0
    attributed_pairs = 0
    unassigned_sides = 0
    pending: list[ExampleProvenanceRow] = []

    def flush_pending() -> None:
        nonlocal retained
        if not pending:
            return
        database.executemany(EXAMPLE_INSERT, [row.sql_parameters() for row in pending])
        retained += len(pending)
        pending.clear()

    for english_id in sorted(english_by_id):
        english = english_by_id[english_id]
        english_detail = english_details[english_id]
        if english_detail.text != english:
            raise ValueError(f"English detailed/general text mismatch for sentence {english_id}")

        english_license = CC0_LICENSE if english_id in english_cc0_ids else CC_BY_LICENSE
        english_contributor = english_detail.contributor
        english_status = NAMED_CONTRIBUTOR if english_contributor else UNASSIGNED_CONTRIBUTOR
        for japanese_id in japanese_ids_by_english_id[english_id]:
            japanese = japanese_by_id[japanese_id]
            japanese_detail = japanese_details[japanese_id]
            if japanese_detail.text != japanese:
                raise ValueError(f"Japanese detailed/general text mismatch for sentence {japanese_id}")

            japanese_license = CC0_LICENSE if japanese_id in japanese_cc0_ids else CC_BY_LICENSE
            japanese_contributor = japanese_detail.contributor
            japanese_status = NAMED_CONTRIBUTOR if japanese_contributor else UNASSIGNED_CONTRIBUTOR
            pair_license = (
                CC0_LICENSE
                if japanese_license == CC0_LICENSE and english_license == CC0_LICENSE
                else CC_BY_LICENSE
            )
            pair_id = f"tatoeba:{japanese_id}:{english_id}"
            pending.append(
                ExampleProvenanceRow(
                    pair_id=pair_id,
                    japanese_id=japanese_id,
                    english_id=english_id,
                    japanese_contributor=japanese_contributor,
                    english_contributor=english_contributor,
                    japanese_contributor_status=japanese_status,
                    english_contributor_status=english_status,
                    japanese_license=japanese_license,
                    english_license=english_license,
                    pair_license=pair_license,
                    snapshot_date=snapshot.snapshot_date,
                    snapshot_sha256=snapshot.aggregate_sha256,
                    japanese=japanese,
                    english=english,
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
            flush_pending()
    flush_pending()

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
