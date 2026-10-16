from __future__ import annotations

from pathlib import Path

from bucket_objects import sha256_of
from committed_files import git
from pinned_release import check_latest, load_pinned
from refusal import Refusal
from release_build import LANGUAGE_REFERENCE_SCHEMA
from release_inputs import Inputs
from retired_entries import (
    changes_path,
    document_bytes,
    earlier_releases,
    entry_changes,
    release_steps,
    retired_document,
)
from sqlite_files import ent_seq_sha256, is_sqlite, jmdict_entries


def language_reference(inputs: Inputs) -> dict:
    planned = [
        entry
        for entry in inputs.files
        if LANGUAGE_REFERENCE_SCHEMA.match(entry.get("artifact_schema") or "")
    ]
    if len(planned) != 1:
        raise Refusal("release-inputs.json must plan exactly one zenbu.language-reference file")
    return planned[0]


def lfs_object(repo: Path, oid: str) -> Path:
    common = Path(git(repo, "rev-parse", "--git-common-dir").decode().strip())
    store = common if common.is_absolute() else repo / common
    return store / "lfs" / "objects" / oid[:2] / oid[2:4] / oid


def previous_entries(
    repo: Path, releases: Path, previous: str, current: tuple[str, dict], database: Path | None
) -> dict[int, tuple[str, str]]:
    pin = load_pinned(releases, previous)
    record = next(entry for entry in pin["files"] if entry["name"] == pin["ids"]["file"])
    current_sha256, current_entries = current
    if record["sha256"] == current_sha256:
        before = current_entries
    else:
        path = database or lfs_object(repo, record["sha256"])
        if not path.is_file():
            raise Refusal(
                f"release {previous}'s {record['name']} ({record['sha256']}) isn't in this "
                "checkout's Git LFS store: pass it with --previous-database"
            )
        if sha256_of(path) != record["sha256"]:
            raise Refusal(
                f"{path} isn't release {previous}'s {record['name']} ({record['sha256']})"
            )
        before = jmdict_entries(path)
    if ent_seq_sha256(before) != pin["ids"]["ent_seq_sha256"]:
        raise Refusal(f"release {previous}'s {record['name']} doesn't hold the entries it pins")
    return before


def retire(
    repo: Path, inputs: Inputs, releases: Path, release: str, previous_database: Path | None = None
) -> dict:
    if not inputs.retired_entries:
        raise Refusal("release-inputs.json names no retired_entries file")
    check_latest(releases, release)
    path = repo / language_reference(inputs)["path"]
    if not is_sqlite(path):
        raise Refusal(f"{path} isn't a SQLite database: run git lfs pull")
    language_sha256, current = sha256_of(path), jmdict_entries(path)
    earlier = earlier_releases(releases, release)
    changes = {"dropped": [], "added": []}
    if earlier:
        before = previous_entries(
            repo, releases, earlier[-1], (language_sha256, current), previous_database
        )
        changes = entry_changes(release, earlier[-1], before, current)
        target = changes_path(releases, release)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(document_bytes(changes))
    document = retired_document(release_steps(releases, release), language_sha256)
    retired = repo / inputs.retired_entries
    retired.parent.mkdir(parents=True, exist_ok=True)
    retired.write_bytes(document_bytes(document))
    return {
        "previous": earlier[-1] if earlier else None,
        "dropped": len(changes["dropped"]),
        "replaced": sum(entry["replacement"] is not None for entry in changes["dropped"]),
        "added": len(changes["added"]),
        "retired": len(document["entries"]),
    }
