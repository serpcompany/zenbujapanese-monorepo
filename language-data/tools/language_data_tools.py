from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Callable


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _import_arguments(*inputs: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    for name in ("--source", "--source-manifest", *inputs, "--output", "--import-manifest"):
        parser.add_argument(name, type=Path, required=True)
    return parser.parse_args()


def built_artifact(import_tool: Path, artifact: Path) -> dict[str, object]:
    return {
        "import_tool_sha256": file_sha256(import_tool),
        "shared_tooling_sha256": file_sha256(Path(__file__)),
        "artifact_sha256": file_sha256(artifact),
        "artifact_bytes": artifact.stat().st_size,
    }


def write_import_report(
    path: Path, source_manifest: dict[str, object], transform: dict[str, object]
) -> None:
    report = {"source": source_manifest, "transform": transform}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(transform, ensure_ascii=False, indent=2))


def run_import(
    build: Callable[[argparse.Namespace, dict[str, object]], dict[str, object]], *inputs: str
) -> None:
    arguments = _import_arguments(*inputs)
    source_manifest = json.loads(arguments.source_manifest.read_text())
    transform = build(arguments, source_manifest)
    write_import_report(arguments.import_manifest, source_manifest, transform)
