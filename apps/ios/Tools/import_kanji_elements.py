#!/usr/bin/env python3
"""Normalize pinned structural kanji data into app-owned element references."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from language_data_tools import file_sha256


VARIANT_MARKER = re.compile(r"\(C\)")


def is_ideograph(value: str) -> bool:
    if len(value) != 1:
        return False
    codepoint = ord(value)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
        or 0x20000 <= codepoint <= 0x2FA1F
        or 0x30000 <= codepoint <= 0x323AF
    )


def split_glyphs(value: str | None) -> list[str]:
    if not value:
        return []
    cleaned = VARIANT_MARKER.sub("", value).strip()
    pieces = cleaned.split(",") if "," in cleaned else list(cleaned)
    result: list[str] = []
    for piece in pieces:
        glyph = piece.strip()
        if is_ideograph(glyph) and glyph not in result:
            result.append(glyph)
    return result


def load_kanji_reference(path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    entries = {entry["character"]: entry for entry in document["entries"]}
    return entries, document


def load_structure(
    path: Path,
) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], dict[str, str]]:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise ValueError(f"Kanjium source failed SQLite integrity_check: {integrity}")

    structure: dict[str, dict[str, Any]] = {}
    for row in connection.execute(
        "SELECT kanji, kanji_parts, extra_elements FROM elements ORDER BY kanji"
    ):
        glyph = row["kanji"]
        if not is_ideograph(glyph):
            continue
        structure[glyph] = {
            "parts": split_glyphs(row["kanji_parts"]),
            "extra": split_glyphs(row["extra_elements"]),
        }

    variants: dict[str, set[str]] = defaultdict(set)
    for row in connection.execute(
        "SELECT kanji, variants, traditional, simplified, shinjitai, kyuujitai "
        "FROM variants ORDER BY kanji"
    ):
        glyph = row["kanji"]
        if not is_ideograph(glyph):
            continue
        related: list[str] = []
        for column in ("variants", "traditional", "simplified", "shinjitai", "kyuujitai"):
            related.extend(split_glyphs(row[column]))
        for alternative in related:
            if alternative == glyph:
                continue
            variants[glyph].add(alternative)
            variants[alternative].add(glyph)

    phonetic_by_kanji: dict[str, str] = {}
    for row in connection.execute(
        "SELECT kanji, phonetic FROM kanjidict WHERE phonetic IS NOT NULL AND phonetic != ''"
    ):
        glyph = row["kanji"]
        phonetics = split_glyphs(row["phonetic"])
        if is_ideograph(glyph) and phonetics:
            phonetic_by_kanji[glyph] = phonetics[0]
    connection.close()
    return structure, variants, phonetic_by_kanji


def closure(
    glyph: str,
    structure: dict[str, dict[str, Any]],
    memo: dict[str, set[str]],
    visiting: set[str] | None = None,
) -> set[str]:
    if glyph in memo:
        return memo[glyph]
    active = set() if visiting is None else set(visiting)
    if glyph in active:
        return set()
    active.add(glyph)
    descendants: set[str] = set()
    for part in structure.get(glyph, {}).get("parts", []):
        if part == glyph:
            continue
        descendants.add(part)
        descendants.update(closure(part, structure, memo, active))
    memo[glyph] = descendants
    return descendants


def variant_family(glyph: str, variants: dict[str, set[str]]) -> set[str]:
    pending = [glyph]
    family: set[str] = set()
    while pending:
        candidate = pending.pop()
        if candidate in family:
            continue
        family.add(candidate)
        pending.extend(variants.get(candidate, set()) - family)
    return family


def top_level_components(
    glyph: str,
    structure: dict[str, dict[str, Any]],
    variants: dict[str, set[str]],
    closure_memo: dict[str, set[str]],
) -> list[str]:
    record = structure.get(glyph)
    if not record:
        return []
    candidates: list[str] = []
    for candidate in record["extra"] + record["parts"]:
        if candidate != glyph and candidate not in candidates:
            candidates.append(candidate)

    maximal = [
        candidate
        for candidate in candidates
        if not any(
            candidate in closure(other, structure, closure_memo)
            for other in candidates
            if other != candidate
        )
    ]
    result: list[str] = []
    represented_families: list[set[str]] = []
    for candidate in maximal:
        family = variant_family(candidate, variants)
        if any(family & represented for represented in represented_families):
            continue
        result.append(candidate)
        represented_families.append(family)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kanjium", type=Path, required=True)
    parser.add_argument("--kanjium-source", type=Path, required=True)
    parser.add_argument("--kanji-reference", type=Path, required=True)
    parser.add_argument("--kanji-reference-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    source_metadata = json.loads(args.kanjium_source.read_text(encoding="utf-8"))
    expected_source_hash = source_metadata["sha256"]
    if file_sha256(args.kanjium) != expected_source_hash:
        raise ValueError("Kanjium source checksum does not match its pinned manifest")

    reference_manifest = json.loads(
        args.kanji_reference_manifest.read_text(encoding="utf-8")
    )
    reference_hash = file_sha256(args.kanji_reference)
    expected_reference_hash = reference_manifest["transform"]["artifact_sha256"]
    if reference_hash != expected_reference_hash:
        raise ValueError("Kanji Reference artifact checksum does not match its import manifest")
    if reference_manifest["source"]["identity"] != "EDRDG KANJIDIC2":
        raise ValueError("Kanji Reference manifest does not identify the required KANJIDIC2 source")

    kanji_reference, reference_document = load_kanji_reference(args.kanji_reference)
    structure, variants, explicit_phonetics = load_structure(args.kanjium)
    closure_memo: dict[str, set[str]] = {}

    element_glyphs_by_kanji: dict[str, list[str]] = {}
    containing_by_element: dict[str, set[str]] = defaultdict(set)
    for glyph in sorted(kanji_reference, key=ord):
        components = [
            component
            for component in top_level_components(
                glyph, structure, variants, closure_memo
            )
            if component in kanji_reference or component in structure
        ]
        if not components:
            continue
        element_glyphs_by_kanji[glyph] = components
        for component in components:
            containing_by_element[component].add(glyph)

    referenced_elements = set(containing_by_element)
    for glyph in list(referenced_elements):
        referenced_elements.update(
            alternative
            for alternative in variant_family(glyph, variants)
            if alternative in kanji_reference or alternative in structure
        )

    def summary(glyph: str) -> dict[str, Any]:
        reference = kanji_reference.get(glyph, {})
        return {
            "character": glyph,
            "meanings": reference.get("meanings", []),
            "onReadings": [
                reading["value"]
                for reading in reference.get("readings", [])
                if reading["kind"] == "on"
            ],
            "frequencyRank": reference.get("frequencyRank"),
        }

    elements: list[dict[str, Any]] = []
    for glyph in sorted(referenced_elements, key=ord):
        family = variant_family(glyph, variants) & referenced_elements
        containing = set()
        for family_glyph in family:
            containing.update(containing_by_element.get(family_glyph, set()))
        reading_counts: Counter[str] = Counter()
        for character in containing | family:
            reading_counts.update(set(summary(character)["onReadings"]))
        frequent_readings = [
            reading
            for reading, count in sorted(
                reading_counts.items(), key=lambda item: (-item[1], item[0])
            )
            if count >= 2
        ][:4]
        if not frequent_readings:
            frequent_readings = [
                reading
                for reading, _ in sorted(
                    reading_counts.items(), key=lambda item: (-item[1], item[0])
                )[:2]
            ]
        elements.append(
            {
                "glyph": glyph,
                "alternatives": sorted(family - {glyph}, key=ord),
                "meanings": summary(glyph)["meanings"],
                "onReadings": summary(glyph)["onReadings"],
                "commonLinkedOnReadings": frequent_readings,
                "containingCharacters": sorted(
                    containing,
                    key=lambda character: (
                        summary(character)["frequencyRank"] is None,
                        summary(character)["frequencyRank"] or 1_000_000,
                        ord(character),
                    ),
                ),
            }
        )

    kanji = []
    for character, element_glyphs in element_glyphs_by_kanji.items():
        explicit = explicit_phonetics.get(character)
        kanji.append(
            {
                **summary(character),
                "elementGlyphs": element_glyphs,
                "explicitPhoneticElement": explicit if explicit in element_glyphs else None,
            }
        )

    catalog = {
        "schema": "zenbu.kanji-elements.v1",
        "snapshot": source_metadata["snapshot"],
        "structureSourceIdentity": "kanjium",
        "metadataSourceIdentity": reference_document["metadataSourceIdentity"],
        "metadataSourceSnapshot": reference_document["snapshot"],
        "elements": elements,
        "kanji": kanji,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    importer_path = Path(__file__).resolve()
    shared_tooling_path = importer_path.with_name("language_data_tools.py")
    generated_manifest = {
        "source": source_metadata,
        "transform": {
            "identity": "kanjium-and-kanji-reference-to-zenbu-elements-v1",
            "artifactSchema": catalog["schema"],
            "elementCount": len(elements),
            "kanjiWithElements": len(kanji),
            "relationshipCount": sum(len(entry["elementGlyphs"]) for entry in kanji),
            "alternativeRelationshipCount": sum(
                len(entry["alternatives"]) for entry in elements
            ),
            "kanjiumSourceSha256": expected_source_hash,
            "kanjiReferenceSha256": reference_hash,
            "kanjiReferenceManifestSha256": file_sha256(args.kanji_reference_manifest),
            "kanjiReferenceArtifactSha256": expected_reference_hash,
            "importToolSha256": file_sha256(importer_path),
            "sharedToolingSha256": file_sha256(shared_tooling_path),
            "artifactSha256": file_sha256(args.output),
            "artifactBytes": args.output.stat().st_size,
            "retainedFields": [
                "normalized top-level element membership",
                "element variant relationships",
                "explicit phonetic-element annotation",
                "app-owned kanji meaning and on-reading summaries",
            ],
            "excludedFields": [
                "Kanjium pitch accent and lexical tables",
                "provider-specific element lookup encoding",
                "mnemonics and proprietary etymology explanations",
            ],
        },
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(generated_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
