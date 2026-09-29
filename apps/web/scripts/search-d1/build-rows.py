#!/usr/bin/env python3
"""Write the dictionary search rows as D1-compatible SQL.

Reads the app's LanguageReferenceData.sqlite3 and writes INSERTs for the tables Search needs,
then fills the FTS5 indexes. The tables themselves come from the search database's migrations
(drizzle/search), applied first. Language Reference IDs and semantic fingerprints become
lowercase hex text. `dictionary_import` is written by the import once everything else is in.

    python3 scripts/search-d1/build-rows.py <LanguageReferenceData.sqlite3> <out.sql>

scripts/search-d1/load-local.sh runs it for a local D1, and ensure-release.sh for D1.
"""

import sqlite3
import sys
import unicodedata

MAX_STATEMENT_BYTES = 90_000  # D1 rejects statements over 100 KB.


# Filled once their tables are loaded: romaji_fts from the romaji forms, and gloss_fts, an
# external-content index over gloss_atoms, by a rebuild. drizzle/search/0001_fts.sql creates them.
FILL_FTS = """
INSERT INTO romaji_fts(rowid, form) SELECT id, form FROM forms WHERE kind = 2;
INSERT INTO gloss_fts(gloss_fts) VALUES('rebuild');
"""

# The artifact formats this import reads, from its `metadata` table's `transform`.
SUPPORTED_TRANSFORMS = {'"jmdict-to-zenbu-language-reference-data-v2"'}


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_rows(out, table, columns, rows):
    head = f"INSERT INTO {table}({', '.join(columns)}) VALUES "
    batch, size = [], len(head)
    for row in rows:
        values = "(" + ",".join(literal(value) for value in row) + ")"
        if batch and size + len(values.encode()) + 2 > MAX_STATEMENT_BYTES:
            out.write(head + ",".join(batch) + ";\n")
            batch, size = [], len(head)
        batch.append(values)
        size += len(values.encode()) + 1
    if batch:
        out.write(head + ",".join(batch) + ";\n")



def main(source, destination):
    db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    # Fail before writing anything when the source isn't the dictionary, such as an LFS pointer.
    db.execute("SELECT 1 FROM entries LIMIT 1").fetchone()
    (transform,) = db.execute("SELECT value FROM metadata WHERE key = 'transform'").fetchone()
    if transform not in SUPPORTED_TRANSFORMS:
        sys.exit(f"Unsupported artifact transform {transform}; this import reads {SUPPORTED_TRANSFORMS}.")
    with open(destination, "w", encoding="utf-8") as out:
        write_rows(
            out,
            "entries",
            ["id", "source_record_id", "headword", "reading", "summary",
             "parts_of_speech_json", "is_common", "rank_score", "semantic_fingerprint"],
            db.execute(
                "SELECT lower(hex(id)), source_record_id, headword, reading, summary,"
                " parts_of_speech_json, is_common, rank_score, lower(hex(semantic_fingerprint))"
                " FROM entries ORDER BY id"
            ),
        )
        forms = db.execute(
            "SELECT rowid, lower(hex(entry_id)), form, kind FROM forms ORDER BY rowid"
        ).fetchall()
        # search.ts finds nothing for a Japanese query with no character form_chars indexes, which
        # is only right while every written or reading form is made of such characters (or spaces,
        # which a query never keeps).
        unindexed = {
            character
            for _, _, form, kind in forms
            if kind in (0, 1)
            for character in form
            if unicodedata.category(character)[0] not in "LMNPSZ"
            and unicodedata.category(character) != "Co"
        }
        if unindexed:
            sys.exit(
                "form_chars can't index these characters in forms: "
                + ", ".join(f"U+{ord(character):04X}" for character in sorted(unindexed))
            )
        write_rows(out, "forms", ["id", "entry_id", "form", "kind"], forms)
        write_rows(
            out,
            "form_chars",
            ["rowid", "chars"],
            ((rowid, " ".join(form)) for rowid, _, form, kind in forms if kind in (0, 1)),
        )
        write_rows(
            out,
            "form_priority_profiles",
            ["entry_id", "form", "kind", "primary_mask", "secondary_mask", "news_frequency_band"],
            db.execute(
                "SELECT lower(hex(entry_id)), form, kind, primary_mask, secondary_mask,"
                " news_frequency_band FROM form_priority_profiles"
            ),
        )
        write_rows(
            out,
            "canonical_senses",
            ["entry_id", "sense_order", "parts_of_speech_json"],
            db.execute(
                "SELECT lower(hex(entry_id)), sense_order, parts_of_speech_json"
                " FROM canonical_senses"
            ),
        )
        write_rows(
            out,
            "gloss_atoms",
            ["id", "entry_id", "sense_order", "gloss_order", "text", "normalized_text"],
            db.execute(
                "SELECT rowid, lower(hex(entry_id)), sense_order, gloss_order, text,"
                " normalized_text FROM gloss_atoms ORDER BY rowid"
            ),
        )
        write_rows(
            out,
            "sense_form_restrictions",
            ["entry_id", "sense_order", "kind", "form"],
            db.execute(
                "SELECT lower(hex(entry_id)), sense_order, kind, form FROM sense_form_restrictions"
            ),
        )
        write_rows(
            out,
            "reading_form_restrictions",
            ["entry_id", "reading", "written_form"],
            db.execute(
                "SELECT lower(hex(entry_id)), reading, written_form FROM reading_form_restrictions"
            ),
        )
        out.write(FILL_FTS)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
