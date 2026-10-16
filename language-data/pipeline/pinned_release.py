from __future__ import annotations

import json
from pathlib import Path

from refusal import Refusal
from release_manifest import manifest_bytes
from releases_index import release_key

PROVENANCE = ("git_commit", "workflow_run", "core_sha256")
BUCKET_FIELDS = ("previous_release", "previous_manifest_sha256")
RUN_FIELDS = PROVENANCE + BUCKET_FIELDS
PINNED_FILE = "manifest.json"
HOW_TO_PIN = (
    "A release's content is pinned: bump language-data/release.json, build the release, run "
    "package.py pin on it, and commit the new manifest (language-data/README.md, Changing the data)."
)


def pinned_content(manifest: dict) -> dict:
    return {key: value for key, value in manifest.items() if key not in RUN_FIELDS}


def pinned_path(releases: Path, release: str) -> Path:
    return releases / release / PINNED_FILE


def write_pinned(releases: Path, manifest: dict) -> Path:
    path = pinned_path(releases, manifest["release"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(manifest_bytes(pinned_content(manifest)))
    return path


def pinned_releases(releases: Path) -> list[str]:
    found = [path.parent.name for path in releases.glob(f"*/{PINNED_FILE}")]
    return sorted(found, key=release_key)


def check_latest(releases: Path, release: str) -> None:
    later = [
        pinned for pinned in pinned_releases(releases) if release_key(pinned) > release_key(release)
    ]
    if later:
        raise Refusal(
            f"release.json names {release}, but {releases} pins a later release, {later[-1]}: a "
            "release ID only ever goes up"
        )


def load_pinned(releases: Path, release: str) -> dict:
    path = pinned_path(releases, release)
    if not path.is_file():
        raise Refusal(
            f"release {release} has no pinned manifest at {path}: build the release, then run "
            "package.py pin on it"
        )
    pinned = json.loads(path.read_text())
    if pinned.get("release") != release:
        raise Refusal(f"{path} pins release {pinned.get('release')!r}, not {release}")
    run_fields = [name for name in RUN_FIELDS if name in pinned]
    if run_fields:
        raise Refusal(
            f"{path} holds {', '.join(run_fields)}, which depend on the run or the bucket rather "
            "than the release: write it with package.py pin"
        )
    return pinned


def file_differences(pinned: list[dict], built: list[dict]) -> list[str]:
    before = {record["name"]: record for record in pinned}
    after = {record["name"]: record for record in built}
    found = []
    for name in sorted(before.keys() | after.keys()):
        if name not in after:
            found.append(f"{name} (pinned, not built)")
        elif name not in before:
            found.append(f"{name} (built, not pinned)")
        elif before[name] != after[name]:
            fields = sorted(
                key
                for key in before[name].keys() | after[name].keys()
                if before[name].get(key) != after[name].get(key)
            )
            found.append(f"{name} ({', '.join(fields)})")
    if not found and list(before) != list(after):
        found.append("their order")
    return found


def differences(pinned: dict, manifest: dict) -> list[str]:
    built = pinned_content(manifest)
    fields = sorted(
        key
        for key in built.keys() | pinned.keys()
        if key != "files" and built.get(key) != pinned.get(key)
    )
    files = file_differences(pinned.get("files", []), built.get("files", []))
    return fields + ([f"files: {', '.join(files)}"] if files else [])


def check_pinned(manifest: dict, pinned: dict, what: str) -> None:
    found = differences(pinned, manifest)
    if found:
        raise Refusal(
            f"{what} differs from release {pinned['release']}'s pinned manifest in "
            f"{'; '.join(found)}. {HOW_TO_PIN}"
        )
