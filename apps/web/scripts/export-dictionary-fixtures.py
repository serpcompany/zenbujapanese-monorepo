#!/usr/bin/env python3
"""Export local fixture rows for the word and kanji pages from the app's bundled data.

Local development uses seeded fixtures when no dictionary database is built (docs/agents/web.md).
The rows have the detail core's shapes (src/lib/dictionary/detail/rows.ts), read by the same
code the dictionary database's import uses (scripts/release-d1/dictionary/language_data.py), so
page code built on them reads the imported rows unchanged.

    python3 scripts/export-dictionary-fixtures.py [path/to/SearchExperience/Resources]

The directory defaults to the app's bundled resources, which must be real files rather than Git
LFS pointers (`git lfs pull`).
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT.parent / "ios/Modules/Sources/SearchExperience/Resources"
OUTPUT = ROOT / "src/lib/dictionary/fixtures"

sys.path.insert(0, str(ROOT / "scripts/release-d1/dictionary"))
from language_data import LanguageData  # noqa: E402

# The いる homographs and the words written with 要, as JMdict entry numbers.
ENTRY_NUMBERS = [
    1546640, 1577980, 1465580, 1391500, 1322180, 1587780,
    1609600, 2188720, 1546750, 1546680, 1546850, 1612150,
]
# Kanji with a fixture page.
KANJI = ["要"]
# Each fixture word's first examples: two pages' worth, so the page can load more.
EXAMPLES_PER_WORD = 50


def write(name, rows):
    """One row per line, so a regenerated fixture diffs by row. Biome leaves these files alone."""
    lines = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)
    (OUTPUT / name).write_text(f"[\n{lines}\n]\n", encoding="utf-8")


def export_example_meanings(data):
    """`example-meanings.json`: the first meaning of each word the fixture examples link to one
    entry, which Word Meanings shortens under the word, as the dictionary database reads it."""
    examples = json.loads((OUTPUT / "word-examples.json").read_text(encoding="utf-8"))
    linked = sorted({
        link["entSeqs"][0]
        for example in examples for link in example["links"] if len(link["entSeqs"]) == 1
    })
    rows = data.db.execute(
        f"SELECT CAST(source_record_id AS INTEGER), json_extract(senses_json, '$[0].meaning')"
        f" FROM entries WHERE CAST(source_record_id AS INTEGER) IN ({','.join('?' * len(linked))})",
        linked,
    ).fetchall()
    write("example-meanings.json", [
        {"entSeq": ent_seq, "meaning": meaning}
        for ent_seq, meaning in sorted(rows) if meaning is not None
    ])


def export_examples(resources):
    """The fixture words' examples, from the import's own precompute (build-examples.mts):
    `example-sentences.json`, `word-examples.json` (the first EXAMPLES_PER_WORD of each word),
    `example-counts.json`, whose `listed` counts only the examples kept, and `form-examples.json`
    (the first EXAMPLES_PER_WORD of each of their conjugated forms)."""
    with tempfile.TemporaryDirectory() as scratch:
        out = Path(scratch) / "examples.json"
        subprocess.run(
            ["pnpm", "exec", "tsx", "scripts/release-d1/dictionary/build-examples.mts",
             str(resources / "LanguageReferenceData.sqlite3"), str(resources), str(out),
             ",".join(map(str, ENTRY_NUMBERS))],
            cwd=ROOT, check=True,
            env={**os.environ, "NODE_OPTIONS": "--disable-warning=ExperimentalWarning"},
        )
        rows = json.loads(out.read_text(encoding="utf-8"))
    examples = [row for row in rows["word_examples"] if row["position"] < EXAMPLES_PER_WORD]
    forms = [row for row in rows["form_examples"] if row["position"] < EXAMPLES_PER_WORD]
    used = {row["sentenceId"] for row in examples + forms}
    write("example-sentences.json", [row for row in rows["example_sentences"] if row["id"] in used])
    write("word-examples.json", examples)
    write("form-examples.json", forms)
    write("example-counts.json", [
        {**row, "listed": min(row["listed"], EXAMPLES_PER_WORD)}
        for row in rows["word_example_counts"]
    ])


def main(resources):
    data = LanguageData(resources / "LanguageReferenceData.sqlite3", resources)
    by_number = {entry["entSeq"]: entry for entry, _ in data.entries(ENTRY_NUMBERS)}
    frequency = data.frequency()
    words = []
    for number in ENTRY_NUMBERS:
        if number not in by_number:
            print(f"Skipping entry {number}: not in LanguageReferenceData", file=sys.stderr)
            continue
        entry = by_number[number]
        words.append({
            "entry": entry,
            "frequency": frequency.get(entry["id"], []),
            "kanji": data.word_kanji(entry),
        })
    write("words.json", words)
    export_examples(resources)
    export_example_meanings(data)
    kanji = []
    for character in KANJI:
        if character not in data.kanji_by_character:
            print(f"Skipping kanji {character}: not in KanjiReferenceData", file=sys.stderr)
            continue
        kanji.append(data.kanji_rows(character))
    # Word rows, most of the data, go one per line in their own file, keyed by their kanji.
    write("kanji.json", [{k: v for k, v in rows.items() if k != "words"} for rows in kanji])
    write(
        "kanji-words.json",
        [{"kanji": rows["kanji"]["character"], **word} for rows in kanji for word in rows["words"]],
    )


if __name__ == "__main__":
    if len(sys.argv) > 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]) if len(sys.argv) == 2 else RESOURCES)
