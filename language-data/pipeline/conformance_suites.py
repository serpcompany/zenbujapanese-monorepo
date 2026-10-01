from __future__ import annotations

import hashlib
import json
from pathlib import Path

from refusal import Refusal
from release_inputs import check_name


def conformance_pins(
    repo: Path, suites: list[str]
) -> tuple[list[dict], dict[str, tuple[str, str]]]:
    entries, pins = [], {}
    for path in suites:
        data = (repo / path).read_bytes()
        suite = json.loads(data)
        artifacts = suite.get("artifacts") or ([suite["artifact"]] if "artifact" in suite else [])
        if not artifacts:
            raise Refusal(f"{path} pins no artifacts")
        for artifact in artifacts:
            name, sha = artifact["name"], artifact["sha256"]
            if name in pins and pins[name][0] != sha:
                raise Refusal(
                    f"{path} pins {name} at {sha}, but {pins[name][1]} pins it at {pins[name][0]}"
                )
            pins.setdefault(name, (sha, Path(path).name))
        entries.append(
            {
                "name": check_name(Path(path).name, "conformance suite"),
                "suite": suite["suite"],
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
            }
        )
    names = [entry["name"] for entry in entries]
    if len(set(names)) != len(names):
        raise Refusal(f"two conformance suites share a file name: {names}")
    return entries, pins
