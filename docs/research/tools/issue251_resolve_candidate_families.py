#!/usr/bin/env python3
"""Add research-only app-owned candidate families without ranked-first guessing."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def candidates(
    database: sqlite3.Connection, surface: str, lemma: str | None
) -> list[str]:
    forms = sorted({value for value in (surface, lemma) if value})
    placeholders = ",".join("?" for _ in forms)
    rows = database.execute(
        f"SELECT DISTINCT lower(hex(entry_id)) FROM forms WHERE form IN ({placeholders}) ORDER BY 1",
        forms,
    )
    return [row[0] for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", type=Path)
    parser.add_argument("database", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    database = sqlite3.connect(f"file:{args.database}?mode=ro", uri=True)
    with args.output.open("w", encoding="utf-8") as destination:
        for line in args.results.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            for token in record["tokens"]:
                family = candidates(database, token["surface"], token.get("lemma"))
                token["candidateIds"] = family
                token["linkIds"] = family if len(family) == 1 else []
            destination.write(
                json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
            )


if __name__ == "__main__":
    main()
