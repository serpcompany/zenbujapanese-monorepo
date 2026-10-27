from __future__ import annotations

import json
from pathlib import Path

from refusal import Refusal


def check_against_schema(document: dict, schema_path: Path, what: str) -> None:
    import jsonschema

    schema = json.loads(schema_path.read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    errors = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(document),
        key=lambda e: list(e.absolute_path),
    )
    if errors:
        raise Refusal(
            f"{what} doesn't match its schema:\n"
            + "\n".join(
                f"  {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in errors
            )
        )
