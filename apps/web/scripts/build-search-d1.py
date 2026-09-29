#!/usr/bin/env python3
"""Write the dictionary search tables as D1-compatible SQL.

Reads the app's LanguageReferenceData.sqlite3 and writes only the tables Search needs, with
FTS5 indexes in place of the app's FTS4 ones (D1 rejects FTS4). Language Reference IDs and
semantic fingerprints become lowercase hex text. `dictionary_import` records the source file's
SHA-256, so the conformance suite can check it runs against the artifact it pins.

    python3 scripts/build-search-d1.py <LanguageReferenceData.sqlite3> <out.sql>

Load the result into a local D1 with `scripts/load-search-d1.sh`.
"""

import hashlib
import sqlite3
import sys
import unicodedata
from pathlib import Path

MAX_STATEMENT_BYTES = 90_000  # D1 rejects statements over 100 KB.

SCHEMA = """
CREATE TABLE dictionary_import (
  artifact TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  source_record_id INTEGER NOT NULL,
  headword TEXT NOT NULL,
  reading TEXT NOT NULL,
  summary TEXT NOT NULL,
  parts_of_speech_json TEXT NOT NULL,
  is_common INTEGER NOT NULL,
  rank_score INTEGER NOT NULL,
  semantic_fingerprint TEXT NOT NULL
);
CREATE TABLE forms (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL,
  form TEXT NOT NULL,
  kind INTEGER NOT NULL
);
CREATE TABLE form_priority_profiles (
  entry_id TEXT NOT NULL,
  form TEXT NOT NULL,
  kind INTEGER NOT NULL,
  primary_mask INTEGER NOT NULL,
  secondary_mask INTEGER NOT NULL,
  news_frequency_band INTEGER,
  PRIMARY KEY(entry_id, form, kind)
) WITHOUT ROWID;
CREATE TABLE canonical_senses (
  entry_id TEXT NOT NULL,
  sense_order INTEGER NOT NULL,
  parts_of_speech_json TEXT NOT NULL,
  PRIMARY KEY(entry_id, sense_order)
) WITHOUT ROWID;
CREATE TABLE gloss_atoms (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL,
  sense_order INTEGER NOT NULL,
  gloss_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL
);
CREATE TABLE sense_form_restrictions (
  entry_id TEXT NOT NULL,
  sense_order INTEGER NOT NULL,
  kind INTEGER NOT NULL,
  form TEXT NOT NULL,
  PRIMARY KEY(entry_id, sense_order, kind, form)
) WITHOUT ROWID;
CREATE TABLE reading_form_restrictions (
  entry_id TEXT NOT NULL,
  reading TEXT NOT NULL,
  written_form TEXT NOT NULL,
  PRIMARY KEY(entry_id, reading, written_form)
) WITHOUT ROWID;
CREATE VIRTUAL TABLE form_chars USING fts5(
  chars, content='', tokenize="unicode61 remove_diacritics 0 categories 'L* M* N* P* S* Co'"
);
"""

# The app's FTS4 tables: gloss_fts used `porter` (over the simple tokenizer) and form_fts used
# `simple`. FTS5's `porter ascii` and `ascii` tokenizers split and fold the same way, and
# search.ts translates the app's FTS4 query syntax. One difference remains: FTS4's porter keeps
# only the first and last 3 characters of a token with digits that is longer than 6, so the app
# matches some long numbers that D1 doesn't (9999999 finds 99.99999999% only in the app).
# form_chars is new: every written or reading form with a space between characters, so a phrase
# query finds any substring, replacing the app's `instr(form, ?)` scan over every form.
INDEXES = """
CREATE INDEX forms_form_index ON forms(form, entry_id);
CREATE VIRTUAL TABLE gloss_fts USING fts5(
  normalized_text, content='gloss_atoms', content_rowid='id', tokenize='porter ascii'
);
INSERT INTO gloss_fts(gloss_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE romaji_fts USING fts5(form, content='', tokenize='ascii');
INSERT INTO romaji_fts(rowid, form) SELECT id, form FROM forms WHERE kind = 2;
"""


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


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(source, destination):
    db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    # Fail before writing anything when the source isn't the dictionary, such as an LFS pointer.
    db.execute("SELECT 1 FROM entries LIMIT 1").fetchone()
    with open(destination, "w", encoding="utf-8") as out:
        out.write(SCHEMA)
        write_rows(
            out,
            "dictionary_import",
            ["artifact", "sha256"],
            [(Path(source).name, file_sha256(source))],
        )
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
        out.write(INDEXES)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
