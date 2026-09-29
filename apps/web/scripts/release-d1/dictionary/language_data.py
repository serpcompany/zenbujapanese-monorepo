"""The dictionary database's rows, read from the app's bundled language data (issue 464).

Shared by the import (build-rows.py, every word and kanji) and the local fixture export
(scripts/export-dictionary-fixtures.py, a few of each), so fixtures and D1 hold the same rows. The
rows have the detail core's shapes (src/lib/dictionary/detail/rows.ts) and are read with the
app's own queries.

Every input is checked before anything is read: an artifact whose transform or `artifact_schema`
this code doesn't know, or a pack built for another LanguageReferenceData.sqlite3, is refused.
"""

import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

# LookupClient.swift's SearchFormKind.
WRITTEN, READING = 0, 1
FORM_KINDS = {WRITTEN: "written", READING: "reading"}

# How many words the app lists for a kanji (`entries(containingKanji:)` binds 24).
KANJI_WORD_LIMIT = 24

# The artifact versions this code reads. A new version is a change here, reviewed with the
# re-recorded conformance suites (ADR 0006).
SUPPORTED_TRANSFORMS = {'"jmdict-to-zenbu-language-reference-data-v2"'}
# Each attached pack: its alias, file, `artifact_schema`, and (for frequency packs) `pack_id`.
PACKS = (
    ("compound_pitch", "CompoundPitch.sqlite3", "zenbu.compound-pitch.v1", None),
    ("jlpt", "JLPTLevelPack.sqlite3", "zenbu.level-pack.v1", "zenbu.jlpt.waller.levels"),
    ("tubelex", "TUBELEXFrequencyPack.sqlite3", "zenbu.frequency-pack.v1",
     "zenbu.tubelex.youtube.ja.unidic-3.1"),
)
KANJI_REFERENCE_SOURCES = {"metadataSourceIdentity": "edrdg.kanjidic2",
                           "componentSourceIdentity": "edrdg.kradfile"}
KANJI_ELEMENTS_SCHEMA = "zenbu.kanji-elements.v1"
KANJI_STROKES = ("KanjiStrokeData.sqlite3", "zenbu.kanji-stroke-diagrams.v1", "kanjivg")


def refuse(message):
    sys.exit(f"Refusing the language data: {message}")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path):
    """A real file, not a missing one or a Git LFS pointer."""
    if not path.is_file():
        refuse(f"{path} is missing")
    with open(path, "rb") as file:
        if file.read(40).startswith(b"version https://git-lfs"):
            refuse(f"{path.name} is a Git LFS pointer; run git lfs pull first")


def is_cjk_unified(character):
    """DictionaryEntry.swift's isCJKUnifiedIdeograph, for one code point."""
    return 0x3400 <= ord(character) <= 0x9FFF


# JavaScript's \s, which src/lib/dictionary/urls.ts's wordSlug uses; Python's differs.
_JS_WHITESPACE = "\t\n\v\f\r    -     　﻿"
_SLUG_BREAKS = re.compile(f"[/?#%\\\\{_JS_WHITESPACE}]+")


def word_slug(headword, reading):
    """urls.ts's wordSlug. The dictionary conformance gate checks every stored slug against it."""
    slug = _SLUG_BREAKS.sub("-", unicodedata.normalize("NFC", headword)).strip("-")
    return slug or reading


def stroke_problem(stroke):
    """Why KanjiStrokeOrderClient.swift's `decodeStroke` would reject a compact stroke, or None.
    Opcode 0 is followed by a point to move to, opcode 1 by the three points of a cubic curve;
    the stroke must begin with a move, so an empty one is rejected too."""
    index, commands = 0, 0
    while index < len(stroke):
        opcode, width = stroke[index], {0: 2, 1: 6}.get(stroke[index])
        if width is None:
            return "has an unknown path opcode"
        if index + width >= len(stroke):
            return "has an incomplete command"
        if commands == 0 and opcode != 0:
            return "doesn't begin with a move"
        index += 1 + width
        commands += 1
    if commands == 0:
        return "doesn't begin with a move"
    return None


class LanguageData:
    """LanguageReferenceData.sqlite3 with its packs attached, and the kanji JSON files."""

    def __init__(self, source, resources):
        self.source, self.resources = Path(source), Path(resources)
        require_file(self.source)
        self.db = sqlite3.connect(f"file:{self.source}?mode=ro", uri=True)
        # Fails here when the source isn't the dictionary.
        self.db.execute("SELECT 1 FROM entries LIMIT 1").fetchone()
        (transform,) = self.db.execute(
            "SELECT value FROM metadata WHERE key = 'transform'"
        ).fetchone()
        if transform not in SUPPORTED_TRANSFORMS:
            refuse(f"unsupported artifact transform {transform}; this import reads "
                   f"{sorted(SUPPORTED_TRANSFORMS)}")
        self.source_sha256 = sha256(self.source)
        for alias, name, schema, pack_id in PACKS:
            path = self.resources / name
            require_file(path)
            self.db.execute(f"ATTACH DATABASE ? AS {alias}", (f"file:{path}?mode=ro",))
            metadata = dict(self.db.execute(f"SELECT key, value FROM {alias}.metadata"))
            if metadata.get("artifact_schema") != schema:
                refuse(f"{name} is {metadata.get('artifact_schema')}; this import reads {schema}")
            if pack_id and metadata.get("pack_id") != pack_id:
                refuse(f"{name} is pack {metadata.get('pack_id')}, not {pack_id}")
            # Packs map entries by Language Reference ID, so each is built for one database.
            if metadata.get("language_data_sha256") != self.source_sha256:
                refuse(f"{name} was built for LanguageReferenceData "
                       f"{metadata.get('language_data_sha256')}, not {self.source_sha256}")

        self.kanji_reference = self._json("KanjiReferenceData.json")
        for key, value in KANJI_REFERENCE_SOURCES.items():
            if self.kanji_reference.get(key) != value:
                refuse(f"KanjiReferenceData.json's {key} is {self.kanji_reference.get(key)}, "
                       f"not {value}")
        self.kanji_elements = self._json("KanjiElementReferenceData.json")
        if self.kanji_elements.get("schema") != KANJI_ELEMENTS_SCHEMA:
            refuse(f"KanjiElementReferenceData.json is {self.kanji_elements.get('schema')}; "
                   f"this import reads {KANJI_ELEMENTS_SCHEMA}")
        self.kanji_by_character = {k["character"]: k for k in self.kanji_reference["entries"]}
        name, schema, source = KANJI_STROKES
        path = self.resources / name
        require_file(path)
        self.db.execute("ATTACH DATABASE ? AS strokes", (f"file:{path}?mode=ro",))
        metadata = dict(self.db.execute("SELECT key, value FROM strokes.metadata"))
        if metadata.get("artifact_schema") != schema or metadata.get("source_identity") != source:
            refuse(f"{name} is {metadata.get('artifact_schema')} from "
                   f"{metadata.get('source_identity')}; this import reads {schema} from {source}")
        self._restrictions = None
        self._ent_seqs = None
        self._frequency = None

    def _json(self, name):
        path = self.resources / name
        require_file(path)
        return json.loads(path.read_text(encoding="utf-8"))

    # Words.

    def ent_seqs(self):
        """Every entry's JMdict number, by lowercase hex Language Reference ID."""
        if self._ent_seqs is None:
            self._ent_seqs = dict(
                self.db.execute("SELECT lower(hex(id)), source_record_id FROM entries")
            )
        return self._ent_seqs

    def restrictions(self):
        """sense_form_restrictions, by entry and sense, in the app's order."""
        if self._restrictions is None:
            self._restrictions = {}
            for id_, sense_order, kind, form in self.db.execute(
                "SELECT lower(hex(entry_id)), sense_order, kind, form FROM sense_form_restrictions"
                " ORDER BY entry_id, sense_order, kind, form"
            ):
                self._restrictions.setdefault(id_, {}).setdefault(sense_order, []).append(
                    {"kind": FORM_KINDS[kind], "form": form}
                )
        return self._restrictions

    def frequency(self):
        """The default packs' evidence by entry, in the app's catalog order
        (FrequencyPackCatalog.json): JLPT levels, then TUBELEX ranks."""
        if self._frequency is None:
            self._frequency = {}
            for id_, level in self.db.execute(
                "SELECT lower(hex(language_reference_id)), level FROM jlpt.level_evidence"
            ):
                self._frequency.setdefault(id_, []).append({"pack": "jlpt", "level": level})
            for id_, rank in self.db.execute(
                "SELECT lower(hex(language_reference_id)), rank FROM tubelex.frequency_evidence"
            ):
                self._frequency.setdefault(id_, []).append({"pack": "tubelex", "rank": rank})
        return self._frequency

    ENTRY_COLUMNS = (
        "lower(hex(e.id)), e.source_record_id, e.headword, e.reading, e.summary,"
        " e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json, e.senses_json,"
        " e.relationships_json, e.pitch_accent_json, c.pitch_accent_json,"
        " lower(hex(e.semantic_fingerprint)), e.is_common, e.rank_score"
    )
    ENTRY_FROM = " FROM entries e LEFT JOIN compound_pitch.entry_pitch c ON c.entry_id = e.id"

    def entries(self, ent_seqs=None):
        """(EntryRow, extras) per entry, where extras holds the columns only D1 stores. Every
        entry by `ent_seq` when `ent_seqs` is None."""
        where, params = "", ()
        if ent_seqs is not None:
            where = f" WHERE e.source_record_id IN ({','.join('?' * len(ent_seqs))})"
            params = tuple(ent_seqs)
        cursor = self.db.execute(
            f"SELECT {self.ENTRY_COLUMNS}{self.ENTRY_FROM}{where} ORDER BY e.source_record_id",
            params,
        )
        for row in cursor:
            yield self.entry_row(row[:12]), {
                "fingerprint": row[12], "isCommon": bool(row[13]), "rankScore": row[14]
            }

    def entry_row(self, row):
        (id_, ent_seq, headword, reading, summary, parts, written, readings, senses,
         relationships, pitch, compound_pitch) = row
        restrictions = self.restrictions().get(id_, {})
        ent_seqs = self.ent_seqs()
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
                    "targetEntSeq": ent_seqs.get((relationship.get("targetID") or "").lower()),
                }
                for relationship in json.loads(relationships)
            ],
            "pitch": json.loads(pitch) if pitch else None,
            "compoundPitch": json.loads(compound_pitch) if compound_pitch else None,
        }

    def word_kanji(self, entry):
        """KANJIDIC2 meanings for the CJK unified ideographs in the headword and written forms,
        for the fixtures' word rows (D1 looks them up in its kanji table)."""
        characters = []
        for form in [entry["headword"]] + [form["value"] for form in entry["writtenForms"]]:
            characters += [c for c in form if is_cjk_unified(c) and c not in characters]
        return [
            {"character": c, "meanings": self.kanji_by_character[c]["meanings"]}
            for c in characters
            if c in self.kanji_by_character
        ]

    # Kanji.

    def kanji_row(self, character):
        reference = self.kanji_by_character[character]
        return {
            key: reference[key]
            for key in ("character", "strokeCount", "grade", "jlpt", "meanings", "readings",
                        "components")
        }

    def structures(self):
        """KanjiElementReferenceData.json's `kanji` list, by character."""
        return {k["character"]: k for k in self.kanji_elements["kanji"]}

    def elements(self):
        return self.kanji_elements["elements"]

    def stroke_diagrams(self):
        """KanjiStrokeData.sqlite3's diagrams (KanjiVG), by character, each checked as the app's
        KanjiStrokeOrderClient.swift decodes it: every stroke is a move then cubic curves (opcode
        0 with a point, opcode 1 with three), and the count matches `stroke_count`. The app shows
        no stroke order for a diagram it can't decode, so the import refuses one."""
        diagrams = {}
        for character, viewport_size, stroke_count, strokes_json in self.db.execute(
            "SELECT character, viewport_size, stroke_count, strokes_json FROM strokes.stroke_diagrams"
            " ORDER BY character"
        ):
            strokes = json.loads(strokes_json)
            if not strokes or len(strokes) != stroke_count:
                refuse(f"{character}'s stroke diagram has {len(strokes)} strokes, not {stroke_count}")
            for stroke in strokes:
                problem = stroke_problem(stroke)
                if problem:
                    refuse(f"a stroke of {character} {problem}: {stroke}")
            diagrams[character] = {
                "viewportSize": viewport_size, "strokeCount": stroke_count, "strokes": strokes
            }
        return diagrams

    def kanji_rows(self, character):
        """Everything a fixture kanji page reads, with `words` as the candidate rows."""
        structure = self.structures().get(character)
        element_by_glyph = {element["glyph"]: element for element in self.elements()}
        glyphs = structure["elementGlyphs"] if structure else []
        return {
            "kanji": self.kanji_row(character),
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
            "words": self.kanji_candidate_rows(character),
            "strokes": self.stroke_diagrams().get(character),
        }

    def kanji_candidate_rows(self, character):
        """Every entry in the fingerprint groups kanjiCandidateRowsSQL (LookupClient.swift) reads,
        for the fixtures, where src/lib/dictionary/detail/kanji.ts's kanjiWords orders them."""
        rows = self.db.execute(
            """
            WITH matching AS (
              SELECT DISTINCT f.entry_id FROM forms f WHERE f.kind = ? AND instr(f.form, ?) > 0
            )
            SELECT lower(hex(e.id)), e.source_record_id, e.headword, e.reading, e.summary,
              lower(hex(e.semantic_fingerprint)), e.is_common, e.rank_score,
              e.id IN (SELECT entry_id FROM matching)
            FROM entries e
            WHERE e.semantic_fingerprint IN (
              SELECT m.semantic_fingerprint FROM entries m
              WHERE m.id IN (SELECT entry_id FROM matching)
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
            for id_, ent_seq, headword, reading, summary, fingerprint, is_common, rank_score,
            contains in rows
        ]

    def kanji_word_ent_seqs(self):
        """Every kanji's word list, as `entries(containingKanji:)` (LookupClient.swift) returns
        it: the app's kanjiCandidateRowsSQL, grouped by semantic fingerprint and ordered, with
        each of the first 24 groups shown as its entry with the smallest Language Reference ID
        (`normalizedEntry`).

        The app scans every written form per kanji (`instr(f.form, ?) > 0`), which would take
        hours for 13,108 kanji. The same query runs here over `kanji_forms`, a temporary index of
        the (character, entry) pairs that scan finds, so each kanji reads only its own rows. Its
        ORDER BY and LIMIT are the app's, unchanged.
        """
        self.db.execute(
            "CREATE TEMP TABLE kanji_forms (character TEXT NOT NULL, entry_id BLOB NOT NULL,"
            " PRIMARY KEY (character, entry_id)) WITHOUT ROWID"
        )
        pairs = set()
        for entry_id, form in self.db.execute(
            "SELECT entry_id, form FROM forms WHERE kind = ?", (WRITTEN,)
        ):
            # instr() matches one code point anywhere in the form, as `in` does here.
            pairs.update((c, entry_id) for c in form if c in self.kanji_by_character)
        self.db.executemany("INSERT INTO temp.kanji_forms VALUES (?, ?)", pairs)

        # normalizedEntry: each fingerprint group's entry with the smallest ID. Lowercase hex
        # sorts the same as the ID's bytes.
        smallest = {}
        for fingerprint, id_, ent_seq in self.db.execute(
            "SELECT lower(hex(semantic_fingerprint)), lower(hex(id)), source_record_id"
            " FROM entries"
        ):
            if fingerprint not in smallest or id_ < smallest[fingerprint][0]:
                smallest[fingerprint] = (id_, ent_seq)

        words = {}
        for character in self.kanji_by_character:
            fingerprints = self.db.execute(
                f"""
                SELECT lower(hex(e.semantic_fingerprint)) AS fingerprint
                FROM temp.kanji_forms f
                JOIN entries e ON e.id = f.entry_id
                WHERE f.character = ?
                GROUP BY e.semantic_fingerprint
                ORDER BY
                  MIN(CASE WHEN instr(e.headword, ?) = 1 THEN 0 ELSE 1 END),
                  MIN(length(e.headword)), MAX(e.is_common) DESC, MAX(e.rank_score) DESC,
                  e.semantic_fingerprint
                LIMIT {KANJI_WORD_LIMIT}
                """,
                (character, character),
            )
            words[character] = [smallest[fingerprint][1] for (fingerprint,) in fingerprints]
        self.db.execute("DROP TABLE temp.kanji_forms")
        return words
