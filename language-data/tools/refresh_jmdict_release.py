from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from pinned_release import pinned_releases
from releases_index import release_key

TOOLS = Path(__file__).resolve().parent
LANGUAGE_DATA = TOOLS.parent
RESOURCES = LANGUAGE_DATA.parent / "apps/ios/Modules/Sources/SearchExperience/Resources"
DATABASE = RESOURCES / "LanguageReferenceData.sqlite3"
NOTE_TEST = TOOLS / "tests/test_note_identity_contract.py"
RELEASE_FILE = LANGUAGE_DATA / "release.json"
RELEASES = LANGUAGE_DATA / "releases"
CONFORMANCE = LANGUAGE_DATA / "conformance"
PINNED_ENTRIES = re.compile(r"^RELEASED_ENTRIES = [\d_]+\n", re.MULTILINE)
PINNED_DIGEST = re.compile(r'^RELEASED_NOTE_IDENTITIES = \(\n    "[0-9a-f]{64}"\n\)\n', re.MULTILINE)
CHANGED_NOTE_IDENTITIES = (
    "SELECT count(*) FROM previous.entries o JOIN main.entries e USING (id) WHERE e.note_identity <> o.note_identity"
)
SUDACHI_DICTIONARY = "system_core.dic"
RECORDED_ON_A_MAC = {
    "search-retrieval": "SearchConformanceTests",
    "search-results": "SearchResultsConformanceTests",
    "example-search": "ExampleSearchConformanceTests",
    "word-detail": "WordDetailConformanceTests",
    "kanji-detail": "KanjiDetailConformanceTests",
    "kanji-element": "KanjiElementConformanceTests",
    "sentence-search": "SentenceSearchConformanceTests",
    "sentence-results": "SentenceResultsConformanceTests",
}
RECORDED_WITHOUT_A_MAC = {
    "tokenizer": "`pnpm --filter zenbujapanese-dictionary-api tokenizer-suite`, from kuromoji.js",
    "romaji": "by hand",
    "sudachi-pack": "by hand",
}


def note_identities(database: Path) -> tuple[int, str]:
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    digest = hashlib.sha256()
    entries = 0
    try:
        for entry_id, identity in connection.execute("SELECT lower(hex(id)), note_identity FROM entries ORDER BY id"):
            digest.update(f"{entry_id} {identity}\n".encode())
            entries += 1
    finally:
        connection.close()
    return entries, digest.hexdigest()


def changed_note_identities(previous: Path, current: Path) -> int:
    connection = sqlite3.connect(f"file:{current}?mode=ro", uri=True)
    try:
        connection.execute("ATTACH DATABASE ? AS previous", (f"file:{previous}?mode=ro",))
        (changed,) = connection.execute(CHANGED_NOTE_IDENTITIES).fetchone()
    finally:
        connection.close()
    return changed


def keep_note_identities(previous: Path, current: Path = DATABASE, test: Path = NOTE_TEST) -> tuple[int, str]:
    changed = changed_note_identities(previous, current)
    if changed:
        raise SystemExit(
            f"Entries the previous language data held have another note_identity now ({changed:,}), so the "
            "notes earlier versions saved under them would lose their word. The importer keeps each one "
            "(language-data/tools/README.md, Refresh a source snapshot): find why it didn't."
        )
    entries, digest = note_identities(current)
    text = test.read_text(encoding="utf-8")
    text, entries_found = PINNED_ENTRIES.subn(f"RELEASED_ENTRIES = {entries:_}\n", text)
    text, digest_found = PINNED_DIGEST.subn(f'RELEASED_NOTE_IDENTITIES = (\n    "{digest}"\n)\n', text)
    if (entries_found, digest_found) != (1, 1):
        raise SystemExit(f"{test.name} holds no RELEASED_ENTRIES and RELEASED_NOTE_IDENTITIES to pin again")
    test.write_text(text, encoding="utf-8")
    return entries, digest


def next_release(releases: Path, today: date) -> str:
    month = (today.year, today.month)
    pinned = pinned_releases(releases)
    later = [release for release in pinned if release_key(release)[:2] > month]
    if later:
        raise SystemExit(f"release {later[-1]} is pinned for a month after {today:%Y-%m}")
    number = max((release_key(release)[2] for release in pinned if release_key(release)[:2] == month), default=0)
    return f"{today:%Y.%m}.{number + 1}"


def start_release(today: date, releases: Path = RELEASES, release_file: Path = RELEASE_FILE) -> str:
    release = next_release(releases, today)
    release_file.write_text(json.dumps({"release": release}, indent=2) + "\n", encoding="utf-8")
    return release


def suite_pins(suite: dict) -> list[dict]:
    pins = suite.get("artifacts") or ([suite["artifact"]] if suite.get("artifact") else [])
    return [pin for pin in pins if pin["name"] != SUDACHI_DICTIONARY]


def stale_suites(conformance: Path = CONFORMANCE, resources: Path = RESOURCES) -> dict[str, list[str]]:
    stale = {}
    for path in sorted(conformance.glob("*.json")):
        changed = [
            pin["name"]
            for pin in suite_pins(json.loads(path.read_text(encoding="utf-8")))
            if hashlib.sha256((resources / pin["name"]).read_bytes()).hexdigest() != pin["sha256"]
        ]
        if changed:
            stale[path.stem] = changed
    return stale
