#!/usr/bin/env python3
"""Deterministic app-owned integrity evidence for Dictionary Ranking tables."""

from __future__ import annotations

import hashlib
import sqlite3


MAPPING_QUERIES = (
    (
        "form_priority_profiles",
        "SELECT entry_id, form, kind, primary_mask, secondary_mask, news_frequency_band "
        "FROM form_priority_profiles ORDER BY entry_id, form, kind",
    ),
    (
        "canonical_senses",
        "SELECT entry_id, sense_order, parts_of_speech_json FROM canonical_senses "
        "ORDER BY entry_id, sense_order",
    ),
    (
        "gloss_atoms",
        "SELECT entry_id, sense_order, gloss_order, text, normalized_text FROM gloss_atoms "
        "ORDER BY entry_id, sense_order, gloss_order",
    ),
    (
        "sense_form_restrictions",
        "SELECT entry_id, sense_order, kind, form FROM sense_form_restrictions "
        "ORDER BY entry_id, sense_order, kind, form",
    ),
    (
        "reading_form_restrictions",
        "SELECT entry_id, reading, written_form FROM reading_form_restrictions "
        "ORDER BY entry_id, reading, written_form",
    ),
)


def dictionary_ranking_mapping_sha256(database: sqlite3.Connection) -> str:
    digest = hashlib.sha256()
    for table, query in MAPPING_QUERIES:
        digest.update(table.encode())
        digest.update(b"\0")
        for row in database.execute(query):
            for value in row:
                if value is None:
                    digest.update(b"\x00")
                elif isinstance(value, int):
                    digest.update(b"\x01")
                    digest.update(str(value).encode())
                    digest.update(b"\0")
                else:
                    payload = value if isinstance(value, bytes) else value.encode()
                    digest.update(b"\x03" if isinstance(value, bytes) else b"\x02")
                    digest.update(len(payload).to_bytes(8, "big"))
                    digest.update(payload)
            digest.update(b"\xff")
        digest.update(b"\xfe")
    return digest.hexdigest()
