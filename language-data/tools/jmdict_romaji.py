from __future__ import annotations

import gzip
import json
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from jmdict_normalization import (
    FORM_KIND_ROMAJI,
    FORM_KIND_SHOWN_ROMAJI,
    FORM_KIND_UNMARKED_ROMAJI,
    english_glosses,
    gloss_search_text,
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
FOLDED_FIELDS = ("k_ele/keb", "r_ele/reb", "r_ele/re_restr", "sense/stagk", "sense/stagr")

RomajiForms = dict[tuple[str, ...], list[tuple[str, int]]]


@dataclass(frozen=True)
class SearchForms:
    romaji: RomajiForms
    folded: dict[str, str]

    def fold(self, text: str) -> str:
        try:
            return self.folded[text]
        except KeyError:
            raise ValueError(f"the core never folded {text!r}: collect it in jmdict_romaji.py") from None


def cross_reference_parts(entry: ET.Element) -> list[str]:
    return [part.strip() for reference in text_values(entry, "sense/xref") for part in reference.split("・")]


def entry_texts(entry: ET.Element) -> list[str]:
    glosses = [gloss for sense in entry.findall("sense") for gloss in english_glosses(sense)]
    fields = [value for path in FOLDED_FIELDS for value in text_values(entry, path)]
    return [*fields, *glosses, gloss_search_text(glosses), *cross_reference_parts(entry)]


def entry_readings_and_texts(source: Path) -> tuple[list[tuple[str, ...]], list[str]]:
    readings: dict[tuple[str, ...], None] = {}
    texts: dict[str, None] = {}
    with gzip.open(source, "rb") as xml_source:
        for _, entry in ET.iterparse(xml_source, events=("end",)):
            if entry.tag != "entry":
                continue
            readings[tuple(text_values(entry, "r_ele/reb"))] = None
            texts.update(dict.fromkeys(entry_texts(entry)))
            entry.clear()
    return list(readings), list(texts)


def search_forms(source: Path) -> SearchForms:
    return core_search_forms(*entry_readings_and_texts(source))


def core_search_forms(readings: list[tuple[str, ...]], texts: list[str]) -> SearchForms:
    try:
        answer = subprocess.run(
            ["node", str(REPOSITORY / ROMAJI_COMMAND)],
            input=json.dumps({"readings": readings, "texts": texts}, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError:
        raise SystemExit("the core's search forms need Node 22.18 or later on the PATH") from None
    if answer.returncode != 0:
        raise SystemExit(f"the core's search forms failed: {answer.stderr.strip()}")
    written = json.loads(answer.stdout)
    unlisted = sorted(set(CORE_PACKAGE + name for name in written["files"]) - set(CORE_ROMAJI_FILES))
    if unlisted:
        raise SystemExit(
            f"the core's search forms read {', '.join(unlisted)}: "
            "add each to CORE_ROMAJI_FILES in jmdict_romaji.py, which the import tool SHA-256 covers"
        )
    romaji = {
        entry: [(form, FORM_KIND_ROMAJI) for form in forms["romaji"]]
        + [(form, FORM_KIND_SHOWN_ROMAJI) for form in forms["shownRomaji"]]
        + [(form, FORM_KIND_UNMARKED_ROMAJI) for form in forms["unmarkedRomaji"]]
        for entry, forms in zip(readings, written["forms"], strict=True)
    }
    return SearchForms(romaji, dict(zip(texts, written["folded"], strict=True)))
