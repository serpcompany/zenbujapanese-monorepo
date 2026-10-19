from __future__ import annotations

import json
import sqlite3

from jmdict_normalization import normalized_text, word_note_identity


def assign_note_identities(
    database: sqlite3.Connection, entry_records: list[dict[str, object]]
) -> tuple[int, int]:
    note_identity_groups: dict[str, list[dict[str, object]]] = {}
    for record in entry_records:
        note_identity_groups.setdefault(word_note_identity(record), []).append(record)
    for base_identity, records in note_identity_groups.items():
        ordered = sorted(records, key=lambda candidate: int(str(candidate["source_record_id"])))
        for index, record in enumerate(ordered, start=1):
            note_identity = base_identity if len(ordered) == 1 else f"{base_identity}:{index}"
            database.execute(
                "UPDATE entries SET note_identity = ? WHERE id = ?",
                (note_identity, record["id"]),
            )
    database.execute("CREATE UNIQUE INDEX entries_note_identity_index ON entries(note_identity)")
    note_identity_duplicate_groups = sum(
        1 for records in note_identity_groups.values() if len(records) > 1
    )
    note_identity_disambiguated_entries = sum(
        len(records) for records in note_identity_groups.values() if len(records) > 1
    )
    return note_identity_duplicate_groups, note_identity_disambiguated_entries


def link_relationships(
    database: sqlite3.Connection,
    entry_records: list[dict[str, object]],
    form_to_entry_ids: dict[str, list[bytes]],
    relationship_metadata: dict[str, object],
) -> int:
    relationship_count = 0
    records_by_id = {record["id"]: record for record in entry_records}
    records_by_source_id = {str(record["source_record_id"]): record for record in entry_records}
    editorial_by_source: dict[str, list[dict[str, str]]] = {}
    for fact in relationship_metadata["facts"]:
        editorial_by_source.setdefault(str(fact["sourceRecordID"]), []).append(fact)

    for record in entry_records:
        related: list[dict[str, str]] = []
        seen_ids: set[bytes] = set()

        for reference in record["cross_references"]:
            target_ids = form_to_entry_ids.get(normalized_text(str(reference["form"])), [])
            supplied_reading = reference["reading"]
            target = next(
                (
                    records_by_id[target_id]
                    for target_id in target_ids
                    if target_id != record["id"]
                    and (
                        supplied_reading is None
                        or normalized_text(str(supplied_reading))
                        in {
                            normalized_text(str(reading))
                            for reading in records_by_id[target_id]["reading_values"]
                        }
                    )
                ),
                None,
            )
            if target:
                target_sense = reference["sense"]
                target_senses = target["senses"]
                target_summary = (
                    str(target_senses[target_sense - 1]["meaning"])
                    if target_sense is not None and 0 < target_sense <= len(target_senses)
                    else str(target["summary"])
                )
                seen_ids.add(target["id"])
                related.append(
                    {
                        "query": str(target["headword"]),
                        "headword": str(target["headword"]),
                        "reading": str(supplied_reading or target["reading"]),
                        "summary": target_summary,
                        "relation": "See also",
                        "sourceIdentity": "edrdg.jmdict",
                        "sourceReference": str(reference["sourceValue"]),
                        "targetSense": target_sense,
                        "targetID": target["id"].hex(),
                    }
                )

        editorial_facts = editorial_by_source.get(str(record["source_record_id"]), [])
        for fact in editorial_facts:
            target = records_by_source_id.get(str(fact["targetRecordID"]))
            if not target or target["id"] in seen_ids:
                continue
            seen_ids.add(target["id"])
            related.append(
                {
                    "query": str(target["headword"]),
                    "headword": str(target["headword"]),
                    "reading": str(target["reading"]),
                    "summary": str(target["summary"]),
                    "relation": str(fact["relation"]),
                    "sourceIdentity": str(relationship_metadata["identity"]),
                    "targetID": target["id"].hex(),
                }
            )

        related = related[:6]
        relationship_count += len(related)
        database.execute(
            "UPDATE entries SET relationships_json = ? WHERE id = ?",
            (json.dumps(related, ensure_ascii=False, separators=(",", ":")), record["id"]),
        )
    return relationship_count
