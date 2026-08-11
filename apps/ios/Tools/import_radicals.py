#!/usr/bin/env python3
"""Normalize pinned EDRDG KRADFILE/RADKFILE into Zenbu radical reference data."""

from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path

from language_data_tools import file_sha256


DISPLAY_GLYPHS = {
    "艾": "艹",
    "｜": "丨",
}


def parse_kradfile(path: Path) -> dict[str, list[str]]:
    characters: dict[str, list[str]] = {}
    with gzip.open(path, "rt", encoding="euc_jp") as source:
        for line_number, raw_line in enumerate(source, start=1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                character, component_text = line.split(" : ", maxsplit=1)
            except ValueError as error:
                raise ValueError(f"Malformed KRADFILE line {line_number}") from error
            components = component_text.split()
            if len(character) != 1 or not components:
                raise ValueError(f"Invalid KRADFILE record on line {line_number}")
            if character in characters:
                raise ValueError(f"Duplicate KRADFILE character {character}")
            characters[character] = components
    return characters


def parse_radkfile(path: Path) -> tuple[dict[str, int], dict[str, set[str]]]:
    stroke_counts: dict[str, int] = {}
    inversion: dict[str, set[str]] = defaultdict(set)
    current_component: str | None = None
    with gzip.open(path, "rt", encoding="euc_jp") as source:
        for line_number, raw_line in enumerate(source, start=1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("$"):
                fields = line.split()
                if len(fields) < 3:
                    raise ValueError(f"Malformed RADKFILE header on line {line_number}")
                current_component = fields[1]
                stroke_counts[current_component] = int(fields[2])
                continue
            if current_component is None:
                raise ValueError(f"RADKFILE membership before header on line {line_number}")
            inversion[current_component].update(line)
    return stroke_counts, dict(inversion)


def validate_inversion(
    characters: dict[str, list[str]],
    stroke_counts: dict[str, int],
    radk_inversion: dict[str, set[str]],
) -> dict[str, set[str]]:
    krad_inversion: dict[str, set[str]] = defaultdict(set)
    for character, components in characters.items():
        for component in components:
            krad_inversion[component].add(character)

    if set(krad_inversion) != set(stroke_counts) or set(krad_inversion) != set(radk_inversion):
        raise ValueError("KRADFILE and RADKFILE component sets differ")
    for component, members in krad_inversion.items():
        if members != radk_inversion[component]:
            raise ValueError(f"RADKFILE inversion differs for component {component}")
    return dict(krad_inversion)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--krad", type=Path, required=True)
    parser.add_argument("--radk", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--import-manifest", type=Path, required=True)
    args = parser.parse_args()

    source_manifest = json.loads(args.source_manifest.read_text())
    expected_sources = {source["identity"]: source for source in source_manifest["sources"]}
    actual_hashes = {
        "EDRDG KRADFILE": file_sha256(args.krad),
        "EDRDG RADKFILE": file_sha256(args.radk),
    }
    for identity, actual_hash in actual_hashes.items():
        if expected_sources[identity]["sha256"] != actual_hash:
            raise ValueError(f"Pinned source checksum mismatch for {identity}")

    characters = parse_kradfile(args.krad)
    stroke_counts, radk_inversion = parse_radkfile(args.radk)
    krad_inversion = validate_inversion(characters, stroke_counts, radk_inversion)

    components = [
        {
            "id": component,
            "glyph": DISPLAY_GLYPHS.get(component, component),
            "strokeCount": stroke_counts[component],
        }
        for component in sorted(
            stroke_counts,
            key=lambda value: (stroke_counts[value], DISPLAY_GLYPHS.get(value, value)),
        )
    ]
    artifact = {
        "snapshot": source_manifest["snapshot"],
        "sourceIdentity": "edrdg.kradfile",
        "components": components,
        "characters": [
            {"value": character, "components": characters[character]}
            for character in sorted(characters)
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")) + "\n")

    transform = {
        "source": source_manifest,
        "transform": {
            "identity": "edrdg-radicals-to-zenbu-language-reference-data-v1",
            "canonical_source": "KRADFILE visible-component membership",
            "integrity_source": "RADKFILE stroke counts and inverted membership",
            "character_count": len(characters),
            "component_count": len(components),
            "membership_count": sum(len(values) for values in krad_inversion.values()),
            "display_aliases": DISPLAY_GLYPHS,
            "import_tool_sha256": file_sha256(Path(__file__)),
            "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
            "artifact_sha256": file_sha256(args.output),
            "artifact_bytes": args.output.stat().st_size,
        },
    }
    args.import_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.import_manifest.write_text(json.dumps(transform, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
