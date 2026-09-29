#!/usr/bin/env python3
"""Export a few real dictionary entries as local fixture data.

Local development uses seeded fixtures, never the full dictionary (docs/agents/web.md). These
records keep the app database's shapes, so page code built on them reads real data unchanged.

    python3 scripts/export-dictionary-fixtures.py <LanguageReferenceData.sqlite3>
"""

import json
import sqlite3
import sys
from pathlib import Path

# The いる homographs and the words written with 要, as JMdict entry numbers.
ENTRY_NUMBERS = [
    1546640, 1577980, 1465580, 1391500, 1322180, 1587780,
    1609600, 2188720, 1546750, 1546680, 1546850, 1612150,
]
OUTPUT = Path(__file__).resolve().parent.parent / "src/lib/dictionary/fixtures/entries.json"


def main(source):
    db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    rows = db.execute(
        "SELECT lower(hex(id)), source_record_id, headword, reading, summary,"
        " parts_of_speech_json, senses_json, pitch_accent_json FROM entries"
        f" WHERE source_record_id IN ({','.join('?' * len(ENTRY_NUMBERS))})",
        ENTRY_NUMBERS,
    ).fetchall()
    by_number = {row[1]: row for row in rows}
    entries = []
    for number in ENTRY_NUMBERS:
        id_, ent_seq, headword, reading, summary, parts, senses, pitch = by_number[number]
        pitch = json.loads(pitch) if pitch else None
        entries.append({
            "id": id_,
            "entSeq": ent_seq,
            "headword": headword,
            "reading": reading,
            "summary": summary,
            "partsOfSpeech": json.loads(parts),
            "senses": json.loads(senses),
            "pitch": {"downstep": pitch["downstep"], "moraCount": pitch["moraCount"]}
            if pitch else None,
        })
    OUTPUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
