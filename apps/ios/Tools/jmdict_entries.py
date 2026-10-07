from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from jmdict_labels import sense_labels
from jmdict_normalization import (
    FORM_KIND_READING,
    FORM_KIND_ROMAJI,
    FORM_KIND_WRITTEN,
    choose_primary,
    jmdict_entity_codes,
    language_reference_id,
    legacy_note_parts_of_speech,
    normalize_form_labels,
    normalize_parts_of_speech,
    normalize_usage_notes,
    normalized_cross_reference,
    normalized_priority_profile,
    normalized_text,
    priority_score,
    romanize_kana,
    semantic_fingerprint,
    text_values,
)

EXPECTED_PRIORITY_PROFILE_COUNT = 56_127
EXPECTED_GLOSS_ATOM_COUNT = 441_826
EXPECTED_SENSE_COUNT = 253_020
EXPECTED_SENSE_RESTRICTION_COUNT = 1_929
EXPECTED_READING_RESTRICTION_COUNT = 6_201


@dataclass
class ImportedEntries:
    records: list[dict[str, object]]
    form_to_entry_ids: dict[str, list[bytes]]
    retained: int
    rejected: int
    form_count: int
    retained_source_ids_sha256: str
    evidence_counts: dict[str, int]
    search_index: dict[str, object]


def import_entries(database: sqlite3.Connection, source: Path) -> ImportedEntries:
    retained = 0
    rejected = 0
    form_count = 0
    priority_profile_count = 0
    canonical_sense_count = 0
    gloss_atom_count = 0
    sense_restriction_count = 0
    reading_restriction_count = 0
    retained_source_ids = hashlib.sha256()
    entity_codes = jmdict_entity_codes(source)
    entry_records: list[dict[str, object]] = []
    form_to_entry_ids: dict[str, list[bytes]] = {}
    lexical_payload_by_fingerprint: dict[bytes, str] = {}
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
            entry_pos_labels = list(dict.fromkeys(text_values(entry, "sense/pos")))
            parts_of_speech = normalize_parts_of_speech(entry_pos_labels, entity_codes)
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
            note_senses = []
            canonical_senses: list[dict[str, object]] = []
            gloss_atoms: list[dict[str, object]] = []
            cross_references: list[dict[str, object]] = []
            for sense_order, (sense, meaning_group) in enumerate(zip(senses, sense_glosses)):
                sense_pos_labels = text_values(sense, "pos")
                sense_parts_of_speech = normalize_parts_of_speech(sense_pos_labels, entity_codes)
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
                        **sense_labels(sense, entity_codes),
                    }
                )
                note_senses.append(
                    {
                        "meaning": ", ".join(meaning_group),
                        "notes": notes,
                        "partsOfSpeech": legacy_note_parts_of_speech(sense_pos_labels),
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
                    "note_senses": note_senses,
                    "parts_of_speech": parts_of_speech,
                    "note_parts_of_speech": legacy_note_parts_of_speech(entry_pos_labels),
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

    database.executescript(
        """
            CREATE VIRTUAL TABLE dictionary_gloss_fts USING fts4(
              normalized_text,
              content='gloss_atoms',
              tokenize=porter
            );
            INSERT INTO dictionary_gloss_fts(docid, normalized_text)
            SELECT rowid, normalized_text FROM gloss_atoms ORDER BY rowid;

            CREATE VIRTUAL TABLE dictionary_form_fts USING fts4(
              form,
              content='forms',
              tokenize=simple
            );
            INSERT INTO dictionary_form_fts(docid, form)
            SELECT rowid, form FROM forms ORDER BY rowid;
            """
    )
    dictionary_search_index = {
        "schema": "zenbu.dictionary-search-index.v1",
        "technology": "sqlite-fts4",
        "gloss_rows": gloss_atom_count,
        "form_rows": form_count,
    }
    return ImportedEntries(
        records=entry_records,
        form_to_entry_ids=form_to_entry_ids,
        retained=retained,
        rejected=rejected,
        form_count=form_count,
        retained_source_ids_sha256=retained_source_ids.hexdigest(),
        evidence_counts=actual_counts,
        search_index=dictionary_search_index,
    )
