from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path

from language_data_tools import file_sha256

KANJI_TABLE_HEADER = ["Kanji", "Onyomi", "Kunyomi", "English"]


class KanjiTableReader(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self.row is not None and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell.append(data)


def listed_kanji(page: str) -> list[str]:
    reader = KanjiTableReader()
    reader.feed(page)
    starts = [index for index, row in enumerate(reader.rows) if row == KANJI_TABLE_HEADER]
    if len(starts) != 1:
        raise ValueError("expected one Kanji, Onyomi, Kunyomi, English table")
    kanji = [row[0] for row in reader.rows[starts[0] + 1:] if len(row) == len(KANJI_TABLE_HEADER)]
    if any(len(character) != 1 for character in kanji):
        raise ValueError("a kanji table row doesn't start with one character")
    return kanji


def jlpt_kanji_levels(record_path: Path) -> tuple[dict[str, int], dict[str, object]]:
    record = json.loads(record_path.read_text(encoding="utf-8"))
    levels: dict[str, int] = {}
    counts: dict[str, int] = {}
    for file in record["files"]:
        path = record_path.parent / file["path"]
        if path.stat().st_size != file["bytes"] or file_sha256(path) != file["sha256"]:
            raise ValueError(f"{path.name}: size or SHA-256 doesn't match {record_path.name}")
        kanji = listed_kanji(path.read_text(encoding="utf-8"))
        if len(kanji) != file["kanji"] or len(set(kanji)) != len(kanji):
            raise ValueError(f"{path.name} lists {len(kanji)} kanji, not {file['kanji']} different ones")
        for character in kanji:
            levels[character] = max(levels.get(character, 0), int(file["level"]))
        counts[f"N{file['level']}"] = len(kanji)
    return levels, {
        "record": record_path.name,
        "record_sha256": file_sha256(record_path),
        "importer_sha256": file_sha256(Path(__file__)),
        "kanji_by_level": counts,
        "kanji": len(levels),
    }
