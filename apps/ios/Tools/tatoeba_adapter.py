"""Tatoeba source adapter for app-owned offline example pairs."""

from __future__ import annotations

import bz2
import hashlib
import sqlite3
import struct
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


CC0_LICENSE = "CC0 1.0"
CC_BY_LICENSE = "CC BY 2.0 FR"
NAMED_CONTRIBUTOR = "named"
UNASSIGNED_CONTRIBUTOR = "not-supplied"
EXAMPLE_PAIR_ID_SCHEME = "esp1-sha256-128-nfc-length-prefixed"
EXAMPLE_PAIR_ID_PREFIX = "esp1_"


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


def _canonical_pair(japanese: str, english: str) -> tuple[str, str]:
    return unicodedata.normalize("NFC", japanese), unicodedata.normalize("NFC", english)


def app_owned_example_pair_storage_id(japanese: str, english: str) -> bytes:
    """Return the compact opaque identity stored behind the corpus boundary."""
    digest = hashlib.sha256()
    digest.update(b"zenbu.example-sentence-pair.v1\0")
    for value in _canonical_pair(japanese, english):
        encoded = value.encode("utf-8")
        digest.update(struct.pack(">Q", len(encoded)))
        digest.update(encoded)
    return digest.digest()[:16]


def app_owned_example_pair_id(japanese: str, english: str) -> str:
    """Return the public encoding of the app-owned semantic-pair identity."""
    return EXAMPLE_PAIR_ID_PREFIX + app_owned_example_pair_storage_id(japanese, english).hex()


def _read_cc0_ids(source: Path, language: str) -> set[int]:
    sentence_ids: set[int] = set()
    with bz2.open(source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, row_language, _sentence, _modified_at = line.rstrip("\n").split(
                "\t", maxsplit=3
            )
            if row_language != language:
                raise ValueError(
                    f"CC0 export language mismatch: expected {language}, got {row_language}"
                )
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
            fields = line.rstrip("\n").split("\t", maxsplit=5)
            if len(fields) != 6:
                raise ValueError("invalid detailed sentence row")
            sentence_id_text, row_language, sentence, username, _created_at, _modified_at = fields
            sentence_id = int(sentence_id_text)
            if sentence_id not in retained_ids:
                continue
            if row_language != language:
                raise ValueError(
                    f"detailed export language mismatch: expected {language}, got {row_language}"
                )
            records[sentence_id] = DetailedSentence(
                unicodedata.normalize("NFC", sentence), None if username == r"\N" else username
            )
    missing = retained_ids.difference(records)
    if missing:
        raise ValueError(f"detailed export is missing retained {language} sentence {min(missing)}")
    return records


def import_tatoeba_examples(
    database: sqlite3.Connection,
    snapshot: TatoebaSnapshotInputs,
) -> dict[str, int]:
    """Import deterministic semantic pairs with explicit source/license provenance."""
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
                japanese_by_id[sentence_id] = unicodedata.normalize("NFC", sentence)

    japanese_ids_by_english_id: dict[int, list[int]] = {}
    for japanese_id, english_id in english_id_by_japanese_id.items():
        if japanese_id in japanese_by_id:
            japanese_ids_by_english_id.setdefault(english_id, []).append(japanese_id)
    for japanese_ids in japanese_ids_by_english_id.values():
        japanese_ids.sort()

    english_by_id: dict[int, str] = {}
    with bz2.open(snapshot.english_sentences, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, language, sentence = line.rstrip("\n").split("\t", maxsplit=2)
            sentence_id = int(sentence_id_text)
            if language == "eng" and sentence_id in japanese_ids_by_english_id:
                english_by_id[sentence_id] = unicodedata.normalize("NFC", sentence)

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

    pairs_by_id: dict[bytes, tuple[str, str]] = {}
    provenance: set[tuple[object, ...]] = set()
    contributor_counts: Counter[str] = Counter()
    cc0_pairs = 0
    attributed_pairs = 0
    unassigned_sides = 0

    for english_id in sorted(english_by_id):
        english = english_by_id[english_id]
        english_detail = english_details[english_id]
        if english_detail.text != english:
            raise ValueError(f"English detailed/general text mismatch for sentence {english_id}")
        english_license = CC0_LICENSE if english_id in english_cc0_ids else CC_BY_LICENSE
        english_status = NAMED_CONTRIBUTOR if english_detail.contributor else UNASSIGNED_CONTRIBUTOR

        for japanese_id in japanese_ids_by_english_id[english_id]:
            japanese = japanese_by_id[japanese_id]
            japanese_detail = japanese_details[japanese_id]
            if japanese_detail.text != japanese:
                raise ValueError(f"Japanese detailed/general text mismatch for sentence {japanese_id}")
            japanese_license = CC0_LICENSE if japanese_id in japanese_cc0_ids else CC_BY_LICENSE
            japanese_status = (
                NAMED_CONTRIBUTOR if japanese_detail.contributor else UNASSIGNED_CONTRIBUTOR
            )
            pair_license = (
                CC0_LICENSE
                if japanese_license == CC0_LICENSE and english_license == CC0_LICENSE
                else CC_BY_LICENSE
            )
            pair_id = app_owned_example_pair_storage_id(japanese, english)
            pair = (japanese, english)
            existing = pairs_by_id.get(pair_id)
            if existing is not None and existing != pair:
                raise ValueError(
                    "opaque Example Sentence pair ID collision between distinct normalized pairs"
                )
            pairs_by_id[pair_id] = pair
            provenance.add(
                (
                    pair_id,
                    "tatoeba.weekly-export",
                    japanese_id,
                    english_id,
                    japanese_detail.contributor,
                    english_detail.contributor,
                    japanese_status,
                    english_status,
                    japanese_license,
                    english_license,
                    pair_license,
                    snapshot.snapshot_date,
                    snapshot.aggregate_sha256,
                )
            )
            for contributor in (japanese_detail.contributor, english_detail.contributor):
                if contributor:
                    contributor_counts[contributor] += 1
                else:
                    unassigned_sides += 1
            if pair_license == CC0_LICENSE:
                cc0_pairs += 1
            else:
                attributed_pairs += 1

    database.executemany(
        "INSERT INTO example_sentences(id, japanese, english) VALUES (?, ?, ?)",
        ((pair_id, *pairs_by_id[pair_id]) for pair_id in sorted(pairs_by_id)),
    )
    database.executemany(
        """
        INSERT INTO example_sentence_provenance(
          pair_id, source_identity, source_japanese_record_id, source_english_record_id,
          japanese_contributor, english_contributor,
          japanese_contributor_status, english_contributor_status,
          japanese_license, english_license, pair_license,
          source_snapshot_date, source_snapshot_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        sorted(provenance),
    )
    database.executemany(
        "INSERT INTO example_sentence_contributors(username, sentence_side_count) VALUES (?, ?)",
        sorted(contributor_counts.items()),
    )
    return {
        "retained_pairs": len(pairs_by_id),
        "provenance_rows": len(provenance),
        "cc0_pairs": cc0_pairs,
        "attributed_pairs": attributed_pairs,
        "named_contributors": len(contributor_counts),
        "unassigned_sentence_sides": unassigned_sides,
    }
