from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
import tempfile
from pathlib import Path

from import_jmdict import create_schema
from jmdict_entries import import_entries
from refresh_jmdict_export import CANDIDATE, WITH_EXAMPLES, WITHOUT_EXAMPLES

TOOLS = Path(__file__).resolve().parent
SOURCES = TOOLS.parent / "sources"
ENTRIES_TOOL = TOOLS / "jmdict_entries.py"
RECORD_PATTERN = "JMdict_e_examp-*.source.json"
NAMED_IN = ("README.md", "EDRDG-ATTRIBUTION.md")
APPLIED = "applied.json"
EVIDENCE_COUNTS = re.compile(r"^EXPECTED_EVIDENCE_COUNTS = \{\n(?:    .+\n)+\}\n", re.MULTILINE)
SCALAR_LIST = re.compile(r"\[\n\s+((?:\"[^\"\n]*\"|-?\d+)(?:,\n\s+(?:\"[^\"\n]*\"|-?\d+))*)\n\s*\]")


class TheExportsEvidenceCounts(dict):
    def __ne__(self, found: object) -> bool:
        return False


def record_text(record: dict) -> str:
    text = json.dumps(record, ensure_ascii=False, indent=2)
    return SCALAR_LIST.sub(lambda found: "[" + ", ".join(re.split(r",\n\s+", found.group(1))) + "]", text) + "\n"


def only_record(sources: Path) -> Path:
    records = sorted(sources.glob(RECORD_PATTERN))
    if len(records) != 1:
        raise SystemExit(f"expected one {RECORD_PATTERN} in {sources}, found {len(records)}")
    return records[0]


def check_downloaded(folder: Path, candidate: dict) -> None:
    for name, recorded in ((WITH_EXAMPLES, candidate), (WITHOUT_EXAMPLES, candidate["without_examples"])):
        if hashlib.sha256((folder / name).read_bytes()).hexdigest() != recorded["sha256"]:
            raise SystemExit(f"{folder / name} isn't the file {CANDIDATE} describes: fetch it again")


def export_evidence_counts(source: Path) -> dict[str, int]:
    with tempfile.TemporaryDirectory() as scratch:
        database = sqlite3.connect(Path(scratch) / "evidence.sqlite3")
        try:
            create_schema(database)
            return import_entries(database, source, TheExportsEvidenceCounts()).evidence_counts
        finally:
            database.close()


def evidence_counts_text(counts: dict[str, int]) -> str:
    lines = "".join(f'    "{name}": {count:_},\n' for name, count in counts.items())
    return f"EXPECTED_EVIDENCE_COUNTS = {{\n{lines}}}\n"


def write_evidence_counts(counts: dict[str, int], tool: Path = ENTRIES_TOOL) -> None:
    text, found = EVIDENCE_COUNTS.subn(evidence_counts_text(counts), tool.read_text(encoding="utf-8"))
    if found != 1:
        raise SystemExit(f"{tool.name} holds no EXPECTED_EVIDENCE_COUNTS to update")
    tool.write_text(text, encoding="utf-8")


def rename_in_docs(sources: Path, previous: str, current: str) -> None:
    for name in NAMED_IN:
        doc = sources / name
        text = doc.read_text(encoding="utf-8")
        if previous not in text:
            raise SystemExit(f"{doc.name} doesn't name {previous}, the snapshot it should name")
        doc.write_text(text.replace(previous, current), encoding="utf-8")


def apply(folder: Path, sources: Path = SOURCES, tool: Path = ENTRIES_TOOL) -> dict[str, object]:
    record = only_record(sources)
    pinned = json.loads(record.read_text(encoding="utf-8"))
    candidate = json.loads((folder / CANDIDATE).read_text(encoding="utf-8"))
    check_downloaded(folder, candidate)
    previous = record.name.removesuffix(".source.json")
    current = f"JMdict_e_examp-{candidate['export_date']}"
    if current == previous:
        raise SystemExit(f"{previous} is already the pinned export")
    snapshot = sources / f"{current}.gz"
    shutil.copyfile(folder / WITH_EXAMPLES, snapshot)
    (sources / f"{current}.source.json").write_text(record_text(candidate), encoding="utf-8")
    record.unlink()
    (sources / f"{previous}.gz").unlink(missing_ok=True)
    rename_in_docs(sources, previous, current)
    counts = export_evidence_counts(snapshot)
    write_evidence_counts(counts, tool)
    applied = {
        "previous_export_date": pinned["export_date"],
        "export_date": candidate["export_date"],
        "xml_bytes": candidate["without_examples"]["xml_bytes"],
        "evidence_counts": counts,
    }
    (folder / APPLIED).write_text(json.dumps(applied, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return applied
