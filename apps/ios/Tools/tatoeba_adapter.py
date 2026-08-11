"""Tatoeba source adapter for app-owned offline example pairs."""

from __future__ import annotations

import bz2
import sqlite3
from pathlib import Path


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

    retained = 0
    pending: list[tuple[str, str, str, str, str]] = []
    with bz2.open(english_source, mode="rt", encoding="utf-8") as sentences:
        for line in sentences:
            sentence_id_text, language, sentence = line.rstrip("\n").split("\t", maxsplit=2)
            english_id = int(sentence_id_text)
            if language != "eng":
                continue
            for japanese_id in japanese_ids_by_english_id.get(english_id, []):
                pending.append((f"tatoeba:{japanese_id}:{english_id}", "tatoeba.weekly-export",
                                str(japanese_id), japanese_by_id[japanese_id], sentence))
            if len(pending) >= 5_000:
                database.executemany("INSERT INTO example_sentences VALUES (?, ?, ?, ?, ?)", pending)
                retained += len(pending)
                pending.clear()
    if pending:
        database.executemany("INSERT INTO example_sentences VALUES (?, ?, ?, ?, ?)", pending)
        retained += len(pending)
    return retained
