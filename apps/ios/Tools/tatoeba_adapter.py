"""Tatoeba source adapter for app-owned offline example pairs."""

from __future__ import annotations

import bz2
import hashlib
import sqlite3
import struct
import unicodedata
from pathlib import Path


EXAMPLE_PAIR_ID_SCHEME = "esp1-sha256-128-nfc-length-prefixed"
EXAMPLE_PAIR_ID_PREFIX = "esp1_"


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


def import_tatoeba_examples(
    database: sqlite3.Connection,
    japanese_source: Path,
    english_source: Path,
    links_source: Path,
) -> int:
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

    pairs_by_id: dict[bytes, tuple[str, str]] = {}
    provenance: set[tuple[bytes, str, int, int]] = set()
    with bz2.open(english_source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, language, sentence = line.rstrip("\n").split("\t", maxsplit=2)
            english_id = int(sentence_id_text)
            if language != "eng":
                continue
            for japanese_id in japanese_ids_by_english_id.get(english_id, []):
                japanese, english = _canonical_pair(japanese_by_id[japanese_id], sentence)
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
                    )
                )

    database.executemany(
        "INSERT INTO example_sentences(id, japanese, english) VALUES (?, ?, ?)",
        ((pair_id, *pairs_by_id[pair_id]) for pair_id in sorted(pairs_by_id)),
    )
    database.executemany(
        """
        INSERT INTO example_sentence_provenance(
          pair_id, source_identity, source_japanese_record_id, source_english_record_id
        ) VALUES (?, ?, ?, ?)
        """,
        sorted(provenance),
    )
    return len(pairs_by_id)
