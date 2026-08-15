#!/usr/bin/env python3
"""Normalize a pinned official JMdict English export into Zenbu Language Reference Data."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from language_data_tools import file_sha256
from dictionary_ranking_adapter import dictionary_ranking_mapping_sha256
from tatoeba_adapter import EXAMPLE_PAIR_ID_SCHEME, import_tatoeba_examples
from example_sentence_retrieval_index import build_indexes
from unidic_adapter import apply_unidic_pitch


WORD_RE = re.compile(r"[a-z0-9]+(?:['-][a-z0-9]+)*")
FORM_KIND_WRITTEN = 0
FORM_KIND_READING = 1
FORM_KIND_ROMAJI = 2
PRIORITY_PRIMARY_BITS = {"spec1": 1, "ichi1": 2, "news1": 4, "gai1": 8}
PRIORITY_SECONDARY_BITS = {"spec2": 1, "ichi2": 2, "news2": 4, "gai2": 8}
EXPECTED_PRIORITY_PROFILE_COUNT = 56_127
EXPECTED_GLOSS_ATOM_COUNT = 441_826
EXPECTED_SENSE_COUNT = 253_020
EXPECTED_SENSE_RESTRICTION_COUNT = 1_929
EXPECTED_READING_RESTRICTION_COUNT = 6_201

KANA_ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "wi", "ゑ": "we", "を": "o", "ん": "n",
    "ゔ": "vu",
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
}


def normalized_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def normalize_parts_of_speech(provider_labels: list[str]) -> list[str]:
    categories: list[str] = []
    rules = [
        ("ichidan verb", "Ichidan Verb"),
        ("godan verb", "Godan Verb"),
        ("kuru verb", "Irregular Verb"),
        ("suru verb", "Suru Verb"),
        ("intransitive verb", "Intransitive Verb"),
        ("transitive verb", "Transitive Verb"),
        ("auxiliary verb", "Auxiliary Verb"),
        ("adjectival nouns or quasi-adjectives", "Na-adjective"),
        ("adjective (keiyoushi)", "I-adjective"),
        ("noun", "Noun"), ("verb", "Verb"), ("adjective", "Adjective"),
        ("adverb", "Adverb"), ("particle", "Particle"), ("expression", "Expression"),
        ("conjunction", "Conjunction"), ("interjection", "Interjection"),
        ("pronoun", "Pronoun"), ("prefix", "Prefix"), ("suffix", "Suffix"),
        ("counter", "Counter"), ("auxiliary", "Auxiliary"), ("copula", "Copula"),
        ("numeric", "Numeric"),
    ]
    for provider_label in provider_labels:
        normalized = provider_label.casefold()
        category = next((name for token, name in rules if token in normalized), "Other")
        if category not in categories:
            categories.append(category)
    return categories


def normalize_form_labels(provider_labels: list[str]) -> list[str]:
    labels: list[str] = []
    rules = {
        "rarely used kanji form": "Rare",
        "search-only kanji form": "Search only",
        "search-only kana form": "Search only",
        "out-dated or obsolete kana usage": "Obsolete",
        "out-dated or obsolete kanji usage": "Obsolete",
        "irregular kana usage": "Irregular kana",
        "irregular kanji usage": "Irregular kanji",
        "irregular okurigana usage": "Irregular okurigana",
    }
    for provider_label in provider_labels:
        if normalized := rules.get(provider_label.casefold()):
            if normalized not in labels:
                labels.append(normalized)
    return labels


def normalize_usage_notes(provider_labels: list[str]) -> list[str]:
    notes: list[str] = []
    rules = {
        "word usually written using kana alone": "Usually written in kana",
        "archaic": "Archaic",
        "obsolete term": "Obsolete",
        "honorific or respectful (sonkeigo) language": "Honorific",
        "humble (kenjougo) language": "Humble",
        "colloquialism": "Colloquial",
    }
    for provider_label in provider_labels:
        if normalized := rules.get(provider_label.casefold()):
            if normalized not in notes:
                notes.append(normalized)
    return notes


def normalized_cross_reference(value: str) -> dict[str, object] | None:
    """Preserve JMdict's form, optional reading, and optional target-sense qualifier."""
    parts = [part.strip() for part in value.split("・") if part.strip()]
    if not parts:
        return None
    sense = int(parts.pop()) if parts[-1].isdigit() else None
    return {
        "form": parts[0],
        "reading": parts[1] if len(parts) > 1 else None,
        "sense": sense,
        "sourceValue": value,
    }


def language_reference_id(source_identity: str, source_record_id: str) -> bytes:
    """Return a stable app-owned identity without exposing a provider's primary key."""
    return hashlib.sha256(f"{source_identity}\0{source_record_id}".encode()).digest()[:16]


def word_note_identity(record: dict[str, object]) -> str:
    """Hash an app-owned semantic lexical signature, never provider coordinates."""
    signature = {
        "headword": normalized_text(str(record["headword"])),
        "reading": normalized_text(str(record["reading"])),
        "writtenForms": record["written_forms"],
        "readingForms": record["reading_forms"],
        "senses": record["senses"],
        "partsOfSpeech": record["parts_of_speech"],
    }
    payload = json.dumps(signature, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"wn1:{hashlib.sha256(payload.encode()).hexdigest()}"


def romanize_kana(value: str) -> str:
    hiragana = "".join(
        chr(ord(character) - 0x60) if "ァ" <= character <= "ヶ" else character
        for character in unicodedata.normalize("NFKC", value)
    )
    output: list[str] = []
    index = 0
    geminate = False
    while index < len(hiragana):
        character = hiragana[index]
        if character == "っ":
            geminate = True
            index += 1
            continue
        if character == "ー":
            if output:
                vowel = next((letter for letter in reversed(output[-1]) if letter in "aeiou"), "")
                output.append(vowel)
            index += 1
            continue
        pair = hiragana[index:index + 2]
        syllable = KANA_ROMAJI.get(pair)
        if syllable:
            index += 2
        else:
            syllable = KANA_ROMAJI.get(character)
            index += 1
        if not syllable:
            if character in "・ -'":
                output.append("-")
            continue
        if geminate and syllable[0] not in "aeioun":
            output.append(syllable[0])
        output.append(syllable)
        geminate = False
    return "".join(output).strip("-")


def text_values(parent: ET.Element, path: str) -> list[str]:
    return [text for node in parent.findall(path) if (text := (node.text or "").strip())]


def choose_primary(elements: list[ET.Element], form_tag: str) -> tuple[str, bool]:
    if not elements:
        return "", False
    prioritized = [element for element in elements if element.findall("ke_pri") or element.findall("re_pri")]
    selected = prioritized[0] if prioritized else elements[0]
    return (selected.findtext(form_tag) or "").strip(), bool(prioritized)


def priority_score(elements: list[ET.Element]) -> int:
    score = 0
    for element in elements:
        for priority in text_values(element, "ke_pri") + text_values(element, "re_pri"):
            if priority == "spec1":
                score = max(score, 100)
            elif priority == "ichi1":
                score = max(score, 95)
            elif priority == "news1":
                score = max(score, 90)
            elif priority in {"gai1", "spec2"}:
                score = max(score, 85)
            elif priority in {"ichi2", "news2"}:
                score = max(score, 75)
            elif priority.startswith("nf") and priority[2:].isdigit():
                score = max(score, 70 - int(priority[2:]))
    return score


def normalized_priority_profile(provider_tags: list[str]) -> tuple[int, int, int | None]:
    primary_mask = 0
    secondary_mask = 0
    news_frequency_band: int | None = None
    for tag in provider_tags:
        if tag in PRIORITY_PRIMARY_BITS:
            primary_mask |= PRIORITY_PRIMARY_BITS[tag]
        elif tag in PRIORITY_SECONDARY_BITS:
            secondary_mask |= PRIORITY_SECONDARY_BITS[tag]
        elif re.fullmatch(r"nf\d\d", tag):
            band = int(tag[2:])
            if not 1 <= band <= 48:
                raise ValueError(f"out-of-range JMdict news-frequency band: {tag}")
            news_frequency_band = min(news_frequency_band or band, band)
        else:
            raise ValueError(f"unknown JMdict priority marker: {tag}")
    return primary_mask, secondary_mask, news_frequency_band


def semantic_fingerprint(record: dict[str, object]) -> bytes:
    payload = json.dumps(
        {
            "headword": record["headword"],
            "reading": record["reading"],
            "meanings": record["meanings"],
            "partsOfSpeech": record["parts_of_speech"],
            "writtenForms": record["written_forms"],
            "readingForms": record["reading_forms"],
            "senses": record["canonical_senses"],
            "glossAtoms": record["gloss_atoms"],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).digest()


def create_schema(database: sqlite3.Connection) -> None:
    database.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE entries (
          id BLOB PRIMARY KEY,
          source_identity TEXT NOT NULL,
          source_record_id INTEGER NOT NULL,
          note_identity TEXT NOT NULL,
          headword TEXT NOT NULL,
          reading TEXT NOT NULL,
          summary TEXT NOT NULL,
          meanings_json TEXT NOT NULL,
          parts_of_speech_json TEXT NOT NULL,
          written_forms_json TEXT NOT NULL,
          reading_forms_json TEXT NOT NULL,
          senses_json TEXT NOT NULL,
          cross_references_json TEXT NOT NULL,
          relationships_json TEXT NOT NULL,
          pitch_accent_json TEXT,
          gloss_search TEXT NOT NULL,
          is_common INTEGER NOT NULL,
          rank_score INTEGER NOT NULL,
          semantic_fingerprint BLOB NOT NULL
        );

        CREATE TABLE forms (
          entry_id BLOB NOT NULL,
          form TEXT NOT NULL,
          kind INTEGER NOT NULL,
          FOREIGN KEY(entry_id) REFERENCES entries(id)
        );

        CREATE INDEX forms_form_index ON forms(form, entry_id);
        CREATE UNIQUE INDEX entries_source_provenance_index ON entries(source_identity, source_record_id);
        CREATE INDEX entries_common_index ON entries(is_common DESC, id);

        CREATE TABLE form_priority_profiles (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          form TEXT NOT NULL,
          kind INTEGER NOT NULL,
          primary_mask INTEGER NOT NULL,
          secondary_mask INTEGER NOT NULL,
          news_frequency_band INTEGER,
          PRIMARY KEY(entry_id, form, kind)
        ) WITHOUT ROWID;

        CREATE TABLE canonical_senses (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          parts_of_speech_json TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order)
        ) WITHOUT ROWID;

        CREATE TABLE sense_form_restrictions (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          kind INTEGER NOT NULL,
          form TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order, kind, form)
        ) WITHOUT ROWID;

        CREATE TABLE gloss_atoms (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          gloss_order INTEGER NOT NULL,
          text TEXT NOT NULL,
          normalized_text TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order, gloss_order)
        ) WITHOUT ROWID;
        CREATE TABLE reading_form_restrictions (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          reading TEXT NOT NULL,
          written_form TEXT NOT NULL,
          PRIMARY KEY(entry_id, reading, written_form)
        ) WITHOUT ROWID;

        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);

        CREATE TABLE example_sentences (
          id BLOB PRIMARY KEY,
          japanese TEXT NOT NULL,
          english TEXT NOT NULL
        );

        CREATE TABLE example_sentence_provenance (
          pair_id BLOB NOT NULL REFERENCES example_sentences(id),
          source_identity TEXT NOT NULL,
          source_japanese_record_id INTEGER NOT NULL,
          source_english_record_id INTEGER NOT NULL,
          PRIMARY KEY(
            pair_id, source_identity, source_japanese_record_id, source_english_record_id
          )
        ) WITHOUT ROWID;
        """
    )


def import_snapshot(
    source: Path,
    output: Path,
    source_metadata: dict[str, object],
    unidic_source: Path,
    unidic_metadata: dict[str, object],
    tatoeba_japanese_source: Path,
    tatoeba_english_source: Path,
    tatoeba_links_source: Path,
    tatoeba_metadata: dict[str, object],
    relationship_source: Path,
    relationship_metadata: dict[str, object],
) -> dict[str, object]:
    if output.exists():
        output.unlink()

    database = sqlite3.connect(output)
    create_schema(database)

    retained = 0
    rejected = 0
    form_count = 0
    priority_profile_count = 0
    canonical_sense_count = 0
    gloss_atom_count = 0
    sense_restriction_count = 0
    reading_restriction_count = 0
    relationship_count = 0
    retained_source_ids = hashlib.sha256()
    entry_records: list[dict[str, object]] = []
    form_to_entry_ids: dict[str, list[bytes]] = {}
    lexical_payload_by_fingerprint: dict[bytes, str] = {}
    try:
        with gzip.open(source, "rb") as xml_source:
            for _, entry in ET.iterparse(xml_source, events=("end",)):
                if entry.tag != "entry":
                    continue

                source_record_id_text = (entry.findtext("ent_seq") or "").strip()
                readings = entry.findall("r_ele")
                written_forms = entry.findall("k_ele")
                senses = entry.findall("sense")
                sense_glosses = [
                    [
                        (gloss.text or "").strip()
                        for gloss in sense.findall("gloss")
                        if (gloss.text or "").strip()
                        and gloss.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", "eng") == "eng"
                    ]
                    for sense in senses
                ]
                meaning_groups = [", ".join(group) for group in sense_glosses if group]
                glosses = [gloss for group in sense_glosses for gloss in group]

                if not source_record_id_text or not readings or not glosses:
                    rejected += 1
                    entry.clear()
                    continue

                source_record_id = int(source_record_id_text)
                primary_written, written_common = choose_primary(written_forms, "keb")
                primary_reading, reading_common = choose_primary(readings, "reb")
                headword = primary_written or primary_reading
                parts_of_speech = normalize_parts_of_speech(
                    list(dict.fromkeys(text_values(entry, "sense/pos")))
                )
                entry_id = language_reference_id("edrdg.jmdict", source_record_id_text)
                written_values = text_values(entry, "k_ele/keb")
                reading_values = text_values(entry, "r_ele/reb")
                kana_preferred = any(
                    "word usually written using kana alone" in label.casefold()
                    for label in text_values(entry, "sense/misc")
                )
                primary_written_labels = next(
                    (
                        normalize_form_labels(text_values(element, "ke_inf"))
                        for element in written_forms
                        if (element.findtext("keb") or "").strip() == primary_written
                    ),
                    [],
                )
                if "Search only" in primary_written_labels or (
                    kana_preferred and "Rare" in primary_written_labels
                ):
                    headword = primary_reading
                if headword != primary_reading:
                    compatible_readings = [
                        element
                        for element in readings
                        if not text_values(element, "re_restr")
                        or headword in text_values(element, "re_restr")
                    ]
                    if not compatible_readings:
                        raise ValueError("displayed written form has no applicable reading")
                    primary_reading, reading_common = choose_primary(compatible_readings, "reb")
                display_common = reading_common if headword == primary_reading else written_common
                normalized_written_forms = [
                    {
                        "value": (element.findtext("keb") or "").strip(),
                        "kind": "written",
                        "labels": normalize_form_labels(text_values(element, "ke_inf")),
                    }
                    for element in written_forms
                    if (element.findtext("keb") or "").strip()
                ]
                normalized_reading_forms = [
                    {
                        "value": (element.findtext("reb") or "").strip(),
                        "kind": "reading",
                        "labels": normalize_form_labels(text_values(element, "re_inf")),
                    }
                    for element in readings
                    if (element.findtext("reb") or "").strip()
                ]
                normalized_senses = []
                canonical_senses: list[dict[str, object]] = []
                gloss_atoms: list[dict[str, object]] = []
                cross_references: list[dict[str, object]] = []
                for sense_order, (sense, meaning_group) in enumerate(zip(senses, sense_glosses)):
                    sense_parts_of_speech = normalize_parts_of_speech(text_values(sense, "pos"))
                    restricted_written_forms = [
                        normalized_text(value) for value in text_values(sense, "stagk")
                    ]
                    restricted_reading_forms = [
                        normalized_text(value) for value in text_values(sense, "stagr")
                    ]
                    if not set(restricted_written_forms) <= {
                        normalized_text(value) for value in written_values
                    }:
                        raise ValueError("sense written-form restriction is not an entry form")
                    if not set(restricted_reading_forms) <= {
                        normalized_text(value) for value in reading_values
                    }:
                        raise ValueError("sense reading-form restriction is not an entry form")
                    canonical_senses.append(
                        {
                            "senseOrder": sense_order,
                            "partsOfSpeech": sense_parts_of_speech,
                            "restrictedWrittenForms": restricted_written_forms,
                            "restrictedReadingForms": restricted_reading_forms,
                        }
                    )
                    for gloss_order, gloss in enumerate(meaning_group):
                        gloss_atoms.append(
                            {"senseOrder": sense_order, "glossOrder": gloss_order, "text": gloss}
                        )
                    if not meaning_group:
                        continue
                    notes = normalize_usage_notes(text_values(sense, "misc"))
                    notes.extend(note for note in text_values(sense, "s_inf") if note not in notes)
                    normalized_senses.append(
                        {
                            "meaning": ", ".join(meaning_group),
                            "notes": notes,
                            "partsOfSpeech": sense_parts_of_speech,
                        }
                    )
                    for reference in text_values(sense, "xref"):
                        parsed_reference = normalized_cross_reference(reference)
                        if parsed_reference and parsed_reference not in cross_references:
                            cross_references.append(parsed_reference)
                form_records = list(
                    dict.fromkeys(
                        [(normalized_text(value), FORM_KIND_WRITTEN) for value in written_values]
                        + [(normalized_text(value), FORM_KIND_READING) for value in reading_values]
                        + [
                            (romanize_kana(value), FORM_KIND_ROMAJI)
                            for value in reading_values if romanize_kana(value)
                        ]
                    )
                )

                priority_records = []
                for element, form_tag, priority_tag, kind in (
                    *((element, "keb", "ke_pri", FORM_KIND_WRITTEN) for element in written_forms),
                    *((element, "reb", "re_pri", FORM_KIND_READING) for element in readings),
                ):
                    form = normalized_text((element.findtext(form_tag) or "").strip())
                    tags = text_values(element, priority_tag)
                    if not form or not tags:
                        continue
                    primary_mask, secondary_mask, band = normalized_priority_profile(tags)
                    priority_records.append((entry_id, form, kind, primary_mask, secondary_mask, band))

                reading_restrictions = [
                    (entry_id, normalized_text((element.findtext("reb") or "").strip()), normalized_text(value))
                    for element in readings
                    for value in text_values(element, "re_restr")
                ]
                fingerprint_record = {
                    "headword": headword,
                    "reading": primary_reading,
                    "meanings": meaning_groups,
                    "parts_of_speech": parts_of_speech,
                    "written_forms": normalized_written_forms,
                    "reading_forms": normalized_reading_forms,
                    "canonical_senses": canonical_senses,
                    "gloss_atoms": gloss_atoms,
                }
                fingerprint = semantic_fingerprint(fingerprint_record)
                canonical_payload = json.dumps(
                    fingerprint_record,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                prior_payload = lexical_payload_by_fingerprint.setdefault(fingerprint, canonical_payload)
                if prior_payload != canonical_payload:
                    raise ValueError("semantic fingerprint collision between unequal lexical payloads")

                database.execute(
                    "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        entry_id,
                        "edrdg.jmdict",
                        source_record_id,
                        "",
                        headword,
                        primary_reading,
                        meaning_groups[0],
                        json.dumps(meaning_groups, ensure_ascii=False, separators=(",", ":")),
                        json.dumps(parts_of_speech, ensure_ascii=False, separators=(",", ":")),
                        json.dumps(normalized_written_forms, ensure_ascii=False, separators=(",", ":")),
                        json.dumps(normalized_reading_forms, ensure_ascii=False, separators=(",", ":")),
                        json.dumps(normalized_senses, ensure_ascii=False, separators=(",", ":")),
                        json.dumps(cross_references, ensure_ascii=False, separators=(",", ":")),
                        "[]",
                        None,
                        normalized_text(" | ".join(glosses)),
                        int(display_common),
                        priority_score(written_forms + readings),
                        fingerprint,
                    ),
                )
                database.executemany(
                    "INSERT INTO forms(entry_id, form, kind) VALUES (?, ?, ?)",
                    [
                        (entry_id, form, kind)
                        for form, kind in form_records
                    ],
                )
                database.executemany(
                    "INSERT INTO form_priority_profiles VALUES (?, ?, ?, ?, ?, ?)",
                    priority_records,
                )
                database.executemany(
                    "INSERT INTO canonical_senses VALUES (?, ?, ?)",
                    [
                        (
                            entry_id,
                            sense["senseOrder"],
                            json.dumps(sense["partsOfSpeech"], ensure_ascii=False, separators=(",", ":")),
                        )
                        for sense in canonical_senses
                    ],
                )
                database.executemany(
                    "INSERT INTO sense_form_restrictions VALUES (?, ?, ?, ?)",
                    [
                        (entry_id, sense["senseOrder"], kind, form)
                        for sense in canonical_senses
                        for kind, key in (
                            (FORM_KIND_WRITTEN, "restrictedWrittenForms"),
                            (FORM_KIND_READING, "restrictedReadingForms"),
                        )
                        for form in sense[key]
                    ],
                )
                database.executemany(
                    "INSERT INTO gloss_atoms VALUES (?, ?, ?, ?, ?)",
                    [
                        (
                            entry_id,
                            atom["senseOrder"],
                            atom["glossOrder"],
                            atom["text"],
                            normalized_text(str(atom["text"])),
                        )
                        for atom in gloss_atoms
                    ],
                )
                database.executemany(
                    "INSERT INTO reading_form_restrictions VALUES (?, ?, ?)",
                    reading_restrictions,
                )
                for form, _ in form_records:
                    form_to_entry_ids.setdefault(form, []).append(entry_id)
                entry_records.append(
                    {
                        "id": entry_id,
                        "source_record_id": source_record_id_text,
                        "headword": headword,
                        "reading": primary_reading,
                        "summary": meaning_groups[0],
                        "senses": normalized_senses,
                        "parts_of_speech": parts_of_speech,
                        "written_forms": normalized_written_forms,
                        "reading_forms": normalized_reading_forms,
                        "cross_references": cross_references,
                        "is_common": display_common,
                        "written_values": written_values,
                        "reading_values": reading_values,
                    }
                )
                retained += 1
                retained_source_ids.update(f"{source_record_id}\n".encode())
                form_count += len(form_records)
                priority_profile_count += len(priority_records)
                canonical_sense_count += len(canonical_senses)
                gloss_atom_count += len(gloss_atoms)
                sense_restriction_count += sum(
                    len(sense["restrictedWrittenForms"]) + len(sense["restrictedReadingForms"])
                    for sense in canonical_senses
                )
                reading_restriction_count += len(reading_restrictions)
                if retained % 5_000 == 0:
                    database.commit()
                entry.clear()

        actual_counts = {
            "form_priority_profiles": priority_profile_count,
            "canonical_senses": canonical_sense_count,
            "gloss_atoms": gloss_atom_count,
            "sense_form_restrictions": sense_restriction_count,
            "reading_form_restrictions": reading_restriction_count,
        }
        expected_counts = {
            "form_priority_profiles": EXPECTED_PRIORITY_PROFILE_COUNT,
            "canonical_senses": EXPECTED_SENSE_COUNT,
            "gloss_atoms": EXPECTED_GLOSS_ATOM_COUNT,
            "sense_form_restrictions": EXPECTED_SENSE_RESTRICTION_COUNT,
            "reading_form_restrictions": EXPECTED_READING_RESTRICTION_COUNT,
        }
        if actual_counts != expected_counts:
            raise ValueError(f"dictionary ranking evidence count mismatch: {actual_counts}")

        note_identity_groups: dict[str, list[dict[str, object]]] = {}
        for record in entry_records:
            note_identity_groups.setdefault(word_note_identity(record), []).append(record)
        for base_identity, records in note_identity_groups.items():
            ordered = sorted(records, key=lambda candidate: int(str(candidate["source_record_id"])))
            for index, record in enumerate(ordered, start=1):
                note_identity = base_identity if len(ordered) == 1 else f"{base_identity}:{index}"
                database.execute(
                    "UPDATE entries SET note_identity = ? WHERE id = ?",
                    (note_identity, record["id"]),
                )
        database.execute("CREATE UNIQUE INDEX entries_note_identity_index ON entries(note_identity)")
        note_identity_duplicate_groups = sum(
            1 for records in note_identity_groups.values() if len(records) > 1
        )
        note_identity_disambiguated_entries = sum(
            len(records) for records in note_identity_groups.values() if len(records) > 1
        )

        pitch_entry_count = apply_unidic_pitch(
            database, entry_records, unidic_source, unidic_metadata, normalized_text
        )
        example_sentence_count = import_tatoeba_examples(
            database,
            tatoeba_japanese_source,
            tatoeba_english_source,
            tatoeba_links_source,
        )
        retrieval_metadata = build_indexes(database)

        records_by_id = {record["id"]: record for record in entry_records}
        records_by_source_id = {str(record["source_record_id"]): record for record in entry_records}
        editorial_by_source: dict[str, list[dict[str, str]]] = {}
        for fact in relationship_metadata["facts"]:
            editorial_by_source.setdefault(str(fact["sourceRecordID"]), []).append(fact)

        for record in entry_records:
            related: list[dict[str, str]] = []
            seen_ids: set[bytes] = set()

            for reference in record["cross_references"]:
                target_ids = form_to_entry_ids.get(normalized_text(str(reference["form"])), [])
                supplied_reading = reference["reading"]
                target = next(
                    (
                        records_by_id[target_id]
                        for target_id in target_ids
                        if target_id != record["id"]
                        and (
                            supplied_reading is None
                            or normalized_text(str(supplied_reading))
                            in {
                                normalized_text(str(reading))
                                for reading in records_by_id[target_id]["reading_values"]
                            }
                        )
                    ),
                    None,
                )
                if target:
                    target_sense = reference["sense"]
                    target_senses = target["senses"]
                    target_summary = (
                        str(target_senses[target_sense - 1]["meaning"])
                        if target_sense is not None and 0 < target_sense <= len(target_senses)
                        else str(target["summary"])
                    )
                    seen_ids.add(target["id"])
                    related.append(
                        {
                            "query": str(target["headword"]),
                            "headword": str(target["headword"]),
                            "reading": str(supplied_reading or target["reading"]),
                            "summary": target_summary,
                            "relation": "See also",
                            "sourceIdentity": "edrdg.jmdict",
                            "sourceReference": str(reference["sourceValue"]),
                            "targetSense": target_sense,
                            "targetID": target["id"].hex(),
                        }
                    )

            editorial_facts = editorial_by_source.get(str(record["source_record_id"]), [])
            for fact in editorial_facts:
                target = records_by_source_id.get(str(fact["targetRecordID"]))
                if not target or target["id"] in seen_ids:
                    continue
                seen_ids.add(target["id"])
                related.append(
                    {
                        "query": str(target["headword"]),
                        "headword": str(target["headword"]),
                        "reading": str(target["reading"]),
                        "summary": str(target["summary"]),
                        "relation": str(fact["relation"]),
                        "sourceIdentity": str(relationship_metadata["identity"]),
                        "targetID": target["id"].hex(),
                    }
                )

            related = related[:6]
            relationship_count += len(related)
            database.execute(
                "UPDATE entries SET relationships_json = ? WHERE id = ?",
                (json.dumps(related, ensure_ascii=False, separators=(",", ":")), record["id"]),
            )

        dictionary_ranking_mapping = dictionary_ranking_mapping_sha256(database)
        transform = {
            "transform": "jmdict-to-zenbu-language-reference-data-v2",
            "source_resource_id": source_metadata["resource_id"],
            "source_sha256": source_metadata["sha256"],
            "source_entries_retained": retained,
            "source_entries_rejected": rejected,
            "source_entries_merged": 0,
            "prior_snapshot_database_sha256": None,
            "row_delta": {
                "added": retained,
                "changed": 0,
                "deleted": 0,
                "added_source_record_ids_sha256": retained_source_ids.hexdigest(),
            },
            "normalized_forms": form_count,
            "dictionary_ranking_policy": "dictionary-best-match-v1",
            "dictionary_ranking_schema_version": "zenbu.dictionary-ranking.v1",
            "dictionary_ranking_evidence": actual_counts,
            "dictionary_ranking_mapping_sha256": dictionary_ranking_mapping,
            "normalized_relationships": relationship_count,
            "note_identity_duplicate_groups": note_identity_duplicate_groups,
            "note_identity_disambiguated_entries": note_identity_disambiguated_entries,
            "pitch_entries": pitch_entry_count,
            "example_sentences": example_sentence_count,
            "example_sentence_pair_id_scheme": EXAMPLE_PAIR_ID_SCHEME,
            "example_sentence_retrieval": retrieval_metadata,
            "rejection_reasons": {"missing_ent_seq_reading_or_english_gloss": rejected},
            "retained_fields": [
                "ent_seq",
                "k_ele/keb",
                "k_ele/ke_pri",
                "r_ele/reb",
                "r_ele/re_pri",
                "sense/pos",
                "sense/stagk",
                "sense/stagr",
                "r_ele/re_restr",
                "k_ele/ke_inf",
                "r_ele/re_inf",
                "sense/misc",
                "sense/s_inf",
                "sense/xref",
                "sense/gloss[@xml:lang='eng']",
            ],
            "documented_transforms": [
                "Unicode NFKC and case-fold searchable forms",
                "deterministic app-owned Hepburn-style romaji reading index",
                "stable first-priority written form and reading display selection",
                "English-only gloss retention",
                "same-sense English gloss grouping with source sense order retained",
                "individual English gloss atoms retained with canonical sense and gloss order",
                "sense POS and displayed written/reading applicability retained as typed app-owned evidence",
                "complete form-scoped priority profiles normalized to app-owned masks and optional news-frequency band",
                "provenance-free semantic fingerprint includes all display forms, meanings, senses, applicability, and gloss atom boundaries",
                "provider form and usage labels normalized to an app-owned presentation vocabulary",
                "cross-references resolved to app-owned linked entries",
                "JMdict cross-reference form, reading, and target-sense qualifiers preserved; supplied readings require an exact target reading",
                "human-reviewed app-owned word relationships resolved from a versioned editorial fact source",
                "stable 128-bit app-owned Language Reference ID derived from SHA-256 of source identity and source record ID",
                "opaque app-owned Example Sentence pair ID derived only from the NFC normalized Japanese-English semantic pair",
                "Tatoeba Japanese and English record IDs retained only in the Example Sentence provenance table",
                "collision-free durable-note identity derived from an app-owned semantic lexical signature with deterministic exact-duplicate disambiguation",
                "provider part-of-speech taxonomy normalized to app-owned classification labels",
                "app-owned commonness marker derived from priority on the selected display form",
                "deterministic app-owned rank score derived from documented JMdict priority tags",
                "UniDic aType normalized to deterministic downstep and pronunciation-mora-count facts by exact base-form and pronunciation-or-lexical-reading match",
                "one deterministic lowest-ID English translation retained per linked Japanese Tatoeba sentence",
            ],
            "pitch_source_resource_id": unidic_metadata["resource_id"],
            "pitch_source_sha256": unidic_metadata["sha256"],
            "example_source_resource_id": tatoeba_metadata["resource_id"],
            "example_source_sha256": tatoeba_metadata["aggregate_sha256"],
            "relationship_source_resource_id": relationship_metadata["resource_id"],
            "relationship_source_sha256": file_sha256(relationship_source),
            "import_tool_sha256": file_sha256(Path(__file__)),
            "dictionary_ranking_adapter_sha256": file_sha256(
                Path(__file__).with_name("dictionary_ranking_adapter.py")
            ),
            "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
            "unidic_adapter_sha256": file_sha256(Path(__file__).with_name("unidic_adapter.py")),
            "tatoeba_adapter_sha256": file_sha256(Path(__file__).with_name("tatoeba_adapter.py")),
        }
        database.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [(key, json.dumps(value, ensure_ascii=False, separators=(",", ":"))) for key, value in transform.items()],
        )
        database.commit()
        database.execute("VACUUM")
        database.commit()
    finally:
        database.close()

    transform["database_sha256"] = file_sha256(output)
    transform["database_bytes"] = output.stat().st_size
    return transform


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("source_metadata", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--unidic-source", type=Path, required=True)
    parser.add_argument("--unidic-metadata", type=Path, required=True)
    parser.add_argument("--tatoeba-japanese-source", type=Path, required=True)
    parser.add_argument("--tatoeba-english-source", type=Path, required=True)
    parser.add_argument("--tatoeba-links-source", type=Path, required=True)
    parser.add_argument("--tatoeba-metadata", type=Path, required=True)
    parser.add_argument("--relationship-source", type=Path, required=True)
    arguments = parser.parse_args()

    source_metadata = json.loads(arguments.source_metadata.read_text())
    actual_sha = file_sha256(arguments.source)
    if actual_sha != source_metadata["sha256"]:
        raise SystemExit(f"source checksum mismatch: expected {source_metadata['sha256']}, got {actual_sha}")
    unidic_metadata = json.loads(arguments.unidic_metadata.read_text())
    actual_unidic_sha = file_sha256(arguments.unidic_source)
    if actual_unidic_sha != unidic_metadata["sha256"]:
        raise SystemExit(
            f"UniDic source checksum mismatch: expected {unidic_metadata['sha256']}, got {actual_unidic_sha}"
        )
    tatoeba_metadata = json.loads(arguments.tatoeba_metadata.read_text())
    relationship_metadata = json.loads(arguments.relationship_source.read_text())
    tatoeba_paths = {
        "japanese_sentences": arguments.tatoeba_japanese_source,
        "english_sentences": arguments.tatoeba_english_source,
        "japanese_english_links": arguments.tatoeba_links_source,
    }
    for pinned in tatoeba_metadata["sources"]:
        actual = file_sha256(tatoeba_paths[pinned["role"]])
        if actual != pinned["sha256"]:
            raise SystemExit(
                f"Tatoeba {pinned['role']} checksum mismatch: expected {pinned['sha256']}, got {actual}"
            )

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    transform = import_snapshot(
        arguments.source,
        arguments.output,
        source_metadata,
        arguments.unidic_source,
        unidic_metadata,
        arguments.tatoeba_japanese_source,
        arguments.tatoeba_english_source,
        arguments.tatoeba_links_source,
        tatoeba_metadata,
        arguments.relationship_source,
        relationship_metadata,
    )
    arguments.manifest.write_text(
        json.dumps({"source": source_metadata, "transform": transform}, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(transform, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
