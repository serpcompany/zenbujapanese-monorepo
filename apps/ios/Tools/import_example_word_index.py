#!/usr/bin/env python3

from __future__ import annotations

import re
import sqlite3
import tarfile
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

from language_data_tools import built_artifact, file_sha256, run_import


ARTIFACT_SCHEMA = "zenbu.example-word-index.v2"
JMDICT_SOURCE_IDENTITY = "edrdg.jmdict"
TATOEBA_SOURCE_IDENTITY = "tatoeba.weekly-export"
FORM_KINDS = (0, 1)
SENTENCES_PER_ENTRY = 200
ENTRIES_PER_WORD = 3
MINIMUM_PAIRS = 10
TIMES_CHANCE = 3
MEANT_SHARE = Fraction(1, 10)
MEANT_SCORE = Fraction(1, 200)
USED_SHARE = Fraction(1, 3)
USED_SCORE = Fraction(1, 20)
FIRST_MEANING_SHARE = Fraction(1, 20)
MEANT_FIRST, MEANT_LATER, USED_ONLY = range(3)

TOKEN_PATTERN = re.compile(
    r"^(?P<head>[^(\[{~]+)"
    r"(?:\((?:#(?P<sequence>\d+)|(?P<reading>[^)]+))\))?"
    r"(?:\[(?P<sense>\d+)\])?"
    r"(?:\{(?P<surface>[^}]+)\})?"
    r"(?P<checked>~)?$"
)
ENGLISH_WORD = re.compile(r"[0-9a-z]+(?:['-][0-9a-z]+)*")
WORD_AS_WRITTEN = re.compile(r"[0-9A-Za-z]+(?:['-][0-9A-Za-z]+)*")
SENTENCE_START = re.compile(r"""[.!?"'“‘]""")
LETTERS = re.compile(r"[a-z]+")


@dataclass(frozen=True)
class Entries:
    by_sequence: dict[int, bytes]
    kana_headword: set[bytes]
    common: set[bytes]
    headwords: dict[bytes, str]
    by_form: dict[str, set[bytes]]
    readings: dict[bytes, set[str]]
    primary_written: dict[bytes, str]
    fingerprint: dict[bytes, bytes]
    siblings: dict[bytes, list[bytes]]
    listed: dict[bytes, bytes]


def index_lines(source: Path) -> list[str]:
    with tarfile.open(source, "r:bz2") as archive:
        member = archive.getmember("jpn_indices.csv")
        extracted = archive.extractfile(member)
        if extracted is None:
            raise ValueError("jpn_indices.csv is missing from the archive")
        return extracted.read().decode("utf-8").splitlines()


def load_entries(database: sqlite3.Connection) -> Entries:
    by_sequence: dict[int, bytes] = {}
    kana_headword: set[bytes] = set()
    common: set[bytes] = set()
    headwords: dict[bytes, str] = {}
    fingerprint: dict[bytes, bytes] = {}
    for entry_id, sequence, headword, reading, semantic, is_common in database.execute(
        "SELECT id, source_record_id, headword, reading, semantic_fingerprint, is_common "
        "FROM entries WHERE source_identity = ?",
        (JMDICT_SOURCE_IDENTITY,),
    ):
        by_sequence[sequence] = entry_id
        fingerprint[entry_id] = semantic
        headwords[entry_id] = headword
        if headword == reading:
            kana_headword.add(entry_id)
        if is_common:
            common.add(entry_id)

    by_form: dict[str, set[bytes]] = defaultdict(set)
    readings: dict[bytes, set[str]] = defaultdict(set)
    primary_written: dict[bytes, str] = {}
    for entry_id, form, kind in database.execute(
        "SELECT entry_id, form, kind FROM forms WHERE kind IN (?, ?) ORDER BY rowid", FORM_KINDS
    ):
        by_form[form].add(entry_id)
        if kind == 1:
            readings[entry_id].add(form)
        else:
            primary_written.setdefault(entry_id, form)

    siblings: dict[bytes, list[bytes]] = defaultdict(list)
    for entry_id, semantic in fingerprint.items():
        siblings[semantic].append(entry_id)
    listed = {entry_id: min(group) for group in siblings.values() for entry_id in group}
    return Entries(
        by_sequence, kana_headword, common, headwords, by_form, readings, primary_written,
        fingerprint, siblings, listed,
    )


def is_kana(value: str) -> bool:
    return all("\u3041" <= c <= "\u30ff" for c in value)


def named_entries(token, entries: Entries) -> set[bytes]:
    found = entries.by_form.get(token["head"], set())
    if token["reading"]:
        found = {entry for entry in found if token["reading"] in entries.readings[entry]}
    return found


def written_first_as(head: str, found: set[bytes], entries: Entries) -> set[bytes]:
    return {entry for entry in found if entries.primary_written.get(entry, head) == head} or found


def the_one(found: set[bytes]) -> bytes | None:
    return next(iter(found)) if len(found) == 1 else None


def resolve(token, entries: Entries) -> bytes | None:
    if token["sequence"]:
        return entries.by_sequence.get(int(token["sequence"]))
    head = token["head"]
    found = named_entries(token, entries)
    if len(found) > 1:
        if is_kana(head):
            found = {entry for entry in found if entries.headwords[entry] == head}
        else:
            found = written_first_as(head, found, entries)
    return the_one(found)


def common_entry(token, entries: Entries) -> bytes | None:
    head = token["head"]
    if token["sequence"] or is_kana(head):
        return None
    return the_one(written_first_as(head, named_entries(token, entries) & entries.common, entries))


def load_pairs(database: sqlite3.Connection) -> dict[tuple[int, int], bytes]:
    return {
        (japanese_id, english_id): pair_id
        for pair_id, japanese_id, english_id in database.execute(
            "SELECT pair_id, source_japanese_record_id, source_english_record_id "
            "FROM example_sentence_provenance WHERE source_identity = ?",
            (TATOEBA_SOURCE_IDENTITY,),
        )
    }


def english_words(sentence: str) -> set[str]:
    return set(ENGLISH_WORD.findall(unicodedata.normalize("NFKC", sentence).lower()))


def names_in(sentences) -> set[str]:
    capitalized: set[str] = set()
    written_small: set[str] = set()
    for sentence in sentences:
        text = unicodedata.normalize("NFKC", sentence)
        end = None
        for match in WORD_AS_WRITTEN.finditer(text):
            starts_a_sentence = end is None or SENTENCE_START.search(text, end, match.start())
            end = match.end()
            if not starts_a_sentence:
                written = match.group()
                (capitalized if written[0].isupper() else written_small).add(written.lower())
    return capitalized - written_small


def without_marks(text: str) -> str:
    if text.isascii():
        return text
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def mentioned_words(gloss: str) -> set[str]:
    plain = without_marks(gloss)
    return set(LETTERS.findall(plain)) | set(ENGLISH_WORD.findall(plain))


def closing_parenthesis(notes: str) -> int | None:
    depth = 0
    for index, character in enumerate(notes):
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def is_notes(notes: str) -> bool:
    while (close := closing_parenthesis(notes)) is not None:
        notes = notes[close + 1 :]
        if not notes:
            return True
        if not notes.startswith(" ("):
            return False
        notes = notes[1:]
    return False


def meant_words(gloss: str) -> set[str]:
    words = set()
    for phrase in (gloss, gloss.removeprefix("to ")):
        word, parenthesis, notes = phrase.partition(" (")
        if ENGLISH_WORD.fullmatch(word) and (not parenthesis or is_notes("(" + notes)):
            words.add(word)
    return words


def load_meanings(
    database: sqlite3.Connection, entries: Entries, names: set[str]
) -> tuple[dict[str, dict[bytes, int]], dict[str, set[bytes]]]:
    meanings: dict[str, dict[bytes, int]] = defaultdict(dict)
    mentioning: dict[str, set[bytes]] = {name: set() for name in names}
    for entry_id, sense, gloss in database.execute(
        "SELECT entry_id, sense_order, normalized_text FROM gloss_atoms"
    ):
        entry = entries.listed.get(entry_id)
        if entry is None:
            continue
        for word in meant_words(gloss):
            meanings[word][entry] = min(sense, meanings[word].get(entry, sense))
        for name in mentioned_words(gloss) & names:
            mentioning[name].add(entry)
    return meanings, mentioning


def score(both: int, with_word: int, with_entry: int) -> Fraction:
    return Fraction(both * both, with_word * with_entry)


def is_kept(both: int, with_word: int, with_entry: int, pairs: int, meant: bool) -> bool:
    share, least = (MEANT_SHARE, MEANT_SCORE) if meant else (USED_SHARE, USED_SCORE)
    return (
        both >= MINIMUM_PAIRS
        and both * pairs >= TIMES_CHANCE * with_word * with_entry
        and Fraction(both, with_word) >= share
        and score(both, with_word, with_entry) >= least
    )


def standing(sense: int | None) -> int:
    if sense is None:
        return USED_ONLY
    return MEANT_FIRST if sense == 0 else MEANT_LATER


def uses_a_first_meaning(found: Counter, with_word: int, meant: dict[bytes, int]) -> bool:
    return any(
        sense == 0 and Fraction(found[entry], with_word) >= FIRST_MEANING_SHARE
        for entry, sense in meant.items()
    )


def kept_entries(
    found: Counter, with_word: int, with_entry: Counter, pairs: int, meant: dict[bytes, int]
) -> list[tuple[bytes, int]]:
    first_meanings_only = uses_a_first_meaning(found, with_word, meant)
    kept = [
        (entry, both)
        for entry, both in found.items()
        if (meant.get(entry) == 0 or not first_meanings_only)
        and is_kept(both, with_word, with_entry[entry], pairs, entry in meant)
    ]

    def order(kept_entry: tuple[bytes, int]) -> tuple:
        entry, both = kept_entry
        place = standing(meant.get(entry))
        strength = score(both, with_word, with_entry[entry]) if place == USED_ONLY else both
        return (place, -strength, -both, entry)

    return sorted(kept, key=order)[:ENTRIES_PER_WORD]


def about_the_name(found: Counter, meant: dict[bytes, int], mentioning: set[bytes]) -> Counter:
    return Counter(
        {entry: both for entry, both in found.items() if entry in meant or entry in mentioning}
    )


def word_entry_rows(
    pair_entries: dict[bytes, set[bytes]],
    pair_words: dict[bytes, set[str]],
    meanings: dict[str, dict[bytes, int]],
    mentioning_names: dict[str, set[bytes]],
) -> list[tuple]:
    pairs = len(pair_entries)
    with_word = Counter(word for words in pair_words.values() for word in words)
    with_entry = Counter(entry for found in pair_entries.values() for entry in found)
    both: dict[str, Counter] = defaultdict(Counter)
    for pair, found in pair_entries.items():
        for word in pair_words[pair]:
            if with_word[word] >= MINIMUM_PAIRS:
                both[word].update(found)

    rows = []
    for word in sorted(both):
        meant = meanings.get(word, {})
        found = both[word]
        if word in mentioning_names:
            found = about_the_name(found, meant, mentioning_names[word])
        kept = kept_entries(found, with_word[word], with_entry, pairs, meant)
        rows.extend(
            (word, place, entry, count, with_word[word], with_entry[entry], meant.get(entry))
            for place, (entry, count) in enumerate(kept)
        )
    return rows


def import_index(source: Path, source_manifest: dict, language_data: Path, output: Path) -> dict:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("jpn_indices archive does not match its pinned SHA-256")

    database = sqlite3.connect(f"file:{language_data}?mode=ro", uri=True)
    try:
        entries = load_entries(database)
        pairs = load_pairs(database)
        japanese_lengths = dict(
            database.execute("SELECT id, length(japanese) FROM example_sentences")
        )
        english = dict(database.execute("SELECT id, english FROM example_sentences"))
        meanings, mentioning_names = load_meanings(database, entries, names_in(english.values()))
    finally:
        database.close()

    lines = index_lines(source)
    tokens_seen = tokens_resolved = tokens_named_by_common_entry = unpaired_lines = 0
    links: dict[bytes, dict[bytes, tuple[bool, str]]] = defaultdict(dict)
    pair_entries: dict[bytes, set[bytes]] = defaultdict(set)
    for line in lines:
        japanese_id, english_id, body = line.split("\t", 2)
        pair_id = pairs.get((int(japanese_id), int(english_id)))
        if pair_id is None:
            unpaired_lines += 1
            continue
        for raw in body.split(" "):
            match = TOKEN_PATTERN.match(raw)
            if not match or not raw:
                continue
            tokens_seen += 1
            entry = resolve(match, entries)
            named = common_entry(match, entries) if entry is None else entry
            if named is not None:
                pair_entries[pair_id].add(entries.listed[named])
            if entry is None:
                tokens_named_by_common_entry += named is not None
                continue
            tokens_resolved += 1
            if entry not in entries.kana_headword:
                continue
            surface = match["surface"] or match["head"]
            checked = match["checked"] is not None
            for linked in entries.siblings[entries.fingerprint[entry]]:
                previous = links[linked].get(pair_id)
                if previous is None or (checked and not previous[0]):
                    links[linked][pair_id] = (checked, surface)

    rows = []
    for entry, sentences in links.items():
        ranked = sorted(
            sentences.items(),
            key=lambda item: (not item[1][0], japanese_lengths[item[0]], item[0]),
        )[:SENTENCES_PER_ENTRY]
        rows.extend((entry, pair_id, surface) for pair_id, (_, surface) in ranked)
    rows.sort()
    pair_words = {pair_id: english_words(english[pair_id]) for pair_id in pair_entries}
    word_rows = word_entry_rows(pair_entries, pair_words, meanings, mentioning_names)

    temporary = output.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    artifact = sqlite3.connect(temporary)
    try:
        artifact.executescript(
            """
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE entry_sentences (
              entry_id BLOB NOT NULL,
              pair_id BLOB NOT NULL,
              surface TEXT NOT NULL,
              PRIMARY KEY (entry_id, pair_id)
            ) WITHOUT ROWID;
            CREATE TABLE english_word_entries (
              word TEXT NOT NULL,
              place INTEGER NOT NULL,
              entry_id BLOB NOT NULL,
              pairs_with_both INTEGER NOT NULL,
              pairs_with_word INTEGER NOT NULL,
              pairs_with_entry INTEGER NOT NULL,
              meant_in_sense INTEGER,
              PRIMARY KEY (word, place)
            ) WITHOUT ROWID;
            """
        )
        language_data_sha256 = file_sha256(language_data)
        artifact.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            (
                ("artifact_schema", ARTIFACT_SCHEMA),
                ("source_identity", "tatoeba.jpn-indices"),
                ("source_sha256", source_manifest["sha256"]),
                ("language_data_sha256", language_data_sha256),
                ("sentences_per_entry", str(SENTENCES_PER_ENTRY)),
                ("entries_per_word", str(ENTRIES_PER_WORD)),
                ("annotated_pairs", str(len(pair_entries))),
            ),
        )
        artifact.executemany(
            "INSERT INTO entry_sentences(entry_id, pair_id, surface) VALUES (?, ?, ?)", rows
        )
        artifact.executemany(
            "INSERT INTO english_word_entries VALUES (?, ?, ?, ?, ?, ?, ?)", word_rows
        )
        artifact.commit()
        artifact.execute("VACUUM")
    finally:
        artifact.close()
    temporary.replace(output)

    return {
        "identity": "tatoeba-jpn-indices-to-zenbu-example-word-index-v2",
        "artifact_schema": ARTIFACT_SCHEMA,
        "index_lines": len(lines),
        "index_lines_without_bundled_pair": unpaired_lines,
        "tokens": tokens_seen,
        "tokens_resolved_to_one_entry": tokens_resolved,
        "kana_headword_entries_linked": len(links),
        "entry_sentence_rows": len(rows),
        "sentences_per_entry": SENTENCES_PER_ENTRY,
        "annotated_pairs": len(pair_entries),
        "tokens_named_by_their_one_common_entry": tokens_named_by_common_entry,
        "english_words": len({word for words in pair_words.values() for word in words}),
        "english_words_with_entries": len({row[0] for row in word_rows}),
        "english_names_with_entries": len({row[0] for row in word_rows} & set(mentioning_names)),
        "english_word_entry_rows": len(word_rows),
        "entries_per_word": ENTRIES_PER_WORD,
        "english_word_entry_kept_when": {
            "pairs_with_both_at_least": MINIMUM_PAIRS,
            "times_chance_at_least": TIMES_CHANCE,
            "meant_by_the_entry": {
                "share_of_the_words_pairs": str(MEANT_SHARE),
                "score": str(MEANT_SCORE),
            },
            "used_without_meaning_it": {
                "share_of_the_words_pairs": str(USED_SHARE),
                "score": str(USED_SCORE),
            },
            "only_first_meanings_once_one_reaches_share": str(FIRST_MEANING_SHARE),
            "a_name_only_an_entry_that_means_or_mentions_it": True,
        },
        "retained_fields": [
            "sentence-to-entry links",
            "surface form in the sentence",
            "the entries an English word's sentence pairs use, with their counts",
        ],
        "excluded_fields": [
            "sense numbers",
            "sentence links of kanji-headword entries",
            "unresolved tokens",
        ],
        "source_sha256": source_manifest["sha256"],
        "language_data_sha256": language_data_sha256,
        **built_artifact(Path(__file__), output),
    }


def main() -> None:
    run_import(
        lambda arguments, source_manifest: import_index(
            arguments.source, source_manifest, arguments.language_data, arguments.output
        ),
        "--language-data",
    )


if __name__ == "__main__":
    main()
