#!/usr/bin/env python3
"""Normalize pinned KanjiVG paths into app-owned ordered stroke diagrams."""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

from language_data_tools import file_sha256


TOKEN_PATTERN = re.compile(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def is_ideograph(value: int) -> bool:
    return any(
        lower <= value <= upper
        for lower, upper in (
            (0x3400, 0x4DBF),
            (0x4E00, 0x9FFF),
            (0xF900, 0xFAFF),
            (0x20000, 0x2FA1F),
            (0x30000, 0x323AF),
        )
    )


def rounded(value: float) -> int | float:
    nearest = round(value)
    if abs(value - nearest) < 0.000001:
        return nearest
    return round(value, 4)


def normalized_path(path_data: str) -> list[int | float]:
    """Encode absolute move/cubic commands as compact app-owned numeric instructions.

    Opcode 0 is move(x, y); opcode 1 is cubic(control1, control2, end).
    KanjiVG r20250816 uses only M/m, C/c, and S/s path commands. Any future
    command fails promotion instead of silently entering the runtime artifact.
    """

    tokens = TOKEN_PATTERN.findall(path_data.replace(",", " "))
    index = 0
    command = ""
    current_x = 0.0
    current_y = 0.0
    prior_control_x: float | None = None
    prior_control_y: float | None = None
    encoded: list[int | float] = []

    def number() -> float:
        nonlocal index
        if index >= len(tokens) or tokens[index].isalpha():
            raise ValueError(f"Incomplete KanjiVG path command in {path_data!r}")
        value = float(tokens[index])
        index += 1
        return value

    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        if command in ("M", "m"):
            x = number()
            y = number()
            if command == "m":
                x += current_x
                y += current_y
            current_x, current_y = x, y
            encoded.extend((0, rounded(x), rounded(y)))
            prior_control_x = prior_control_y = None
            command = ""
            continue
        if command in ("C", "c"):
            control1_x, control1_y = number(), number()
            control2_x, control2_y = number(), number()
            end_x, end_y = number(), number()
            if command == "c":
                control1_x += current_x
                control1_y += current_y
                control2_x += current_x
                control2_y += current_y
                end_x += current_x
                end_y += current_y
            encoded.extend(
                (
                    1,
                    rounded(control1_x),
                    rounded(control1_y),
                    rounded(control2_x),
                    rounded(control2_y),
                    rounded(end_x),
                    rounded(end_y),
                )
            )
            current_x, current_y = end_x, end_y
            prior_control_x, prior_control_y = control2_x, control2_y
            continue
        if command in ("S", "s"):
            control1_x = (
                2 * current_x - prior_control_x
                if prior_control_x is not None
                else current_x
            )
            control1_y = (
                2 * current_y - prior_control_y
                if prior_control_y is not None
                else current_y
            )
            control2_x, control2_y = number(), number()
            end_x, end_y = number(), number()
            if command == "s":
                control2_x += current_x
                control2_y += current_y
                end_x += current_x
                end_y += current_y
            encoded.extend(
                (
                    1,
                    rounded(control1_x),
                    rounded(control1_y),
                    rounded(control2_x),
                    rounded(control2_y),
                    rounded(end_x),
                    rounded(end_y),
                )
            )
            current_x, current_y = end_x, end_y
            prior_control_x, prior_control_y = control2_x, control2_y
            continue
        raise ValueError(f"Unsupported KanjiVG path command {command!r}")

    if not encoded or encoded[0] != 0:
        raise ValueError(f"KanjiVG stroke has no initial move: {path_data!r}")
    return encoded


def import_snapshot(source: Path, source_manifest: dict[str, object], output: Path) -> dict[str, object]:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("Pinned KanjiVG checksum mismatch")

    entries: list[tuple[str, str, int]] = []
    path_count = 0
    with gzip.open(source, "rb") as stream:
        for _, element in ET.iterparse(stream, events=("end",)):
            if element.tag != "kanji":
                continue
            identifier = element.attrib.get("id", "")
            try:
                scalar = int(identifier.rsplit("_", 1)[1], 16)
            except (IndexError, ValueError):
                element.clear()
                continue
            if not is_ideograph(scalar):
                element.clear()
                continue
            strokes = [
                normalized_path(node.attrib["d"])
                for node in element.findall(".//path")
                if node.attrib.get("d")
            ]
            if strokes:
                entries.append(
                    (
                        chr(scalar),
                        json.dumps(strokes, separators=(",", ":")),
                        len(strokes),
                    )
                )
                path_count += len(strokes)
            element.clear()

    entries.sort(key=lambda item: item[0])
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    database = sqlite3.connect(temporary)
    try:
        database.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            PRAGMA page_size = 4096;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE stroke_diagrams (
              character TEXT PRIMARY KEY,
              viewport_size REAL NOT NULL,
              stroke_count INTEGER NOT NULL,
              strokes_json TEXT NOT NULL
            ) WITHOUT ROWID;
            """
        )
        database.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            (
                ("artifact_schema", "zenbu.kanji-stroke-diagrams.v1"),
                ("snapshot", str(source_manifest["snapshot"])),
                ("source_identity", "kanjivg"),
                ("viewport_size", "109"),
            ),
        )
        database.executemany(
            "INSERT INTO stroke_diagrams(character, viewport_size, stroke_count, strokes_json) VALUES (?, 109, ?, ?)",
            ((character, count, strokes) for character, strokes, count in entries),
        )
        database.commit()
        database.execute("VACUUM")
    finally:
        database.close()
    temporary.replace(output)

    fixture_counts = {
        character: count
        for character, _, count in entries
        if character in {"一", "争", "鬱"}
    }
    return {
        "identity": "kanjivg-to-zenbu-stroke-diagrams-v1",
        "artifact_schema": "zenbu.kanji-stroke-diagrams.v1",
        "entry_count": len(entries),
        "stroke_count": path_count,
        "viewport_size": 109,
        "fixture_stroke_counts": fixture_counts,
        "retained_fields": ["kanji scalar identity", "ordered path geometry"],
        "excluded_fields": [
            "KanjiVG component grouping and element labels",
            "stroke type labels",
            "radical annotations",
            "variant SVG files",
        ],
        "modifications": [
            "filtered the legacy combined release to Unicode ideographs",
            "normalized relative and smooth SVG path commands to absolute cubic geometry",
            "encoded geometry in the app-owned ordered-stroke SQLite schema",
        ],
        "source_sha256": file_sha256(source),
        "license_sha256": source_manifest["license_sha256"],
        "import_tool_sha256": file_sha256(Path(__file__)),
        "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
        "artifact_sha256": file_sha256(output),
        "artifact_bytes": output.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--import-manifest", type=Path, required=True)
    arguments = parser.parse_args()

    source_manifest = json.loads(arguments.source_manifest.read_text())
    transform = import_snapshot(arguments.source, source_manifest, arguments.output)
    manifest = {"source": source_manifest, "transform": transform}
    arguments.import_manifest.parent.mkdir(parents=True, exist_ok=True)
    arguments.import_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(transform, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
