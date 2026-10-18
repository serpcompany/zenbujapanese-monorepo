from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

from committed_files import tree_blobs
from refusal import Refusal

SOURCE_DIGEST = "sha256-of-sha256sum-lines-by-path"


def committed_blobs(repo: Path, path: str) -> list[tuple[str, str]]:
    return [(name, blob) for name, blob, _ in tree_blobs(repo, [path], recursive=True)]


def blob_contents(repo: Path, blob_ids: list[str]) -> list[bytes]:
    batch = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "--batch"],
        input="".join(f"{blob}\n" for blob in blob_ids).encode(),
        check=True,
        capture_output=True,
    ).stdout
    contents, offset = [], 0
    for _ in blob_ids:
        header_end = batch.index(b"\n", offset)
        size = int(batch[offset:header_end].split()[2])
        contents.append(batch[header_end + 1 : header_end + 1 + size])
        offset = header_end + 1 + size + 1
    return contents


def core_provenance(repo: Path, source: str, bundle: str) -> tuple[str, dict]:
    bundled = committed_blobs(repo, bundle)
    if [name for name, _ in bundled] != [bundle]:
        raise Refusal(f"the core's bundle, {bundle}, isn't a file committed at HEAD")
    files = sorted(
        (name.removeprefix(f"{source}/"), blob) for name, blob in committed_blobs(repo, source)
    )
    if not files:
        raise Refusal(f"the core, {source}, has no files committed at HEAD")
    bundle_data, *source_data = blob_contents(repo, [bundled[0][1], *(blob for _, blob in files)])
    sha256sum = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n"
        for (name, _), data in zip(files, source_data)
    )
    bundle_sha256 = hashlib.sha256(bundle_data).hexdigest()
    return bundle_sha256, {
        "bundle": {"path": bundle, "sha256": bundle_sha256, "bytes": len(bundle_data)},
        "source": {
            "path": source,
            "files": len(files),
            "digest": SOURCE_DIGEST,
            "sha256": hashlib.sha256(sha256sum.encode()).hexdigest(),
        },
    }
