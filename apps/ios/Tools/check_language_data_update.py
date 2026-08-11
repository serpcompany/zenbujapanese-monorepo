#!/usr/bin/env python3
"""Fail when official exports differ from a Zenbu pinned-source manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from language_data_tools import fetch_remote_json, observe_remote


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_metadata", type=Path)
    arguments = parser.parse_args()
    manifest = json.loads(arguments.source_metadata.read_text())
    pinned_sources = manifest.get("sources", [manifest])

    observations = []
    changed = []
    for pinned in pinned_sources:
        identity = pinned.get("identity", manifest.get("identity", manifest["resource_id"]))
        observed = observe_remote(pinned["download_url"], "Zenbu-language-data-update-check/1")
        observed["identity"] = identity
        observations.append({"pinned": pinned, "observed": observed})
        if observed["sha256"] != pinned["sha256"]:
            changed.append(identity)

    if latest_snapshot_url := manifest.get("latest_snapshot_url"):
        latest = fetch_remote_json(latest_snapshot_url, "Zenbu-language-data-update-check/1")
        if not isinstance(latest, list) or not latest or "sha" not in latest[0]:
            raise SystemExit(f"Unexpected latest-snapshot response for {manifest['identity']}")
        latest_snapshot = latest[0]["sha"]
        observations.append(
            {
                "identity": manifest["identity"],
                "pinned_snapshot": manifest["snapshot"],
                "latest_snapshot": latest_snapshot,
            }
        )
        if latest_snapshot != manifest["snapshot"]:
            changed.append(manifest["identity"])

    print(json.dumps(observations, indent=2))
    if changed:
        raise SystemExit(
            f"Changed upstream Language Reference Data ({', '.join(changed)}): regenerate, review, test, and promote"
        )


if __name__ == "__main__":
    main()
