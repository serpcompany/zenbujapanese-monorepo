from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

from unidic_adapter import first_accent, hiragana, mora_count

PREFIX = "接頭辞"
SUFFIX = "接尾辞"
NOUN_LIKE = {"名詞", "形状詞", PREFIX, SUFFIX}
KANA_AFFIXES = {"お", "ご", "御", "さん", "さま", "ちゃん", "くん", "たち"}
MOST_PARTS = 4
GROUPED_PART_COUNT = 3
SPECIAL_MORAE = {"ん", "っ", "ー"}
COMBINING_KANA = set("ぁぃぅぇぉゃゅょゎ")
VOWEL_ROWS = {
    "a": "あかさたなはまやらわがざだばぱぁゃ",
    "i": "いきしちにひみりぎじぢびぴぃ",
    "u": "うくすつぬふむゆるぐずづぶぷぅゅ",
    "e": "えけせてねへめれげぜでべぺぇ",
    "o": "おこそとのほもよろをごぞどぼぽぉょ",
}
VOWEL = {kana: vowel for vowel, row in VOWEL_ROWS.items() for kana in row}
LONG_VOWEL_AFTER = {"う": {"o", "u"}, "い": {"e", "a", "o", "u"}}


@dataclass(frozen=True)
class Part:
    spelling: str
    kana: str
    downstep: int | None
    combination: str
    pos: str


@dataclass(frozen=True)
class CompoundGroup:
    script: str
    prefixed: bool
    last_part_types: tuple[str, ...]
    parts: int

    def label(self) -> str:
        types = "/".join(self.last_part_types)
        parts = f"{self.parts}+" if self.parts == GROUPED_PART_COUNT else str(self.parts)
        return f"{self.script}, {'prefix ' if self.prefixed else ''}{types}, {parts} parts"


@dataclass(frozen=True)
class CompoundEstimate:
    downstep: int
    group: CompoundGroup


def is_kanji_character(character: str) -> bool:
    code = ord(character)
    return 0x3400 <= code <= 0x9FFF or character == "々" or 0x20000 <= code <= 0x2FFFF


def is_kanji(value: str) -> bool:
    return all(is_kanji_character(character) for character in value)


def has_kanji(value: str) -> bool:
    return any(is_kanji_character(character) for character in value)


def is_kana(value: str) -> bool:
    return all("ぁ" <= character <= "ゖ" or "ァ" <= character <= "ヺ" or character in "ー・" for character in value)


def is_katakana(value: str) -> bool:
    return all("ァ" <= character <= "ヺ" or character in "ー・" for character in value)


def script(headword: str, reading: str) -> str:
    if headword == reading or is_kana(headword):
        return "katakana" if is_katakana(headword) else "kana"
    if is_kanji(headword):
        return "kanji"
    return "kanji+kana" if has_kanji(headword) else "other"


def usable_part(spelling: str, pos: str) -> bool:
    if has_kanji(spelling):
        return True
    if pos in (PREFIX, SUFFIX):
        return spelling in KANA_AFFIXES
    return len(spelling) >= (3 if is_katakana(spelling) else 2)


def worth_splitting(headword: str) -> bool:
    if has_kanji(headword):
        return len(headword) >= 3
    return is_katakana(headword) and len(headword) >= 4


def lexicon_parts(rows: Iterable[list[str]]) -> dict[str, frozenset[Part]]:
    parts: dict[str, set[Part]] = defaultdict(set)
    for row in rows:
        pos, spelling = row[4], row[14]
        if pos not in NOUN_LIKE or not usable_part(spelling, pos):
            continue
        downstep = first_accent(row)
        if downstep is None and pos not in (PREFIX, SUFFIX):
            continue
        kana = hiragana(row[25])
        if kana:
            parts[spelling].add(Part(spelling, kana, downstep, row[29].split(",")[0], pos))
    return {spelling: frozenset(found) for spelling, found in parts.items()}


def morae(kana: str) -> list[str]:
    result: list[str] = []
    for character in hiragana(kana):
        if character in COMBINING_KANA and result:
            result[-1] += character
        else:
            result.append(character)
    return result


def is_special_mora(moras: list[str], index: int, part_starts: set[int]) -> bool:
    if moras[index] in SPECIAL_MORAE:
        return True
    if index == 0 or index in part_starts:
        return False
    return VOWEL.get(moras[index - 1][-1]) in LONG_VOWEL_AFTER.get(moras[index], set())


def off_special_morae(split: tuple[Part, ...], downstep: int) -> int:
    moras = morae("".join(part.kana for part in split))
    part_starts, start = set(), 0
    for part in split:
        part_starts.add(start)
        start += len(morae(part.kana))
    while 1 < downstep <= len(moras) and is_special_mora(moras, downstep - 1, part_starts):
        downstep -= 1
    return downstep


def prefixed_downstep(prefix: Part, word: Part) -> int | None:
    prefix_morae, downstep = mora_count(prefix.kana), word.downstep
    if downstep is None:
        return None
    if prefix.combination in ("P1", "P4", "P13"):
        return 0 if downstep == 0 else prefix_morae + downstep
    if prefix.combination == "P2":
        return prefix_morae + (1 if downstep == 0 else downstep)
    if prefix.combination == "P6":
        return 0
    if prefix.combination == "P14" and downstep != 0:
        return prefix_morae + downstep
    return None


def joined_downstep(later: Part, earlier_morae: int, earlier_downstep: int) -> int | None:
    if later.combination == "C1":
        if later.downstep is None:
            return None
        return 0 if later.downstep == 0 else earlier_morae + later.downstep
    return {
        "C2": earlier_morae + 1,
        "C3": earlier_morae,
        "C4": 0,
        "C5": earlier_downstep,
    }.get(later.combination)


def compound_downstep(split: tuple[Part, ...]) -> int | None:
    first = split[0]
    if first.pos == PREFIX:
        if len(split) < 2 or split[1].pos in (PREFIX, SUFFIX):
            return None
        downstep = prefixed_downstep(first, split[1])
        joined, rest = split[:2], split[2:]
    else:
        if first.pos == SUFFIX or first.downstep is None:
            return None
        downstep, joined, rest = first.downstep, split[:1], split[1:]
    earlier_morae = sum(mora_count(part.kana) for part in joined)
    for part in rest:
        if downstep is None or part.pos == PREFIX:
            return None
        downstep = joined_downstep(part, earlier_morae, downstep)
        earlier_morae += mora_count(part.kana)
    return None if downstep is None else off_special_morae(split, downstep)


def compound_group(headword: str, reading: str, splits: list[tuple[Part, ...]]) -> CompoundGroup:
    return CompoundGroup(
        script(headword, reading),
        any(split[0].pos == PREFIX for split in splits),
        tuple(sorted({"P" if split[-1].pos == PREFIX else split[-1].combination for split in splits})),
        min(len(splits[0]), GROUPED_PART_COUNT),
    )


class CompoundSplitter:
    def __init__(self, parts: dict[str, frozenset[Part]]) -> None:
        self.parts = parts
        self.longest = max(len(spelling) for spelling in parts)

    def fewest_part_splits(self, headword: str, reading: str) -> list[tuple[Part, ...]]:
        if not worth_splitting(headword):
            return []
        reading = hiragana(reading)

        @lru_cache(maxsize=None)
        def splits_from(position: int, kana_position: int, depth: int) -> tuple[tuple[Part, ...], ...]:
            if position == len(headword):
                return ((),) if kana_position == len(reading) else ()
            if depth == MOST_PARTS:
                return ()
            found = []
            for end in range(position + 1, min(len(headword), position + self.longest) + 1):
                if depth == 0 and end == len(headword):
                    continue
                for part in self.parts.get(headword[position:end], ()):
                    if reading.startswith(part.kana, kana_position):
                        for rest in splits_from(end, kana_position + len(part.kana), depth + 1):
                            found.append((part, *rest))
            return tuple(found)

        splits = [
            split for split in splits_from(0, 0, 0)
            if len(split) >= 2 and len({part.spelling for part in split}) == len(split)
        ]
        fewest = min((len(split) for split in splits), default=0)
        return [split for split in splits if len(split) == fewest]

    def estimate(self, headword: str, reading: str) -> CompoundEstimate | None:
        splits = self.fewest_part_splits(headword, reading)
        downsteps = {compound_downstep(split) for split in splits} - {None}
        if len(downsteps) != 1:
            return None
        (downstep,) = downsteps
        return CompoundEstimate(downstep, compound_group(headword, reading, splits))
