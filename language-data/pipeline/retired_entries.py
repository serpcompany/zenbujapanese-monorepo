from __future__ import annotations

import json
from pathlib import Path

from pinned_release import load_pinned, pinned_releases
from refusal import Refusal
from releases_index import release_key
from sqlite_files import ent_seq_sha256

RETIRED_SCHEMA = "zenbu.retired-entries.v1"
CHANGES_SCHEMA = "zenbu.ent-seq-changes.v1"
CHANGES_FILE = "ent-seq-changes.json"
HOW_TO_RETIRE = "Run package.py retire (language-data/README.md, Retired entries)."


def document_bytes(document: dict) -> bytes:
    return (json.dumps(document, indent=2, ensure_ascii=False) + "\n").encode()


def changes_path(releases: Path, release: str) -> Path:
    return releases / release / CHANGES_FILE


def earlier_releases(releases: Path, release: str) -> list[str]:
    return [
        pinned for pinned in pinned_releases(releases) if release_key(pinned) < release_key(release)
    ]


def load_changes(releases: Path, release: str, previous: str) -> dict:
    path = changes_path(releases, release)
    if not path.is_file():
        raise Refusal(f"release {release} has no {path}, its entries' changes since {previous}")
    changes = json.loads(path.read_text())
    if changes.get("schema") != CHANGES_SCHEMA or changes.get("release") != release:
        raise Refusal(f"{path} isn't release {release}'s {CHANGES_SCHEMA}")
    if changes.get("previous_release") != previous:
        raise Refusal(f"{path} follows {changes.get('previous_release')!r}, not {previous}")
    return changes


def release_steps(releases: Path, release: str) -> list[tuple[str, dict]]:
    chain = [*earlier_releases(releases, release), release]
    first = changes_path(releases, chain[0])
    if first.exists():
        raise Refusal(
            f"{first}: release {chain[0]} is the first pinned, so nothing comes before it"
        )
    return [
        (later, load_changes(releases, later, earlier)) for earlier, later in zip(chain, chain[1:])
    ]


def entry_changes(
    release: str,
    previous: str,
    before: dict[int, tuple[str, str]],
    after: dict[int, tuple[str, str]],
) -> dict:
    forms = forms_index(after)
    return {
        "schema": CHANGES_SCHEMA,
        "release": release,
        "previous_release": previous,
        "dropped": [
            {
                "ent_seq": ent_seq,
                "headword": before[ent_seq][0],
                "reading": before[ent_seq][1],
                "replacement": replacement(before[ent_seq], forms),
            }
            for ent_seq in sorted(before.keys() - after.keys())
        ],
        "added": sorted(after.keys() - before.keys()),
    }


def forms_index(entries: dict[int, tuple[str, str]]) -> dict[tuple[str, str], list[int]]:
    index: dict[tuple[str, str], list[int]] = {}
    for ent_seq, form in entries.items():
        index.setdefault(form, []).append(ent_seq)
    return index


def replacement(form: tuple[str, str], forms: dict[tuple[str, str], list[int]]) -> int | None:
    matches = forms.get(form, [])
    return matches[0] if len(matches) == 1 else None


def derive(steps: list[tuple[str, dict]]) -> list[dict]:
    retired: dict[int, dict] = {}
    for release, changes in steps:
        dropped = {entry["ent_seq"]: entry["replacement"] for entry in changes["dropped"]}
        for entry in retired.values():
            if entry["replacement"] in dropped:
                entry["replacement"] = dropped[entry["replacement"]]
        for ent_seq, target in dropped.items():
            retired[ent_seq] = {"ent_seq": ent_seq, "retired_in": release, "replacement": target}
        for ent_seq in changes["added"]:
            retired.pop(ent_seq, None)
    return [retired[ent_seq] for ent_seq in sorted(retired)]


def retired_document(steps: list[tuple[str, dict]], language_sha256: str) -> dict:
    return {
        "schema": RETIRED_SCHEMA,
        "language_data_sha256": language_sha256,
        "entries": derive(steps),
    }


def check_history(
    releases: Path, steps: list[tuple[str, dict]], current: dict[int, tuple[str, str]]
) -> None:
    held = set(current)
    previous = [changes["previous_release"] for _, changes in steps]
    for (release, changes), earlier in reversed(list(zip(steps, previous))):
        dropped = {entry["ent_seq"]: entry["replacement"] for entry in changes["dropped"]}
        added = set(changes["added"])
        problems = sorted(set(dropped) & held) + sorted(added - held)
        lost = sorted(
            target for target in dropped.values() if target is not None and target not in held
        )
        if problems or lost:
            raise Refusal(
                f"{changes_path(releases, release)} drops entries {release} holds or adds ones it "
                f"doesn't ({problems}), or replaces with entries it doesn't hold ({lost}). "
                + HOW_TO_RETIRE
            )
        held = (held - added) | set(dropped)
        expected = load_pinned(releases, earlier)["ids"]["ent_seq_sha256"]
        if ent_seq_sha256(held) != expected:
            raise Refusal(
                f"{changes_path(releases, release)} doesn't turn {release}'s entries into "
                f"{earlier}'s: they'd have SHA-256 {ent_seq_sha256(held)}, and {earlier} pins "
                f"{expected}. " + HOW_TO_RETIRE
            )


def check_replacements(steps: list[tuple[str, dict]], current: dict[int, tuple[str, str]]) -> None:
    if not steps:
        return
    release, changes = steps[-1]
    forms = forms_index(current)
    wrong = [
        entry["ent_seq"]
        for entry in changes["dropped"]
        if entry["replacement"] != replacement((entry["headword"], entry["reading"]), forms)
    ]
    if wrong:
        raise Refusal(
            f"release {release} replaces {wrong} with entries other than the one entry it holds "
            "with the same headword and reading, or none. " + HOW_TO_RETIRE
        )


def check_retired_entries(
    releases: Path,
    release: str,
    document: object,
    current: dict[int, tuple[str, str]],
    language_sha256: str,
) -> list[tuple[str, dict]]:
    steps = release_steps(releases, release)
    check_history(releases, steps, current)
    check_replacements(steps, current)
    expected = retired_document(steps, language_sha256)
    if document != expected:
        raise Refusal(
            "the retired-entries file isn't what the releases' entry changes make for "
            f"{language_sha256}. " + HOW_TO_RETIRE
        )
    return steps
