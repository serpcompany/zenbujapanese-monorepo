from __future__ import annotations

import csv
import hashlib
import io
import json
import lzma
import math
import re
import unicodedata
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from import_frequency_pack import UNIDIC_LEXICON, mapped_database, source_reading

CONTENT_PARTS_OF_SPEECH = ("名詞-普通名詞", "動詞-一般", "形容詞-一般", "形状詞-一般", "副詞")
BASE_FORMS = {"*", "終止形-一般"}
READ_COLUMNS = 15
MARGIN = 10
TOGETHER = 3
KANA = re.compile(r"^[ぁ-ゖァ-ヺー]+$")

SourceRow = tuple[int, str, int, str, str]
Ranks = list[int | None]


def nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


def hiragana(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def part_of_speech(record: list[str]) -> str:
    return "-".join(part for part in record[4:8] if part and part != "*")


def lexicon_records(archive: Path) -> Iterator[list[str]]:
    with zipfile.ZipFile(archive) as opened, opened.open(UNIDIC_LEXICON) as raw:
        yield from csv.reader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))


@dataclass
class Lexicon:
    rows: dict[tuple[str, str], list[tuple[str, int, str]]]
    owners: dict[str, tuple[int, str, str, str]]
    surfaces: set[str]
    asked_lemmas: set[tuple[str, str]] = field(default_factory=set)
    asked_owners: set[str] = field(default_factory=set)
    found_surfaces: set[str] = field(default_factory=set)

    def lemma_rows(self, lemma: str, pos: str) -> list[tuple[str, int, str]]:
        self.asked_lemmas.add((lemma, pos))
        return self.rows.get((lemma, pos), [])

    def owner(self, surface: str) -> tuple[int, str, str, str]:
        self.asked_owners.add(surface)
        return self.owners[surface]

    def is_surface(self, text: str) -> bool:
        if text not in self.surfaces:
            return False
        self.found_surfaces.add(text)
        return True

    def consulted(self, record: list[str], shown: set[str]) -> bool:
        base = record[9] in BASE_FORMS
        if base and ((record[11], part_of_speech(record)) in self.asked_lemmas or nfkc(record[0]) in self.asked_owners):
            shown.update((nfkc(record[0]), nfkc(record[14])))
            return True
        unshown = ({nfkc(record[0]), nfkc(record[14])} & self.found_surfaces) - shown
        shown.update(unshown)
        return bool(unshown)


def read_lexicon(archive: Path, keys: set[tuple[str, str]]) -> Lexicon:
    rows: dict[tuple[str, str], list[tuple[str, int, str]]] = {}
    owners: dict[str, tuple[int, str, str, str]] = {}
    surfaces: set[str] = set()
    for record in lexicon_records(archive):
        surface = nfkc(record[0])
        surfaces.update((surface, nfkc(record[14])))
        if record[9] not in BASE_FORMS:
            continue
        pos = part_of_speech(record)
        cost = int(record[3])
        if surface not in owners or cost < owners[surface][0]:
            owners[surface] = (cost, record[11], pos, record[10])
        if (record[11], pos) in keys:
            rows.setdefault((record[11], pos), []).append((surface, cost, record[10]))
    return Lexicon(rows, owners, surfaces)


def write_excerpt(archive: Path, lexicon: Lexicon, output: Path) -> int:
    count = 0
    shown: set[str] = set()
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        for record in lexicon_records(archive):
            if lexicon.consulted(record, shown):
                writer.writerow(record[:READ_COLUMNS])
                count += 1
    return count


@dataclass
class Jiten:
    lists: list[str]
    bottoms: list[int]
    ranks: dict[tuple[str, str], Ranks]
    forms: dict[str, list[tuple[str, Ranks]]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for (word, form), ranks in self.ranks.items():
            self.forms.setdefault(word, []).append((form, ranks))

    def filled(self, ranks: Ranks) -> list[int]:
        return [rank if rank is not None else bottom for rank, bottom in zip(ranks, self.bottoms)]

    def combined(self, rank_lists: list[Ranks]) -> Ranks:
        result: Ranks = []
        for index in range(len(self.lists)):
            observed = [ranks[index] for ranks in rank_lists if ranks[index] is not None]
            result.append(round(1 / math.fsum(1 / rank for rank in observed)) if observed else None)
        return result

    def geo(self, ranks: Ranks) -> float:
        values = self.filled(ranks)
        return math.exp(math.fsum(math.log(value) for value in values) / len(values))

    def ratio(self, leader: Ranks, other: Ranks) -> float:
        return min(o / b for b, o in zip(self.filled(leader), self.filled(other)))


def read_jiten(record_path: Path) -> Jiten:
    record = json.loads(record_path.read_text(encoding="utf-8"))
    lists = list(record["files"])
    bottoms = []
    ranks: dict[tuple[str, str], Ranks] = {}
    for index, name in enumerate(lists):
        spec = record["files"][name]
        data = lzma.decompress((record_path.parent / spec["file"]).read_bytes())
        if hashlib.sha256(data).hexdigest() != spec["csvSHA256"]:
            raise ValueError(f"{spec['file']} isn't the list {record_path.name} pins")
        header, *listed = csv.reader(io.StringIO(data.decode("utf-8")))
        if header != ["Word", "Form", "Rank"]:
            raise ValueError(f"{spec['file']}: expected Word,Form,Rank")
        bottom = max(int(rank) for _, _, rank in listed)
        bottoms.append(bottom)
        for word, form, rank in listed:
            if int(rank) == bottom:
                continue
            slots = ranks.setdefault((word, form), [None] * len(lists))
            current = slots[index]
            slots[index] = int(rank) if current is None else min(current, int(rank))
    return Jiten(lists, bottoms, ranks)


def reading_ranks(jiten: Jiten, lexicon: Lexicon, form: str, pos: str) -> dict[str, Ranks]:
    rows = lexicon.lemma_rows(form, pos)
    evidence = {}
    for lform in sorted({lform for _, _, lform in rows}):
        reading = source_reading(form, lform)
        owned = {surface for surface, _, own in rows if own == lform and lexicon.owner(surface)[1:] == (form, pos, lform)}
        keys = set()
        for word in sorted(owned | {form}):
            keys.add((word, reading))
            if KANA.match(word):
                keys.update(((word, word), (word, hiragana(word))))
        evidence[reading] = jiten.combined([jiten.ranks[key] for key in sorted(keys) if key in jiten.ranks])
    return evidence


def leading(jiten: Jiten, ranks: dict[str, Ranks]) -> tuple[str, str, float]:
    best, *others = sorted(ranks, key=lambda reading: jiten.geo(ranks[reading]))
    margin, closest = min((jiten.ratio(ranks[best], ranks[other]), other) for other in others)
    return best, closest, margin


def reads_as(word: str, form: str, lemma: str, reading: str) -> bool:
    start = word.find(lemma)
    before, after = word[:start], word[start + len(lemma):]
    form = hiragana(form)
    if before and KANA.match(before):
        if not form.startswith(hiragana(before)):
            return False
        positions: range | list[int] = [len(before)]
    else:
        positions = range(1, len(form)) if before else [0]
    for position in positions:
        rest = form[position + len(reading):]
        if form[position:position + len(reading)] != reading or bool(after) != bool(rest):
            continue
        if after and KANA.match(after) and rest != hiragana(after):
            continue
        return True
    return False


def split_by_unidic(word: str, lemma: str, lexicon: Lexicon) -> bool:
    start = word.find(lemma)
    before, after = word[:start], word[start + len(lemma):]
    if word == lemma or word.count(lemma) != 1 or lexicon.is_surface(word):
        return False
    for i in range(len(before)):
        for j in range(1, len(lemma) + 1):
            if lexicon.is_surface(before[i:] + lemma[:j]):
                return False
    for j in range(len(lemma)):
        for k in range(1, len(after) + 1):
            if lexicon.is_surface(lemma[j:] + after[:k]):
                return False
    return True


@dataclass
class Review:
    jiten: Jiten
    lexicon: Lexicon
    language_data: Path
    mapping_sql: Path

    def expressions(self, form: str, best: str, others: list[str], words: list[str]) -> list[tuple[float, str, Ranks]]:
        found = []
        for word in words:
            read_otherwise = []
            for written, ranks in self.jiten.forms[word]:
                if reads_as(word, written, form, best):
                    continue
                uses = [other for other in others if reads_as(word, written, form, other)]
                if uses:
                    read_otherwise.append((self.jiten.geo(ranks), uses[0], ranks))
            if read_otherwise and split_by_unidic(word, form, self.lexicon):
                found.extend(read_otherwise)
        return sorted(found, key=lambda item: item[0])

    def together(self, ranks: dict[str, Ranks], best: str, found: list[tuple[float, str, Ranks]]) -> tuple[float, str]:
        return min(
            (
                self.jiten.ratio(ranks[best], self.jiten.combined([ranks[other], *(r for _, use, r in found if use == other)])),
                other,
            )
            for other in ranks
            if other != best
        )

    def preferred(self, form: str, pos: str) -> str | None:
        costs: dict[str, int] = {}
        for surface, cost, lform in self.lexicon.lemma_rows(form, pos):
            if surface == form:
                reading = source_reading(form, lform)
                costs[reading] = min(costs.get(reading, cost), cost)
        return min(costs, key=lambda reading: costs[reading]) if costs else None

    def entries(self, rows: list[SourceRow], readings: dict[int, str]) -> dict[int, int]:
        chosen = [row for row in rows if row[0] in readings]
        database = mapped_database(chosen, [readings[row[0]] for row in chosen], self.mapping_sql, self.language_data)
        try:
            return dict(
                database.execute(
                    "SELECT e.rank, l.source_record_id FROM eligible e "
                    "JOIN language.entries l ON l.id = e.id"
                )
            )
        finally:
            database.close()


def first_verdicts(review: Review, row: SourceRow, ranks: dict[str, Ranks]) -> dict[str, object]:
    _, form, _, pos, _ = row
    if not pos.startswith(CONTENT_PARTS_OF_SPEECH):
        return {"rule": "leave", "gate": "part of speech"}
    if len(ranks) < 2:
        return {"rule": "leave", "gate": "readings"}
    best, closest, margin = leading(review.jiten, ranks)
    verdict: dict[str, object] = {"rule": "leave", "gate": "margin", "reading": best, "closest": closest, "margin": round(margin, 2)}
    if margin < MARGIN:
        return verdict
    spelled = {reading: review.jiten.ranks.get((form, reading), [None] * len(review.jiten.lists)) for reading in ranks}
    spelled_best, _, own = leading(review.jiten, spelled)
    verdict.update(gate="own spelling", ownSpelling=round(own, 2) if spelled_best == best else 0)
    if spelled_best != best or own < MARGIN:
        return verdict
    verdict["gate"] = "expression"
    return verdict


def words_containing(jiten: Jiten, lemmas: set[str]) -> dict[str, list[str]]:
    starts: dict[str, list[str]] = {lemma[0]: [] for lemma in lemmas}
    for word in jiten.forms:
        for character in set(word) & starts.keys():
            starts[character].append(word)
    return {lemma: [word for word in starts[lemma[0]] if lemma in word] for lemma in lemmas}


def later_verdicts(review: Review, rows: list[SourceRow], verdicts: dict[int, dict], evidence: dict[int, dict]) -> None:
    pending = [row for row in rows if verdicts[row[0]]["gate"] == "expression"]
    words = words_containing(review.jiten, {row[1] for row in pending})
    for rank, form, _, pos, _ in pending:
        verdict, ranks = verdicts[rank], evidence[rank]
        best = str(verdict["reading"])
        found = review.expressions(form, best, [r for r in ranks if r != best], words[form])
        single = round(found[0][0] / review.jiten.geo(ranks[best]), 2) if found else None
        verdict["expression"] = single
        if single is not None and single < MARGIN:
            continue
        together, _ = review.together(ranks, best, found)
        verdict.update(gate="expressions together", expressions=round(together, 2))
        if together < TOGETHER:
            continue
        preferred = review.preferred(form, pos)
        verdict.update(gate="UniDic", unidic=preferred)
        if preferred == best:
            verdict["gate"] = "entries"
    placed = review.entries(rows, {rank: str(v["reading"]) for rank, v in verdicts.items() if v["gate"] == "entries"})
    for rank, verdict in verdicts.items():
        if verdict["gate"] == "entries":
            verdict["entry"] = placed.get(rank)
            if verdict["entry"] is not None:
                verdict.update(rule="rank", gate=None)


def review_rows(review: Review, rows: list[SourceRow]) -> dict[int, dict[str, object]]:
    evidence = {row[0]: reading_ranks(review.jiten, review.lexicon, row[1], row[3]) for row in rows}
    verdicts = {row[0]: first_verdicts(review, row, evidence[row[0]]) for row in rows}
    later_verdicts(review, rows, verdicts, evidence)
    return {rank: {"jiten": evidence[rank], "verdict": verdicts[rank]} for rank in evidence}
