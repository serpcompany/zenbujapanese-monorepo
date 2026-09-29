#!/usr/bin/env python3
"""Write the dictionary database's rows as D1-compatible SQL (issue 464, phase 2).

Reads the app's bundled language data (language_data.py) and writes INSERTs for every word
(218,382), every kanji (13,108) with its word list precomputed, the kanji structures, the
element glyphs, and stroke order (6,430 KanjiVG diagrams). The tables come from the dictionary
database's migrations (drizzle/dictionary), applied first; `dictionary_import` is written by the
import once everything else is in. Examples (example_sentences, word_examples) come in a later
PR, and retired_ids stays empty until the pipeline (#463) records retired entries.

    python3 scripts/release-d1/dictionary/build-rows.py <LanguageReferenceData.sqlite3> <resources dir> <out.sql>

`resources dir` holds the other inputs (CompoundPitch, the JLPT and TUBELEX packs, the kanji
JSON files, and KanjiStrokeData): the app's SearchExperience/Resources. scripts/release-d1/load-local.sh dictionary
runs it for a local D1, and ensure-release.sh for D1.
"""

import json
import sys
import time
from pathlib import Path

from language_data import LanguageData, word_slug

MAX_STATEMENT_BYTES = 90_000  # D1 rejects statements over 100 KB.


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def as_json(value):
    return None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write_rows(out, table, columns, rows):
    """Multi-row INSERTs, each under D1's statement limit. Returns the row count."""
    head = f"INSERT INTO {table}({', '.join(columns)}) VALUES "
    batch, size, count = [], len(head), 0
    for row in rows:
        values = "(" + ",".join(literal(value) for value in row) + ")"
        if len(head) + len(values.encode()) > MAX_STATEMENT_BYTES:
            sys.exit(f"A {table} row is over D1's statement limit: {values[:200]}")
        if batch and size + len(values.encode()) + 2 > MAX_STATEMENT_BYTES:
            out.write(head + ",".join(batch) + ";\n")
            batch, size = [], len(head)
        batch.append(values)
        size += len(values.encode()) + 1
        count += 1
    if batch:
        out.write(head + ",".join(batch) + ";\n")
    return count


def word_values(data):
    frequency = data.frequency()
    for entry, extras in data.entries():
        yield (
            entry["entSeq"], entry["id"], word_slug(entry["headword"], entry["reading"]),
            entry["headword"], entry["reading"], entry["summary"],
            as_json(entry["partsOfSpeech"]), as_json(entry["writtenForms"]),
            as_json(entry["readingForms"]), as_json(entry["senses"]),
            as_json(entry["relationships"]), as_json(entry["pitch"]),
            as_json(entry["compoundPitch"]), as_json(frequency.get(entry["id"], [])),
            extras["fingerprint"], extras["isCommon"], extras["rankScore"],
        )


def kanji_values(data, words):
    for character, reference in data.kanji_by_character.items():
        row = data.kanji_row(character)
        yield (
            character, row["strokeCount"], row["grade"], row["jlpt"], reference["frequencyRank"],
            as_json(row["meanings"]),
            # KanjiReadingRow: only the value and kind.
            as_json([{"value": r["value"], "kind": r["kind"]} for r in row["readings"]]),
            as_json(row["components"]), as_json(words[character]),
            # A kanji with no meanings or readings stays out of search engines (#465).
            bool(row["meanings"] or row["readings"]),
        )


def main(source, resources, destination):
    started = time.monotonic()
    data = LanguageData(source, resources)
    words = data.kanji_word_ent_seqs()
    print(f"Ordered every kanji's words in {time.monotonic() - started:.0f} s", file=sys.stderr)
    counts = {}
    with open(destination, "w", encoding="utf-8") as out:
        counts["words"] = write_rows(
            out, "words",
            ["ent_seq", "id", "slug", "headword", "reading", "summary", "parts_of_speech_json",
             "written_forms_json", "reading_forms_json", "senses_json", "relationships_json",
             "pitch_json", "compound_pitch_json", "frequency_json", "semantic_fingerprint",
             "is_common", "rank_score"],
            word_values(data),
        )
        counts["kanji"] = write_rows(
            out, "kanji",
            ["character", "stroke_count", "grade", "jlpt", "frequency_rank", "meanings_json",
             "readings_json", "components_json", "word_ent_seqs_json", "indexable"],
            kanji_values(data, words),
        )
        counts["kanji_strokes"] = write_rows(
            out, "kanji_strokes",
            ["character", "viewport_size", "stroke_count", "strokes_json"],
            (
                (character, diagram["viewportSize"], diagram["strokeCount"],
                 as_json(diagram["strokes"]))
                for character, diagram in data.stroke_diagrams().items()
            ),
        )
        counts["kanji_elements"] = write_rows(
            out, "kanji_elements",
            ["character", "meanings_json", "on_readings_json", "frequency_rank",
             "element_glyphs_json", "explicit_phonetic_element"],
            (
                (k["character"], as_json(k["meanings"]), as_json(k["onReadings"]),
                 k["frequencyRank"], as_json(k["elementGlyphs"]), k["explicitPhoneticElement"])
                for k in data.structures().values()
            ),
        )
        counts["element_glyphs"] = write_rows(
            out, "element_glyphs",
            ["glyph", "alternatives_json", "meanings_json", "on_readings_json",
             "common_linked_on_readings_json", "containing_characters_json"],
            (
                (e["glyph"], as_json(e["alternatives"]), as_json(e["meanings"]),
                 as_json(e["onReadings"]), as_json(e["commonLinkedOnReadings"]),
                 as_json(e["containingCharacters"]))
                for e in data.elements()
            ),
        )
    print(f"Wrote {counts} in {time.monotonic() - started:.0f} s", file=sys.stderr)
    # Every entry and kanji becomes a page.
    expected = {
        "words": data.db.execute("SELECT count(*) FROM entries").fetchone()[0],
        "kanji": len(data.kanji_reference["entries"]),
    }
    for table, count in expected.items():
        if counts[table] != count:
            sys.exit(f"Wrote {counts[table]} {table} rows, expected {count}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
