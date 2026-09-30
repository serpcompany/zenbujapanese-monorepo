from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from refusal import Refusal
from release_inputs import Inputs

LFS_HEADER = b"version https://git-lfs.github.com/spec/v1\n"
CHUNK = 1 << 20


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True).stdout


@dataclass(frozen=True)
class Committed:
    blob_id: str
    lfs_oid: str | None
    lfs_size: int | None


def parse_lfs_pointer(content: bytes) -> tuple[str, int] | None:
    if not content.startswith(LFS_HEADER):
        return None
    fields = dict(line.split(" ", 1) for line in content.decode().splitlines() if " " in line)
    oid, size = fields.get("oid", ""), fields.get("size", "")
    if not oid.startswith("sha256:") or not size.isdigit():
        raise Refusal(f"malformed Git LFS pointer: {content[:200]!r}")
    return oid.removeprefix("sha256:"), int(size)


def committed(repo: Path, paths: list[str]) -> dict[str, Committed]:
    listing = git(repo, "ls-tree", "-z", "-l", "--full-tree", "HEAD", "--", *paths)
    found: dict[str, Committed] = {}
    for record in listing.split(b"\0"):
        if not record:
            continue
        meta, name = record.decode().split("\t", 1)
        mode, kind, blob, size = meta.split()
        if kind != "blob":
            continue
        pointer = None
        if int(size) < 1024:
            pointer = parse_lfs_pointer(git(repo, "cat-file", "blob", blob))
        found[name] = Committed(blob, *(pointer or (None, None)))
    missing = [path for path in paths if path not in found]
    if missing:
        raise Refusal(f"not committed at HEAD: {missing}")
    return found


def lfs_paths(repo: Path, inputs: Inputs) -> list[str]:
    heads = committed(repo, [entry["path"] for entry in inputs.files])
    return [entry["path"] for entry in inputs.files if heads[entry["path"]].lfs_oid]


def git_blob_id(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


@dataclass(frozen=True)
class Staged:
    sha256: str
    bytes: int
    path: Path
    blob_id: str


def stage(source: Path, staging: Path, name: str) -> Staged:
    sha256 = hashlib.sha256()
    size = source.stat().st_size
    blob = hashlib.sha1(f"blob {size}\0".encode())
    tmp = tempfile.NamedTemporaryFile(dir=staging, delete=False)
    try:
        with source.open("rb") as reader, tmp:
            while chunk := reader.read(CHUNK):
                sha256.update(chunk)
                blob.update(chunk)
                tmp.write(chunk)
        digest = sha256.hexdigest()
        target = staging / "files" / digest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp.name, target)
    except BaseException:
        Path(tmp.name).unlink(missing_ok=True)
        raise
    return Staged(digest, size, target, blob.hexdigest())


def check_committed(entry: dict, head: Committed, staged: Staged) -> None:
    name, path = entry["name"], entry["path"]
    if head.lfs_oid:
        if staged.sha256 != head.lfs_oid or staged.bytes != head.lfs_size:
            with staged.path.open("rb") as file:
                is_pointer = file.read(len(LFS_HEADER)) == LFS_HEADER
            hint = " (it's still an LFS pointer: run git lfs pull)" if is_pointer else ""
            raise Refusal(
                f"{name}: {path} has SHA-256 {staged.sha256} and {staged.bytes} bytes, but its "
                f"LFS pointer at HEAD names {head.lfs_oid} and {head.lfs_size} bytes{hint}"
            )
    elif staged.blob_id != head.blob_id:
        raise Refusal(
            f"{name}: {path} differs from HEAD (blob {head.blob_id}); commit or restore it"
        )
