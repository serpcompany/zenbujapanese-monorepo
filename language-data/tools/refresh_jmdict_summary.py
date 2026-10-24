from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from jmdict_previous import COMPARED_COLUMNS
from refresh_jmdict_release import RECORDED_ON_A_MAC, RECORDED_WITHOUT_A_MAC

SHOWN_PER_KIND = 4
COMMON_FIRST = "ORDER BY e.is_common DESC, e.rank_score DESC, e.source_record_id"
ANY_STORED_FIELD = " OR ".join(f"e.{column} IS NOT o.{column}" for column in COMPARED_COLUMNS)
SITE = "https://zenbujapanese.com"


@dataclass(frozen=True)
class Kind:
    label: str
    differs: str
    shown: str


CHANGED = Kind("Changed in any stored field", ANY_STORED_FIELD, "e.headword")
KINDS = (
    Kind("…meanings changed", "e.senses_json IS NOT o.senses_json", "e.headword"),
    Kind(
        "…number of meanings changed",
        "json_array_length(e.senses_json) <> json_array_length(o.senses_json)",
        "e.headword || ' ' || json_array_length(o.senses_json) || ' → ' || json_array_length(e.senses_json)",
    ),
    Kind(
        "…forms changed",
        "e.written_forms_json IS NOT o.written_forms_json OR e.reading_forms_json IS NOT o.reading_forms_json",
        "e.headword",
    ),
    Kind(
        "…headword or reading changed",
        "e.headword IS NOT o.headword OR e.reading IS NOT o.reading",
        "CASE WHEN e.headword IS o.headword THEN e.headword || ' (' || o.reading || ' → ' || e.reading || ')' "
        "ELSE o.headword || ' → ' || e.headword END",
    ),
    Kind("…newly common", "e.is_common > o.is_common", "e.headword"),
    Kind("…no longer common", "e.is_common < o.is_common", "e.headword"),
)


@dataclass(frozen=True)
class Counted:
    label: str
    count: int
    shown: list[str]


def opened(previous: Path, current: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{current}?mode=ro", uri=True)
    connection.execute("ATTACH DATABASE ? AS previous", (f"file:{previous}?mode=ro",))
    return connection


def counted(connection: sqlite3.Connection, label: str, joined: str, shown: str, entry: str = "e") -> Counted:
    (count,) = connection.execute(f"SELECT count(*) {joined}").fetchone()
    order = COMMON_FIRST.replace("e.", f"{entry}.")
    rows = connection.execute(f"SELECT {shown} {joined} {order} LIMIT {SHOWN_PER_KIND}").fetchall()
    return Counted(label, count, [row[0] for row in rows])


def entry_changes(connection: sqlite3.Connection) -> list[Counted]:
    added = "FROM main.entries e LEFT JOIN previous.entries o USING (id) WHERE o.id IS NULL"
    removed = "FROM previous.entries o LEFT JOIN main.entries e USING (id) WHERE e.id IS NULL"
    kept = "FROM main.entries e JOIN previous.entries o USING (id)"
    return [
        counted(connection, "Added", added, "e.headword"),
        counted(connection, "Removed", removed, "o.headword", "o"),
        *(counted(connection, kind.label, f"{kept} WHERE {kind.differs}", kind.shown) for kind in (CHANGED, *KINDS)),
    ]


def sense_examples(connection: sqlite3.Connection, schema: str) -> dict | None:
    found = connection.execute(f"SELECT value FROM {schema}.metadata WHERE key = 'sense_examples'").fetchone()
    return json.loads(found[0]) if found else None


def headword_of(connection: sqlite3.Connection, ent_seq: int) -> str:
    found = connection.execute("SELECT headword FROM main.entries WHERE source_record_id = ?", (ent_seq,)).fetchone()
    return found[0] if found else "an entry this release holds"


def change_rows(changes: list[Counted]) -> list[str]:
    rows = ["| Change | Entries |", "| --- | --- |"]
    for change in changes:
        if change.label.startswith("…") and change.count == 0:
            continue
        shown = f" ({', '.join(change.shown)})" if change.shown else ""
        rows.append(f"| {change.label} | {change.count:,}{shown} |")
    return rows


def removed_rows(connection: sqlite3.Connection, dropped: list[dict]) -> list[str]:
    if not dropped:
        return ["The update removes no entry, so no word URL changes."]
    rows = [
        "Removed entries, and what each one's URL answers now (every slug of it, and the bare number):",
        "",
        "| Entry | Word | Its URL now |",
        "| --- | --- | --- |",
    ]
    for entry in dropped:
        replacement = entry["replacement"]
        goes = (
            f"308 to {SITE}/dictionary/{replacement}/ ({headword_of(connection, replacement)}, written and read the same)"
            if replacement
            else "410 Gone"
        )
        rows.append(
            f"| [{entry['ent_seq']}]({SITE}/dictionary/{entry['ent_seq']}/) | "
            f"{entry['headword']} ({entry['reading']}) | {goes} |"
        )
    rows += ["", "Notes a learner saved under a removed entry move to Notes Without a Word."]
    return rows


def examples_line(before: dict | None, after: dict) -> str:
    unlinked = after["source_examples"] - after["linked_examples"]
    now = (
        f"{after['linked_examples']:,} of the export's {after['source_examples']:,} checked examples link to "
        f"{after['senses']:,} meanings of {after['entries']:,} entries"
    )
    if before is None:
        return f"Each meaning's checked examples: {now}; {unlinked:,} aren't linked (the import report counts why)."
    return (
        f"Each meaning's checked examples: {now}, against {before['linked_examples']:,} on {before['senses']:,} "
        f"meanings of {before['entries']:,} before; {unlinked:,} aren't linked (the import report counts why)."
    )


def suite_steps(stale: dict[str, list[str]]) -> tuple[list[str], list[str]]:
    on_a_mac = [
        f"   - `{name}.json` (`-only-testing:SearchExperienceTests/{RECORDED_ON_A_MAC[name]}`), recorded from "
        + ", ".join(f"`{file}`" for file in files)
        for name, files in stale.items()
        if name in RECORDED_ON_A_MAC
    ]
    elsewhere = [
        f"   - `{name}.json`, recorded {RECORDED_WITHOUT_A_MAC.get(name, 'as its doc says')}"
        for name, files in stale.items()
        if name not in RECORDED_ON_A_MAC
    ]
    return on_a_mac, elsewhere


@dataclass(frozen=True)
class Refreshed:
    previous_export_date: str
    export_date: str
    xml_bytes: int
    release: str
    dropped: list[dict]
    stale: dict[str, list[str]]


def update_section(connection: sqlite3.Connection, refreshed: Refreshed) -> list[str]:
    before = sense_examples(connection, "previous")
    after = sense_examples(connection, "main")
    return [
        f"## The JMdict update, {refreshed.previous_export_date} → {refreshed.export_date}",
        "",
        *change_rows(entry_changes(connection)),
        "",
        *removed_rows(connection, refreshed.dropped),
        "",
        examples_line(before, after) if after else "This export links no checked examples to a meaning.",
    ]


def status_steps(refreshed: Refreshed) -> list[str]:
    on_a_mac, elsewhere = suite_steps(refreshed.stale)
    release = refreshed.release
    return [
        "Not ready to merge. A person finishes it, on a Mac with this branch checked out and its Git LFS files pulled:",
        "",
        "1. Record the app's suites again on an iPhone Simulator, from `apps/ios/Modules`: "
        "`TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1 xcodebuild -scheme ZenbuJapaneseModules-Package "
        "-destination 'platform=iOS Simulator,id=<simulator-udid>' ONLY_ACTIVE_ARCH=YES test`, with each of these "
        "after it, then review each diff (`docs/agents/ios.md`, Current verification boundary):",
        *(on_a_mac or ["   - none: no suite the app records was recorded from a file this update changed"]),
        *(["   Record these too:", *elsewhere] if elsewhere else []),
        "2. Run those suites again without recording, then `pnpm check` in `packages/dictionary-core` and, with "
        "`ZENBU_REQUIRE_ARTIFACT=1`, in `apps/dictionary-api`. A test that holds a number from the data, such as a "
        "word's position in a list, moves with the data.",
        f"3. Commit, then build and pin release {release}: `python3 language-data/pipeline/package.py build --out "
        "<an empty folder>`, then `package.py pin` on that folder, and commit "
        f"`language-data/releases/{release}/manifest.json` (`language-data/README.md`, Changing the data).",
        "4. Push. GitHub runs no workflow for a pull request a workflow's token opened, so this push starts the "
        "pull request's checks and its review.",
        "5. Write what the recordings and checks showed into Evidence, and update this Status.",
    ]


def pull_request(connection: sqlite3.Connection, refreshed: Refreshed) -> tuple[str, str]:
    date, release, previous = refreshed.export_date, refreshed.release, refreshed.previous_export_date
    (kept,) = connection.execute("SELECT count(*) FROM main.entries JOIN previous.entries USING (id)").fetchone()
    on_a_mac = [name for name in refreshed.stale if name in RECORDED_ON_A_MAC]
    title = f"feat(language-data): the dictionary moves to JMdict's {date} export, in release {release}"
    body = [
        "No issue: EDRDG's licence asks sites that serve JMdict to update it at least once a month, and the "
        "`JMdict monthly update` workflow opened this from that day's export.",
        "",
        "## Why",
        "",
        f"The dictionary was JMdict's {previous} export. EDRDG serves only the current day's file, and its "
        "licence asks for an update at least once a month.",
        "",
        "## What changed",
        "",
        f"- **The source:** `JMdict_e_examp-{date}.gz` replaces `JMdict_e_examp-{previous}.gz`, recorded with its "
        f"URL, export date, and SHA-256. Without its example blocks it's byte for byte that day's `JMdict_e` "
        f"({refreshed.xml_bytes:,} bytes of XML), which the record keeps under `without_examples`.",
        f"- **The import:** the evidence counts in `jmdict_entries.py` are the new export's, and each of the "
        f"{kept:,} entries kept from the previous data keeps its note identity, so saved notes, lists, and known "
        "words stay attached; the note identity test is pinned again.",
        f"- **Release {release}** is started: `release.json` names it, and `retire` recorded its entry changes "
        f"(`language-data/releases/{release}/ent-seq-changes.json`) and `RetiredEntries.json`. Its pin waits for "
        "the suites (Status).",
        "- **The core's fixtures** are exported again from the rebuilt files.",
        "",
        *update_section(connection, refreshed),
        "",
        "## Left out",
        "",
        "- The app's suites, which only the app records, on a Mac: "
        + (", ".join(f"`{name}`" for name in on_a_mac) or "none this month")
        + ". Until they're recorded again, their replays fail here, in the app's checks and the dictionary "
        "service's, which name each file a suite was recorded from, and `package.py build` refuses the release.",
        f"- Release {release}'s pin, which the build writes after the recordings.",
        "- The kanji data, which reads no JMdict, isn't rebuilt.",
        "",
        "## Evidence",
        "",
        "- Build: the workflow rebuilt everything that reads JMdict, on macOS and the data tools' pinned Python; "
        "the data tools' contract tests passed. The release isn't built or pinned yet.",
        "- Automated tests: only the data tools' contract tests, in the workflow. GitHub runs no other check here "
        "until a person pushes (Status).",
        "- UI tests: none yet.",
        "- Installed or deployed artifact: none; staging after merge.",
        "- Owner acceptance: the owner asked for this monthly update; this month's needs a person's review.",
        "",
        "Review: none yet; the CI review starts with the first push.",
        "",
        "## Status",
        "",
        *status_steps(refreshed),
    ]
    return title, "\n".join(body) + "\n"
