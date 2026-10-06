#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import io
import json
import sqlite3
import zipfile
from collections import defaultdict
from pathlib import Path

from language_data_tools import file_sha256
from unidic_adapter import hiragana, mora_count


ARTIFACT_SCHEMA = "zenbu.compound-pitch.v1"
SOURCE_IDENTITY = "UniDic 3.1.0 compound accent rule (C2)"
NOUN_LIKE = {"名詞", "形状詞", "接頭辞", "接尾辞"}
COMBINATION_TYPES = {"C1", "C2", "C3", "C4", "C5"}


def load_lexemes(source: Path) -> dict[str, set[tuple[str, int, str, str]]]:
    lexemes: dict[str, set[tuple[str, int, str, str]]] = defaultdict(set)
    with zipfile.ZipFile(source) as archive:
        name = next(name for name in archive.namelist() if name.endswith("/lex_3_1.csv"))
        with archive.open(name) as raw, io.TextIOWrapper(raw, encoding="utf-8", newline="") as text:
            for row in csv.reader(text):
                if len(row) < 31 or row[28] == "*":
                    continue
                try:
                    downstep = int(row[28].split(",", maxsplit=1)[0])
                except ValueError:
                    continue
                reading = hiragana(row[10])
                if reading:
                    lexemes[row[14]].add((reading, downstep, row[29].split(",")[0], row[4]))
    return lexemes


def is_kanji(value: str) -> bool:
    return all(0x3400 <= ord(character) <= 0x9FFF or character == "々" for character in value)


def two_part_split(headword: str, reading: str, lexemes) -> list[tuple] | None:
    splits = []
    for index in range(1, len(headword)):
        for first in sorted(lexemes.get(headword[:index], ())):
            if not reading.startswith(first[0]) or first[3] not in NOUN_LIKE:
                continue
            for second in sorted(lexemes.get(headword[index:], ())):
                if first[0] + second[0] == reading and second[3] in NOUN_LIKE:
                    splits.append((first, second))
    types = {second[2] for _, second in splits}
    if not splits or len(types) != 1 or not types <= COMBINATION_TYPES:
        return None
    return list(splits[0])


def estimated_downstep(headword: str, reading: str, lexemes) -> int | None:
    split = two_part_split(headword, reading, lexemes) if is_kanji(headword) else None
    if split is None or split[1][2] != "C2":
        return None
    return mora_count(split[0][0]) + 1


def import_pitch(source: Path, source_manifest: dict, language_data: Path, output: Path) -> dict:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("UniDic archive does not match its pinned SHA-256")
    lexemes = load_lexemes(source)
    database = sqlite3.connect(f"file:{language_data}?mode=ro", uri=True)
    try:
        candidates = database.execute(
            "SELECT id, headword, reading, is_common FROM entries "
            "WHERE pitch_accent_json IS NULL AND headword <> reading"
        ).fetchall()
    finally:
        database.close()

    rows = []
    common = 0
    for entry_id, headword, reading, is_common in candidates:
        downstep = estimated_downstep(headword, reading, lexemes)
        if downstep is None:
            continue
        pitch = {
            "downstep": downstep,
            "moraCount": mora_count(reading),
            "sourceIdentity": SOURCE_IDENTITY,
        }
        rows.append((entry_id, json.dumps(pitch, ensure_ascii=False, separators=(",", ":"))))
        common += is_common
    rows.sort()

    temporary = output.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    artifact = sqlite3.connect(temporary)
    try:
        artifact.executescript(
            """
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE entry_pitch (
              entry_id BLOB PRIMARY KEY,
              pitch_accent_json TEXT NOT NULL
            ) WITHOUT ROWID;
            """
        )
        language_data_sha256 = file_sha256(language_data)
        artifact.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            (
                ("artifact_schema", ARTIFACT_SCHEMA),
                ("source_identity", SOURCE_IDENTITY),
                ("source_sha256", source_manifest["sha256"]),
                ("language_data_sha256", language_data_sha256),
            ),
        )
        artifact.executemany(
            "INSERT INTO entry_pitch(entry_id, pitch_accent_json) VALUES (?, ?)", rows
        )
        artifact.commit()
        artifact.execute("VACUUM")
    finally:
        artifact.close()
    temporary.replace(output)

    return {
        "identity": "unidic-compound-accent-rule-c2-v1",
        "artifact_schema": ARTIFACT_SCHEMA,
        "rule": "Two-part kanji noun compound whose second UniDic part has aConType C2: "
        "downstep on the second part's first mora.",
        "entries_without_pitch_considered": len(candidates),
        "entries_estimated": len(rows),
        "common_entries_estimated": common,
        "source_sha256": source_manifest["sha256"],
        "language_data_sha256": language_data_sha256,
        "import_tool_sha256": file_sha256(Path(__file__)),
        "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
        "artifact_sha256": file_sha256(output),
        "artifact_bytes": output.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--language-data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--import-manifest", type=Path, required=True)
    arguments = parser.parse_args()

    source_manifest = json.loads(arguments.source_manifest.read_text())
    transform = import_pitch(
        arguments.source, source_manifest, arguments.language_data, arguments.output
    )
    manifest = {"source": source_manifest, "transform": transform}
    arguments.import_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(transform, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
