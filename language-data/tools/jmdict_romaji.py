from __future__ import annotations

import gzip
import json
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from jmdict_normalization import (
    FORM_KIND_ROMAJI,
    FORM_KIND_SHOWN_ROMAJI,
    FORM_KIND_UNMARKED_ROMAJI,
    text_values,
)

REPOSITORY = Path(__file__).resolve().parents[2]
ROMAJI_COMMAND = "packages/dictionary-core/scripts/romaji-search-forms.mjs"
CORE_ROMAJI_FILES = (
    ROMAJI_COMMAND,
    "packages/dictionary-core/src/detail/romaji.ts",
    "packages/dictionary-core/src/detail/text.ts",
    "packages/dictionary-core/src/examples/kana.ts",
    "packages/dictionary-core/src/search/query.ts",
    "packages/dictionary-core/src/search/romaji-forms.ts",
)
CORE_PACKAGE = "packages/dictionary-core/"

RomajiForms = dict[tuple[str, ...], list[tuple[str, int]]]


def entry_readings(source: Path) -> list[tuple[str, ...]]:
    readings: dict[tuple[str, ...], None] = {}
    with gzip.open(source, "rb") as xml_source:
        for _, entry in ET.iterparse(xml_source, events=("end",)):
            if entry.tag != "entry":
                continue
            readings[tuple(text_values(entry, "r_ele/reb"))] = None
            entry.clear()
    return list(readings)


def romaji_search_forms(source: Path) -> RomajiForms:
    return core_romaji_search_forms(entry_readings(source))


def core_romaji_search_forms(readings: list[tuple[str, ...]]) -> RomajiForms:
    try:
        answer = subprocess.run(
            ["node", str(REPOSITORY / ROMAJI_COMMAND)],
            input=json.dumps(readings, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError:
        raise SystemExit("the core's romaji search forms need Node 22.18 or later on the PATH") from None
    if answer.returncode != 0:
        raise SystemExit(f"the core's romaji search forms failed: {answer.stderr.strip()}")
    written = json.loads(answer.stdout)
    unlisted = sorted(set(CORE_PACKAGE + name for name in written["files"]) - set(CORE_ROMAJI_FILES))
    if unlisted:
        raise SystemExit(
            f"the core's romaji search forms read {', '.join(unlisted)}: "
            "add each to CORE_ROMAJI_FILES in jmdict_romaji.py, which the import tool SHA-256 covers"
        )
    return {
        entry: [(form, FORM_KIND_ROMAJI) for form in forms["romaji"]]
        + [(form, FORM_KIND_SHOWN_ROMAJI) for form in forms["shownRomaji"]]
        + [(form, FORM_KIND_UNMARKED_ROMAJI) for form in forms["unmarkedRomaji"]]
        for entry, forms in zip(readings, written["forms"], strict=True)
    }
