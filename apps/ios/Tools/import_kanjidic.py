#!/usr/bin/env python3

from __future__ import annotations

import gzip
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from import_jlpt_kanji_levels import jlpt_kanji_levels
from language_data_tools import built_artifact, file_sha256, run_import


def optional_int(parent: ET.Element, path: str) -> int | None:
    value = (parent.findtext(path) or "").strip()
    return int(value) if value else None


def normalized_readings(character: ET.Element) -> list[dict[str, str]]:
    readings: list[dict[str, str]] = []
    for node in character.findall("reading_meaning/rmgroup/reading"):
        source_kind = node.attrib.get("r_type")
        kind = {"ja_on": "on", "ja_kun": "kun"}.get(source_kind)
        value = (node.text or "").strip()
        if not kind or not value:
            continue
        readings.append({"value": value, "kind": kind})
    readings.extend(
        {"value": value, "kind": "name"}
        for node in character.findall("reading_meaning/nanori")
        if (value := (node.text or "").strip())
    )
    return readings


def english_meanings(character: ET.Element) -> list[str]:
    return [
        value
        for node in character.findall("reading_meaning/rmgroup/meaning")
        if node.attrib.get("m_lang", "en") == "en"
        and (value := (node.text or "").strip())
    ]


def import_snapshot(
    source: Path,
    source_manifest: dict[str, object],
    radical_artifact: Path,
    radical_manifest: dict[str, object],
    jlpt_kanji_record: Path,
    output: Path,
) -> dict[str, object]:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("Pinned KANJIDIC2 checksum mismatch")
    expected_radical_hash = radical_manifest["transform"]["artifact_sha256"]
    if file_sha256(radical_artifact) != expected_radical_hash:
        raise ValueError("Pinned radical artifact checksum mismatch")

    radical_data = json.loads(radical_artifact.read_text())
    waller_levels, waller_report = jlpt_kanji_levels(jlpt_kanji_record)
    components_by_character = {
        record["value"]: record["components"] for record in radical_data["characters"]
    }

    entries: list[dict[str, object]] = []
    header: dict[str, str] = {}
    with gzip.open(source, "rb") as stream:
        for _, element in ET.iterparse(stream, events=("end",)):
            if element.tag == "header":
                header = {
                    "fileVersion": (element.findtext("file_version") or "").strip(),
                    "databaseVersion": (element.findtext("database_version") or "").strip(),
                    "dateOfCreation": (element.findtext("date_of_creation") or "").strip(),
                }
                element.clear()
                continue
            if element.tag != "character":
                continue
            literal = (element.findtext("literal") or "").strip()
            stroke_counts = [
                int(value)
                for node in element.findall("misc/stroke_count")
                if (value := (node.text or "").strip())
            ]
            if not literal or not stroke_counts:
                element.clear()
                continue
            classical_radical = next(
                (
                    int(value)
                    for node in element.findall("radical/rad_value")
                    if node.attrib.get("rad_type") == "classical"
                    and (value := (node.text or "").strip())
                ),
                None,
            )
            entries.append(
                {
                    "character": literal,
                    "strokeCount": stroke_counts[0],
                    "commonMiscounts": stroke_counts[1:],
                    "grade": optional_int(element, "misc/grade"),
                    "jlpt": optional_int(element, "misc/jlpt"),
                    "wallerJlptLevel": waller_levels.get(literal),
                    "frequencyRank": optional_int(element, "misc/freq"),
                    "classicalRadicalNumber": classical_radical,
                    "meanings": english_meanings(element),
                    "readings": normalized_readings(element),
                    "components": components_by_character.get(literal, []),
                }
            )
            element.clear()

    entries.sort(key=lambda entry: str(entry["character"]))
    unmatched = sorted(set(waller_levels) - {str(entry["character"]) for entry in entries})
    if unmatched:
        raise ValueError(f"Waller's JLPT kanji lists name kanji KANJIDIC2 lacks: {unmatched}")
    artifact = {
        "snapshot": header.get("dateOfCreation", source_manifest["snapshot"]),
        "metadataSourceIdentity": "edrdg.kanjidic2",
        "componentSourceIdentity": radical_data["sourceIdentity"],
        "entries": entries,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")) + "\n")
    return {
        "identity": "edrdg-kanjidic2-radicals-to-zenbu-kanji-reference-data-v1",
        "header": header,
        "entry_count": len(entries),
        "entries_with_meanings": sum(bool(entry["meanings"]) for entry in entries),
        "entries_with_readings": sum(bool(entry["readings"]) for entry in entries),
        "entries_with_components": sum(bool(entry["components"]) for entry in entries),
        "jlpt_kanji_levels": waller_report,
        "retained_fields": [
            "literal",
            "radical/rad_value[@rad_type='classical']",
            "misc/grade",
            "misc/stroke_count",
            "misc/freq",
            "misc/jlpt",
            "reading_meaning/rmgroup/reading[@r_type='ja_on' or @r_type='ja_kun']",
            "reading_meaning/rmgroup/meaning[not(@m_lang) or @m_lang='en']",
            "reading_meaning/nanori",
        ],
        "excluded_fields": [
            "reading status attributes",
            "query_code (including commercial-incompatible SKIP fields)",
            "non-English meanings",
            "non-Japanese readings",
            "dictionary-reference identifiers",
        ],
        "metadata_source_sha256": file_sha256(source),
        "jlpt_kanji_importer_sha256": waller_report["importer_sha256"],
        "component_artifact_sha256": file_sha256(radical_artifact),
        **built_artifact(Path(__file__), output),
    }


def main() -> None:
    run_import(
        lambda arguments, source_manifest: import_snapshot(
            arguments.source,
            source_manifest,
            arguments.radical_artifact,
            json.loads(arguments.radical_manifest.read_text()),
            arguments.jlpt_kanji_record,
            arguments.output,
        ),
        "--radical-artifact",
        "--radical-manifest",
        "--jlpt-kanji-record",
    )


if __name__ == "__main__":
    main()
