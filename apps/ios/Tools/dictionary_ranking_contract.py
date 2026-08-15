#!/usr/bin/env python3
"""Generate the app's typed runtime contract from one import transform."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


TOOL_CHECKSUM_KEYS = (
    "import_tool_sha256",
    "dictionary_ranking_adapter_sha256",
    "dictionary_ranking_contract_sha256",
    "shared_tooling_sha256",
    "unidic_adapter_sha256",
    "tatoeba_adapter_sha256",
)


def runtime_contract(transform: dict[str, Any]) -> dict[str, Any]:
    return {
        "policy": transform["dictionary_ranking_policy"],
        "schemaVersion": transform["dictionary_ranking_schema_version"],
        "databaseSHA256": transform["database_sha256"],
        "databaseBytes": transform["database_bytes"],
        "mappingSHA256": transform["dictionary_ranking_mapping_sha256"],
        "evidenceCounts": transform["dictionary_ranking_evidence"],
        "semanticEquivalence": transform["semantic_equivalence"],
        "toolSHA256": {key: transform[key] for key in TOOL_CHECKSUM_KEYS},
    }


def write_runtime_contract(path: Path, transform: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(runtime_contract(transform), indent=2, sort_keys=True) + "\n")
