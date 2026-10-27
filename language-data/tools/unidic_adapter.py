from __future__ import annotations

import csv
import io
import json
import sqlite3
import unicodedata
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

PROPER_NOUN = "固有名詞"
COMBINING_KANA = frozenset("ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ")
HEIBAN = 0
ATAMADAKA = 1


def hiragana(value: str) -> str:
    return "".join(
        chr(ord(character) - 0x60) if "ァ" <= character <= "ヶ" else character
        for character in unicodedata.normalize("NFKC", value)
    )


def mora_count(value: str) -> int:
    count = 0
    for character in unicodedata.normalize("NFKC", value):
        if character not in COMBINING_KANA or count == 0:
            count += 1
    return count


def lexicon_rows(source: Path) -> Iterator[list[str]]:
    with zipfile.ZipFile(source) as archive:
        lexicon_name = next((name for name in archive.namelist() if name.endswith("/lex_3_1.csv")), None)
        if not lexicon_name:
            raise ValueError("UniDic archive is missing lex_3_1.csv")
        with archive.open(lexicon_name) as raw, io.TextIOWrapper(raw, encoding="utf-8", newline="") as text:
            for row in csv.reader(text):
                if len(row) >= 31:
                    yield row


def accent_types(row: list[str]) -> list[int]:
    types: list[int] = []
    for value in row[28].split(","):
        if not value.isdigit():
            break
        types.append(int(value))
    return types


def first_accent(row: list[str]) -> int | None:
    return next(iter(accent_types(row)), None)


def pronounced_accent(row: list[str]) -> int | None:
    morae = mora_count(row[15])
    return next((downstep for downstep in accent_types(row) if downstep <= morae), None)


@dataclass(frozen=True)
class LexiconWord:
    lemma: str
    spelling: str
    proper_noun: bool
    cost: int
    downstep: int | None
    mora_count: int


@dataclass(frozen=True)
class EntryWord:
    headword: str
    reading: str
    written: frozenset[str]
    kana_readings: frozenset[str]
    reading_morae: int

    def spellings(self) -> frozenset[str]:
        return self.written | self.kana_readings


def entry_word(record: dict[str, object], normalize: Callable[[str], str]) -> EntryWord:
    headword = str(record["headword"])
    reading = str(record["reading"])
    written = frozenset(normalize(str(form)) for form in record["written_values"])
    kana_word = not written or headword == reading
    readings = frozenset(normalize(str(form)) for form in record["reading_values"]) if kana_word else frozenset()
    return EntryWord(normalize(headword), normalize(hiragana(reading)), written, readings, mora_count(reading))


def common_first(words: set[LexiconWord]) -> set[LexiconWord]:
    common = {word for word in words if not word.proper_noun}
    return common or words


def accented(words: set[LexiconWord]) -> list[LexiconWord]:
    return [word for word in words if word.downstep is not None]


class LexiconIndex:
    def __init__(self, source: Path, entries: list[EntryWord], normalize: Callable[[str], str]) -> None:
        wanted = {(spelling, entry.reading) for entry in entries for spelling in entry.spellings()}
        self.by_lemma_form: dict[tuple[str, str], set[LexiconWord]] = defaultdict(set)
        self.by_lemma_reading: dict[tuple[str, str], set[LexiconWord]] = defaultdict(set)
        self.by_spelling: dict[tuple[str, str], set[LexiconWord]] = defaultdict(set)
        for row in lexicon_rows(source):
            lemma = normalize(row[11].split("-", maxsplit=1)[0])
            form_reading = normalize(hiragana(row[27]))
            pronunciation = normalize(hiragana(row[15]))
            keys = [
                (self.by_lemma_form, {(lemma, form_reading), (lemma, pronunciation)} & wanted),
                (self.by_lemma_reading, {(lemma, normalize(hiragana(row[10])))} & wanted),
                (self.by_spelling, {(normalize(row[14]), form_reading)} & wanted),
            ]
            if not any(table_keys for _, table_keys in keys):
                continue
            word = LexiconWord(
                lemma, normalize(row[14]), row[5] == PROPER_NOUN, int(row[3]), pronounced_accent(row),
                mora_count(pronunciation),
            )
            for table, table_keys in keys:
                for key in table_keys:
                    table[key].add(word)

    def words(self, table: dict[tuple[str, str], set[LexiconWord]], spellings: frozenset[str], reading: str):
        return {word for spelling in spellings for word in table.get((spelling, reading), ())}

    def lemma_words(self, spellings: frozenset[str], reading: str) -> set[LexiconWord]:
        return self.words(self.by_lemma_form, spellings, reading) or self.words(
            self.by_lemma_reading, spellings, reading
        )

    def own_words(self, entry: EntryWord) -> list[LexiconWord]:
        for spellings in (entry.written, entry.kana_readings):
            lemma_words = self.lemma_words(spellings, entry.reading)
            if lemma_words:
                return accented(common_first(lemma_words))
        spelling_words = self.words(self.by_spelling, entry.written, entry.reading) | {
            word for word in self.words(self.by_spelling, entry.kana_readings, entry.reading) if not word.proper_noun
        }
        candidates = common_first(spelling_words)
        if len({word.lemma for word in candidates}) != 1:
            return []
        return accented(candidates)


def describes_reading(word: LexiconWord, entry: EntryWord) -> bool:
    return word.mora_count == entry.reading_morae or word.downstep in (HEIBAN, ATAMADAKA)


def chosen_word(entry: EntryWord, words: list[LexiconWord]) -> LexiconWord:
    shown = [word for word in words if word.spelling == entry.headword] or words
    return min(shown, key=lambda word: (word.cost, word.downstep, word.mora_count, word.spelling, word.lemma))


def apply_unidic_pitch(
    database: sqlite3.Connection,
    entry_records: list[dict[str, object]],
    source: Path,
    source_metadata: dict[str, object],
    normalize: Callable[[str], str],
) -> int:
    entries = [(record["id"], entry_word(record, normalize)) for record in entry_records]
    index = LexiconIndex(source, [entry for _, entry in entries], normalize)
    pitched = 0
    for entry_id, entry in entries:
        words = [word for word in index.own_words(entry) if describes_reading(word, entry)]
        if not words:
            continue
        word = chosen_word(entry, words)
        database.execute(
            "UPDATE entries SET pitch_accent_json = ? WHERE id = ?",
            (json.dumps({"downstep": word.downstep, "moraCount": entry.reading_morae,
                         "sourceIdentity": str(source_metadata["identity"])},
                        ensure_ascii=False, separators=(",", ":")), entry_id),
        )
        pitched += 1
    return pitched
