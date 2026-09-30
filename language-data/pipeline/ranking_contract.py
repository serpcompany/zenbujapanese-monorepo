from __future__ import annotations

from pathlib import Path

from refusal import Refusal
from sqlite_files import count, json_value, open_sqlite

EVIDENCE_KEYS = (
    "form_priority_profiles",
    "canonical_senses",
    "gloss_atoms",
    "sense_form_restrictions",
    "reading_form_restrictions",
)
SEARCH_INDEX_KEYS = ("schema", "technology", "gloss_rows", "form_rows")
TOOL_KEYS = (
    "import_tool_sha256",
    "dictionary_ranking_adapter_sha256",
    "dictionary_ranking_contract_sha256",
    "shared_tooling_sha256",
    "unidic_adapter_sha256",
    "tatoeba_adapter_sha256",
)


def check_ranking_contract(name: str, contract: dict, database: Path, metadata: dict) -> None:
    def refuse(what: str) -> None:
        raise Refusal(f"{name}: {what} disagrees with {database.name}")

    def meta(key: str) -> object:
        if key not in metadata:
            refuse(f"metadata {key} (missing)")
        return json_value(metadata[key])

    def fields(value: object, keys: tuple[str, ...]) -> dict | None:
        if not isinstance(value, dict) or any(key not in value for key in keys):
            return None
        return {key: value[key] for key in keys}

    if database.stat().st_size != contract.get("databaseBytes"):
        refuse("databaseBytes")
    if meta("dictionary_ranking_policy") != contract.get("policy"):
        refuse("policy")
    if meta("dictionary_ranking_schema_version") != contract.get("schemaVersion"):
        refuse("schemaVersion")
    if meta("dictionary_ranking_mapping_sha256") != contract.get("mappingSHA256"):
        refuse("mappingSHA256")
    evidence = fields(contract.get("evidenceCounts"), EVIDENCE_KEYS)
    if evidence is None or fields(meta("dictionary_ranking_evidence"), EVIDENCE_KEYS) != evidence:
        refuse("evidenceCounts")
    search_index = fields(contract.get("searchIndex"), SEARCH_INDEX_KEYS)
    if (
        search_index is None
        or fields(meta("dictionary_search_index"), SEARCH_INDEX_KEYS) != search_index
    ):
        refuse("searchIndex")
    if search_index["schema"] != "zenbu.dictionary-search-index.v1":
        refuse("searchIndex.schema")
    if search_index["technology"] != "sqlite-fts4":
        refuse("searchIndex.technology")
    equivalence = contract.get("semanticEquivalence") or {}
    if equivalence.get("normalization") != "opaque-app-id-lexicographic-min-v1":
        refuse("semanticEquivalence.normalization")
    tools = fields(contract.get("toolSHA256"), TOOL_KEYS)
    if tools is None:
        refuse("toolSHA256")
    for key, expected in tools.items():
        if meta(key) != expected:
            refuse(f"toolSHA256.{key}")

    with open_sqlite(database) as connection:
        groups, rows = connection.execute(
            "SELECT count(*), total(group_size) FROM (SELECT count(*) AS group_size FROM entries "
            "GROUP BY semantic_fingerprint HAVING count(*) > 1)"
        ).fetchone()
        if (groups, rows) != (equivalence.get("duplicate_groups"), equivalence.get("source_rows")):
            refuse("semanticEquivalence")
        tables = [(key, evidence[key]) for key in EVIDENCE_KEYS] + [
            ("dictionary_gloss_fts", search_index["gloss_rows"]),
            ("dictionary_form_fts", search_index["form_rows"]),
        ]
        for table, expected in tables:
            if count(connection, table) != expected:
                refuse(f"the row count of {table}")
