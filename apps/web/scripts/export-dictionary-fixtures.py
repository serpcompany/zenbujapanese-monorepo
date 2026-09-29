#!/usr/bin/env python3
"""Export local fixture rows for the word and kanji pages from the app's bundled data.

Local development uses seeded fixtures, never the full dictionary (docs/agents/web.md). The rows
have the detail core's shapes (src/lib/dictionary/detail/rows.ts), read with the app's own
queries, so page code built on them reads real data unchanged once D1 holds it.

    python3 scripts/export-dictionary-fixtures.py [path/to/SearchExperience/Resources]

The directory defaults to the app's bundled resources, which must be real files rather than Git
LFS pointers (`git lfs pull`).
"""

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT.parent / "ios/Modules/Sources/SearchExperience/Resources"
OUTPUT = ROOT / "src/lib/dictionary/fixtures"

# The いる homographs and the words written with 要, as JMdict entry numbers.
ENTRY_NUMBERS = [
    1546640, 1577980, 1465580, 1391500, 1322180, 1587780,
    1609600, 2188720, 1546750, 1546680, 1546850, 1612150,
]
# Kanji with a fixture page.
KANJI = ["要"]

# LookupClient.swift's SearchFormKind.
WRITTEN, READING = 0, 1
FORM_KINDS = {WRITTEN: "written", READING: "reading"}


def is_cjk_unified(character):
    """DictionaryEntry.swift's isCJKUnifiedIdeograph, for one code point."""
    return 0x3400 <= ord(character) <= 0x9FFF


def pitch_row(value):
    return json.loads(value) if value else None


def entry_row(db, row):
    (id_, ent_seq, headword, reading, summary, parts, written, readings, senses, relationships,
     pitch, compound_pitch) = row
    restrictions = {}
    for sense_order, kind, form in db.execute(
        "SELECT sense_order, kind, form FROM sense_form_restrictions"
        " WHERE entry_id = unhex(?) ORDER BY sense_order, kind, form",
        (id_,),
    ):
        restrictions.setdefault(sense_order, []).append({"kind": FORM_KINDS[kind], "form": form})
    target_numbers = {}
    for relationship in json.loads(relationships):
        target = relationship.get("targetID")
        if target and target not in target_numbers:
            found = db.execute(
                "SELECT source_record_id FROM entries WHERE id = unhex(?)", (target,)
            ).fetchone()
            target_numbers[target] = found[0] if found else None
    return {
        "id": id_,
        "entSeq": ent_seq,
        "headword": headword,
        "reading": reading,
        "summary": summary,
        "partsOfSpeech": json.loads(parts),
        "writtenForms": json.loads(written),
        "readingForms": json.loads(readings),
        "senses": [
            {**sense, "restrictions": restrictions.get(order, [])}
            for order, sense in enumerate(json.loads(senses))
        ],
        "relationships": [
            {
                "headword": relationship["headword"],
                "reading": relationship["reading"],
                "summary": relationship["summary"],
                "relation": relationship["relation"],
                "targetEntSeq": target_numbers.get(relationship.get("targetID")),
            }
            for relationship in json.loads(relationships)
        ],
        "pitch": pitch_row(pitch),
        "compoundPitch": pitch_row(compound_pitch),
    }


def frequency_rows(db, id_):
    """The default packs, in the app's catalog order (FrequencyPackCatalog.json)."""
    rows = []
    level = db.execute(
        "SELECT level FROM jlpt.level_evidence WHERE language_reference_id = unhex(?)", (id_,)
    ).fetchone()
    if level:
        rows.append({"pack": "jlpt", "level": level[0]})
    rank = db.execute(
        "SELECT rank FROM tubelex.frequency_evidence WHERE language_reference_id = unhex(?)",
        (id_,),
    ).fetchone()
    if rank:
        rows.append({"pack": "tubelex", "rank": rank[0]})
    return rows


def word_rows(db, kanji_by_character):
    rows = db.execute(
        "SELECT lower(hex(e.id)), e.source_record_id, e.headword, e.reading, e.summary,"
        " e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json, e.senses_json,"
        " e.relationships_json, e.pitch_accent_json, c.pitch_accent_json"
        " FROM entries e LEFT JOIN compound_pitch.entry_pitch c ON c.entry_id = e.id"
        f" WHERE e.source_record_id IN ({','.join('?' * len(ENTRY_NUMBERS))})",
        ENTRY_NUMBERS,
    ).fetchall()
    by_number = {row[1]: row for row in rows}
    words = []
    for number in ENTRY_NUMBERS:
        if number not in by_number:
            print(f"Skipping entry {number}: not in LanguageReferenceData", file=sys.stderr)
            continue
        entry = entry_row(db, by_number[number])
        characters = []
        for form in [entry["headword"]] + [form["value"] for form in entry["writtenForms"]]:
            characters += [c for c in form if is_cjk_unified(c) and c not in characters]
        words.append({
            "entry": entry,
            "frequency": frequency_rows(db, entry["id"]),
            "kanji": [
                {"character": c, "meanings": kanji_by_character[c]["meanings"]}
                for c in characters
                if c in kanji_by_character
            ],
            "examples": [],
        })
    return words


def kanji_word_rows(db, character):
    """Every entry in the fingerprint groups kanjiCandidateRowsSQL (LookupClient.swift) reads."""
    rows = db.execute(
        """
        WITH matching AS (
          SELECT DISTINCT f.entry_id FROM forms f WHERE f.kind = ? AND instr(f.form, ?) > 0
        )
        SELECT lower(hex(e.id)), e.source_record_id, e.headword, e.reading, e.summary,
          lower(hex(e.semantic_fingerprint)), e.is_common, e.rank_score,
          e.id IN (SELECT entry_id FROM matching)
        FROM entries e
        WHERE e.semantic_fingerprint IN (
          SELECT m.semantic_fingerprint FROM entries m WHERE m.id IN (SELECT entry_id FROM matching)
        )
        ORDER BY lower(hex(e.id))
        """,
        (WRITTEN, character),
    )
    return [
        {
            "id": id_,
            "entSeq": ent_seq,
            "headword": headword,
            "reading": reading,
            "summary": summary,
            "fingerprint": fingerprint,
            "isCommon": bool(is_common),
            "rankScore": rank_score,
            "containsKanji": bool(contains),
        }
        for id_, ent_seq, headword, reading, summary, fingerprint, is_common, rank_score, contains
        in rows
    ]


def kanji_rows(db, character, kanji_by_character, elements):
    reference = kanji_by_character[character]
    structure = next((k for k in elements["kanji"] if k["character"] == character), None)
    element_by_glyph = {element["glyph"]: element for element in elements["elements"]}
    glyphs = structure["elementGlyphs"] if structure else []
    return {
        "kanji": {
            key: reference[key]
            for key in (
                "character", "strokeCount", "grade", "jlpt", "meanings", "readings", "components"
            )
        },
        "structure": {
            "onReadings": structure["onReadings"],
            "elementGlyphs": structure["elementGlyphs"],
            "explicitPhoneticElement": structure["explicitPhoneticElement"],
        } if structure else None,
        "elements": [
            {
                "glyph": glyph,
                "meanings": element_by_glyph[glyph]["meanings"],
                "commonLinkedOnReadings": element_by_glyph[glyph]["commonLinkedOnReadings"],
            }
            for glyph in glyphs
            if glyph in element_by_glyph
        ],
        "words": kanji_word_rows(db, character),
    }


def write(name, rows):
    """One row per line, so a regenerated fixture diffs by row. Biome leaves these files alone."""
    lines = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)
    (OUTPUT / name).write_text(f"[\n{lines}\n]\n", encoding="utf-8")


def main(resources):
    for name in ("LanguageReferenceData.sqlite3", "KanjiReferenceData.json"):
        with open(resources / name, "rb") as file:
            if file.read(40).startswith(b"version https://git-lfs"):
                sys.exit(f"{name} is a Git LFS pointer; run git lfs pull first")
    db = sqlite3.connect(f"file:{resources / 'LanguageReferenceData.sqlite3'}?mode=ro", uri=True)
    for alias, name in (
        ("compound_pitch", "CompoundPitch.sqlite3"),
        ("jlpt", "JLPTLevelPack.sqlite3"),
        ("tubelex", "TUBELEXFrequencyPack.sqlite3"),
    ):
        db.execute(f"ATTACH DATABASE ? AS {alias}", (f"file:{resources / name}?mode=ro",))
    reference = json.loads((resources / "KanjiReferenceData.json").read_text(encoding="utf-8"))
    kanji_by_character = {entry["character"]: entry for entry in reference["entries"]}
    elements = json.loads(
        (resources / "KanjiElementReferenceData.json").read_text(encoding="utf-8")
    )
    write("words.json", word_rows(db, kanji_by_character))
    kanji = []
    for character in KANJI:
        if character not in kanji_by_character:
            print(f"Skipping kanji {character}: not in KanjiReferenceData", file=sys.stderr)
            continue
        kanji.append(kanji_rows(db, character, kanji_by_character, elements))
    # Word rows, most of the data, go one per line in their own file, keyed by their kanji.
    write("kanji.json", [{k: v for k, v in rows.items() if k != "words"} for rows in kanji])
    write(
        "kanji-words.json",
        [{"kanji": rows["kanji"]["character"], **word} for rows in kanji for word in rows["words"]],
    )


if __name__ == "__main__":
    if len(sys.argv) > 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]) if len(sys.argv) == 2 else RESOURCES)
