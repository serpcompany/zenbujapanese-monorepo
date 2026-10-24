#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import rebuild_language_data
from refresh_jmdict_export import fetch
from refresh_jmdict_release import (
    DATABASE,
    RELEASE_FILE,
    RELEASES,
    keep_note_identities,
    stale_suites,
    start_release,
)
from refresh_jmdict_sources import APPLIED, SOURCES, apply, only_record
from refresh_jmdict_summary import Refreshed, opened, pull_request

EXPORT = "export"
TITLE = "title.txt"
BODY = "body.md"
COMMANDS = ("fetch", "apply", "rebuild", "release", "summary")


def rebuild(work: Path) -> None:
    published, unidic = rebuild_language_data.prepare(True, Path(__file__))
    work.mkdir(parents=True, exist_ok=True)
    changed = rebuild_language_data.build_dictionary(unidic, work, published, None)
    keep_note_identities(work / rebuild_language_data.PREVIOUS_LANGUAGE_DATA)
    rebuild_language_data.run_contract_tests()
    rebuild_language_data.refuse_unpublished_jiten(changed, None)


def summary(work: Path) -> None:
    applied = json.loads((work / EXPORT / APPLIED).read_text(encoding="utf-8"))
    release = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))["release"]
    changes = json.loads((RELEASES / release / "ent-seq-changes.json").read_text(encoding="utf-8"))
    refreshed = Refreshed(
        previous_export_date=applied["previous_export_date"],
        export_date=applied["export_date"],
        xml_bytes=applied["xml_bytes"],
        release=release,
        dropped=changes["dropped"],
        stale=stale_suites(),
    )
    connection = opened(work / rebuild_language_data.PREVIOUS_LANGUAGE_DATA, DATABASE)
    try:
        title, body = pull_request(connection, refreshed)
    finally:
        connection.close()
    (work / TITLE).write_text(f"{title}\n", encoding="utf-8")
    (work / BODY).write_text(body, encoding="utf-8")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Move the language data to EDRDG's current JMdict export, one step at a time "
        "(language-data/tools/README.md, Refresh a source snapshot)."
    )
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument(
        "--work",
        type=Path,
        required=True,
        help="the folder the steps share: the export, the previous language data, and the pull request",
    )
    arguments = parser.parse_args(argv)
    work = arguments.work.resolve()
    if arguments.command == "fetch":
        print(json.dumps(fetch(only_record(SOURCES), work / EXPORT, datetime.now(timezone.utc))))
    elif arguments.command == "apply":
        print(json.dumps(apply(work / EXPORT), ensure_ascii=False))
    elif arguments.command == "rebuild":
        rebuild(work)
    elif arguments.command == "release":
        print(start_release(datetime.now(timezone.utc).date()))
    else:
        summary(work)


if __name__ == "__main__":
    main()
