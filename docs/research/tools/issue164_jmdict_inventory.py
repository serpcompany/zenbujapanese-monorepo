#!/usr/bin/env python3
"""Inventory pinned JMdict ranking inputs and measure the proposed table budget."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sqlite3
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path


PRIMARY_MASK = {"spec1": 1, "ichi1": 2, "news1": 4, "gai1": 8}
SECONDARY_MASK = {"spec2": 1, "ichi2": 2, "news2": 4, "gai2": 8}
KNOWN_MARKERS = set(PRIMARY_MASK) | set(SECONDARY_MASK) | {
    f"nf{band:02d}" for band in range(1, 49)
}
PINNED_JMDICT_PATH = (
    Path(__file__).resolve().parents[3]
    / "apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.gz"
)
PINNED_JMDICT_SHA256 = (
    "54a6ecce385de30776e842b18ca62da7a60dfd923dc5b1f8101ce37f528e1d5e"
)


def entry_id(source_record_id: str) -> bytes:
    payload = f"edrdg.jmdict\0{source_record_id}".encode()
    return hashlib.sha256(payload).digest()[:16]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def marker_profile(markers: list[str]) -> tuple[int, int, int | None]:
    unknown = set(markers) - KNOWN_MARKERS
    if unknown:
        raise RuntimeError(f"unknown priority marker count: {len(unknown)}")
    bands = [int(marker[2:]) for marker in markers if marker.startswith("nf")]
    return (
        sum(PRIMARY_MASK.get(marker, 0) for marker in markers),
        sum(SECONDARY_MASK.get(marker, 0) for marker in markers),
        min(bands) if bands else None,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jmdict", default=PINNED_JMDICT_PATH, type=Path)
    parser.add_argument("--baseline-bytes", required=True, type=int)
    arguments = parser.parse_args()
    actual_sha256 = file_sha256(arguments.jmdict)
    if actual_sha256 != PINNED_JMDICT_SHA256:
        raise SystemExit(
            "JMdict checksum mismatch: "
            f"expected {PINNED_JMDICT_SHA256}, got {actual_sha256}"
        )

    with tempfile.TemporaryDirectory(prefix="issue164-jmdict-inventory-") as directory:
        database_path = Path(directory) / "ranking-schema.sqlite3"
        database = sqlite3.connect(database_path)
        database.executescript(
            """
            PRAGMA page_size = 4096;
            CREATE TABLE form_priority_profiles(
              entry_id BLOB NOT NULL,
              form TEXT NOT NULL,
              kind INTEGER NOT NULL,
              primary_mask INTEGER NOT NULL,
              secondary_mask INTEGER NOT NULL,
              news_frequency_band INTEGER,
              PRIMARY KEY(entry_id, form, kind)
            ) WITHOUT ROWID;
            CREATE TABLE english_gloss_atoms(
              entry_id BLOB NOT NULL,
              sense_index INTEGER NOT NULL,
              gloss_index INTEGER NOT NULL,
              gloss TEXT NOT NULL,
              PRIMARY KEY(entry_id, sense_index, gloss_index)
            ) WITHOUT ROWID;
            CREATE TABLE english_sense_evidence(
              entry_id BLOB NOT NULL,
              sense_index INTEGER NOT NULL,
              parts_of_speech_json TEXT NOT NULL,
              PRIMARY KEY(entry_id, sense_index)
            ) WITHOUT ROWID;
            CREATE TABLE sense_form_restrictions(
              entry_id BLOB NOT NULL,
              sense_index INTEGER NOT NULL,
              kind INTEGER NOT NULL,
              form TEXT NOT NULL,
              PRIMARY KEY(entry_id, sense_index, kind, form)
            ) WITHOUT ROWID;
            CREATE TABLE reading_restrictions(
              entry_id BLOB NOT NULL,
              reading_form TEXT NOT NULL,
              written_form TEXT NOT NULL,
              PRIMARY KEY(entry_id, reading_form, written_form)
            ) WITHOUT ROWID;
            """
        )

        entry_count = 0
        tagged_entries = 0
        tagged_forms = 0
        priority_facts = 0
        gloss_atoms = 0
        sense_count = 0
        part_of_speech_facts = 0
        restriction_facts = 0
        restricted_senses = 0
        reading_restrictions = 0
        with gzip.open(arguments.jmdict, "rb") as source:
            for _, entry in ET.iterparse(source, events=("end",)):
                if entry.tag != "entry":
                    continue
                entry_count += 1
                source_record_id = (entry.findtext("ent_seq") or "").strip()
                opaque_entry_id = entry_id(source_record_id)
                written_forms = {
                    normalized(node.findtext("keb") or "")
                    for node in entry.findall("k_ele")
                }
                reading_forms = {
                    normalized(node.findtext("reb") or "")
                    for node in entry.findall("r_ele")
                }
                entry_has_priority = False
                for kind, path, value_tag, priority_tag in (
                    (0, "k_ele", "keb", "ke_pri"),
                    (1, "r_ele", "reb", "re_pri"),
                ):
                    for form in entry.findall(path):
                        markers = [node.text or "" for node in form.findall(priority_tag)]
                        if not markers:
                            continue
                        primary, secondary, band = marker_profile(markers)
                        database.execute(
                            "INSERT INTO form_priority_profiles VALUES (?, ?, ?, ?, ?, ?)",
                            (
                                opaque_entry_id,
                                normalized(form.findtext(value_tag) or ""),
                                kind,
                                primary,
                                secondary,
                                band,
                            ),
                        )
                        entry_has_priority = True
                        tagged_forms += 1
                        priority_facts += len(markers)
                for reading in entry.findall("r_ele"):
                    reading_form = normalized(reading.findtext("reb") or "")
                    for restriction in reading.findall("re_restr"):
                        database.execute(
                            "INSERT INTO reading_restrictions VALUES (?, ?, ?)",
                            (
                                opaque_entry_id,
                                reading_form,
                                normalized(restriction.text or ""),
                            ),
                        )
                        reading_restrictions += 1
                tagged_entries += entry_has_priority
                for sense_index, sense in enumerate(entry.findall("sense")):
                    parts_of_speech = tuple(
                        node.text or "" for node in sense.findall("pos")
                    )
                    database.execute(
                        "INSERT INTO english_sense_evidence VALUES (?, ?, ?)",
                        (
                            opaque_entry_id,
                            sense_index,
                            json.dumps(
                                parts_of_speech,
                                ensure_ascii=False,
                                separators=(",", ":"),
                            ),
                        ),
                    )
                    sense_count += 1
                    part_of_speech_facts += len(parts_of_speech)
                    sense_restriction_count = 0
                    for kind, tag in ((0, "stagk"), (1, "stagr")):
                        for restriction in sense.findall(tag):
                            form = normalized(restriction.text or "")
                            valid_forms = written_forms if kind == 0 else reading_forms
                            if form not in valid_forms:
                                raise RuntimeError(
                                    "sense restriction does not reference an entry form"
                                )
                            database.execute(
                                "INSERT INTO sense_form_restrictions VALUES (?, ?, ?, ?)",
                                (
                                    opaque_entry_id,
                                    sense_index,
                                    kind,
                                    form,
                                ),
                            )
                            restriction_facts += 1
                            sense_restriction_count += 1
                    restricted_senses += sense_restriction_count > 0
                    gloss_index = 0
                    for gloss in sense.findall("gloss"):
                        language = gloss.attrib.get(
                            "{http://www.w3.org/XML/1998/namespace}lang", "eng"
                        )
                        if language != "eng":
                            continue
                        database.execute(
                            "INSERT INTO english_gloss_atoms VALUES (?, ?, ?, ?)",
                            (opaque_entry_id, sense_index, gloss_index, gloss.text or ""),
                        )
                        gloss_index += 1
                        gloss_atoms += 1
                if entry_count % 5_000 == 0:
                    database.commit()
                entry.clear()
        database.commit()
        database.execute("VACUUM")
        database.commit()
        page_size = database.execute("PRAGMA page_size").fetchone()[0]
        combined_bytes = os.path.getsize(database_path) - page_size
        table_bytes: dict[str, int] = {}
        tables = (
            "form_priority_profiles",
            "english_gloss_atoms",
            "english_sense_evidence",
            "sense_form_restrictions",
            "reading_restrictions",
        )
        for retained in tables:
            isolated_path = Path(directory) / f"{retained}.sqlite3"
            isolated = sqlite3.connect(isolated_path)
            database.backup(isolated)
            for removed in tables:
                if removed != retained:
                    isolated.execute(f"DROP TABLE {removed}")
            isolated.execute("VACUUM")
            isolated.close()
            table_bytes[retained] = os.path.getsize(isolated_path) - page_size
        database.close()

        print(
            json.dumps(
                {
                    "entryCount": entry_count,
                    "taggedEntryCount": tagged_entries,
                    "taggedFormCount": tagged_forms,
                    "priorityFactCount": priority_facts,
                    "englishGlossAtomCount": gloss_atoms,
                    "senseCount": sense_count,
                    "partOfSpeechFactCount": part_of_speech_facts,
                    "senseFormRestrictionFactCount": restriction_facts,
                    "restrictedSenseCount": restricted_senses,
                    "readingRestrictionCount": reading_restrictions,
                    "formPriorityProfileBytes": table_bytes["form_priority_profiles"],
                    "englishGlossAtomBytes": table_bytes["english_gloss_atoms"],
                    "englishSenseEvidenceBytes": table_bytes["english_sense_evidence"],
                    "senseFormRestrictionBytes": table_bytes["sense_form_restrictions"],
                    "readingRestrictionBytes": table_bytes["reading_restrictions"],
                    "combinedBytes": combined_bytes,
                    "baselineBytes": arguments.baseline_bytes,
                    "baselinePercent": round(
                        combined_bytes / arguments.baseline_bytes * 100, 2
                    ),
                },
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    main()
