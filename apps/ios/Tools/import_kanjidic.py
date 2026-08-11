#!/usr/bin/env python3
"""Normalize pinned KANJIDIC2 and radical components into app-owned kanji reference data."""

from __future__ import annotations

import argparse
import gzip
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from language_data_tools import file_sha256


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
    output: Path,
) -> dict[str, object]:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("Pinned KANJIDIC2 checksum mismatch")
    expected_radical_hash = radical_manifest["transform"]["artifact_sha256"]
    if file_sha256(radical_artifact) != expected_radical_hash:
        raise ValueError("Pinned radical artifact checksum mismatch")

    radical_data = json.loads(radical_artifact.read_text())
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
                    "frequencyRank": optional_int(element, "misc/freq"),
                    "classicalRadicalNumber": classical_radical,
                    "meanings": english_meanings(element),
                    "readings": normalized_readings(element),
                    "components": components_by_character.get(literal, []),
                }
            )
            element.clear()

    entries.sort(key=lambda entry: str(entry["character"]))
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
        "component_artifact_sha256": file_sha256(radical_artifact),
        "import_tool_sha256": file_sha256(Path(__file__)),
        "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
        "artifact_sha256": file_sha256(output),
        "artifact_bytes": output.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--radical-artifact", type=Path, required=True)
    parser.add_argument("--radical-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--import-manifest", type=Path, required=True)
    arguments = parser.parse_args()

    source_manifest = json.loads(arguments.source_manifest.read_text())
    radical_manifest = json.loads(arguments.radical_manifest.read_text())
    transform = import_snapshot(
        arguments.source,
        source_manifest,
        arguments.radical_artifact,
        radical_manifest,
        arguments.output,
    )
    manifest = {"source": source_manifest, "transform": transform}
    arguments.import_manifest.parent.mkdir(parents=True, exist_ok=True)
    arguments.import_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(transform, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
