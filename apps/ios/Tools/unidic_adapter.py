"""UniDic source adapter for app-owned pitch-accent facts."""

from __future__ import annotations

import csv
import io
import json
import sqlite3
import unicodedata
import zipfile
from pathlib import Path
from typing import Callable


def hiragana(value: str) -> str:
    return "".join(
        chr(ord(character) - 0x60) if "ァ" <= character <= "ヶ" else character
        for character in unicodedata.normalize("NFKC", value)
    )


def mora_count(value: str) -> int:
    combining_kana = set("ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ")
    return sum(1 for character in unicodedata.normalize("NFKC", value) if character not in combining_kana)


def apply_unidic_pitch(
    database: sqlite3.Connection,
    entry_records: list[dict[str, object]],
    source: Path,
    source_metadata: dict[str, object],
    normalize: Callable[[str], str],
) -> int:
    entry_ids_by_key: dict[tuple[str, str], list[object]] = {}
    for record in entry_records:
        reading = normalize(hiragana(str(record["reading"])))
        forms = list(record["written_values"]) + list(record["reading_values"])
        for form in forms:
            entry_ids_by_key.setdefault((normalize(str(form)), reading), []).append(record["id"])

    accents_by_entry_id: dict[object, set[tuple[int, int]]] = {}
    with zipfile.ZipFile(source) as archive:
        lexicon_name = next((name for name in archive.namelist() if name.endswith("/lex_3_1.csv")), None)
        if not lexicon_name:
            raise ValueError("UniDic archive is missing lex_3_1.csv")
        with archive.open(lexicon_name) as raw, io.TextIOWrapper(raw, encoding="utf-8", newline="") as text:
            for row in csv.reader(text):
                if len(row) < 31 or row[28] == "*":
                    continue
                try:
                    downstep = int(row[28].split(",", maxsplit=1)[0])
                except ValueError:
                    continue
                reading = hiragana(row[15])
                entry_ids = entry_ids_by_key.get((normalize(row[14]), normalize(reading)), [])
                accent = (downstep, mora_count(reading))
                for entry_id in entry_ids:
                    accents_by_entry_id.setdefault(entry_id, set()).add(accent)

    for entry_id, accents in accents_by_entry_id.items():
        downstep, count = sorted(accents)[0]
        database.execute(
            "UPDATE entries SET pitch_accent_json = ? WHERE id = ?",
            (json.dumps({"downstep": downstep, "moraCount": count,
                         "sourceIdentity": str(source_metadata["identity"])},
                        ensure_ascii=False, separators=(",", ":")), entry_id),
        )
    return len(accents_by_entry_id)
