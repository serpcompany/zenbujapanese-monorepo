from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol


@dataclass(frozen=True)
class Head:
    size: int
    metadata_sha256: str | None
    etag: str
    checksum_sha256: str | None = None

    def reported_sha256(self) -> tuple[str | None, str]:
        if self.checksum_sha256 is not None:
            return self.checksum_sha256, "ChecksumSHA256"
        return self.metadata_sha256, "x-amz-meta-sha256"


class PreconditionFailed(Exception):
    pass


class StoreError(Exception):
    pass


class Store(Protocol):
    def head(self, key: str) -> Head | None: ...

    def get(self, key: str) -> tuple[bytes, str] | None: ...

    def download(self, key: str, path: Path) -> None: ...

    def put(
        self,
        key: str,
        body: bytes | Path,
        *,
        sha256: str,
        content_type: str,
        cache_control: str,
        if_none_match: bool = False,
        if_match: str | None = None,
    ) -> None: ...


def checksum_hex(value: str | None) -> str | None:
    if not value:
        return None
    try:
        digest = base64.b64decode(value, validate=True)
    except ValueError:
        return None
    return digest.hex() if len(digest) == 32 else None


class AwsCliStore:
    def __init__(self, bucket: str, endpoint: str, run: Callable = subprocess.run):
        self.bucket, self.endpoint, self.run = bucket, endpoint, run

    def _call(self, operation: str, *args: str, outfile: Path | None = None) -> dict:
        command = [
            "aws", "s3api", operation, "--bucket", self.bucket, *args,
            "--endpoint-url", self.endpoint, "--output", "json",
            *([str(outfile)] if outfile is not None else []),
        ]
        result = self.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            error = (result.stderr or "").strip()
            if any(code in error for code in ("(404)", "NoSuchKey", "Not Found")):
                raise FileNotFoundError(error)
            if any(code in error for code in ("(412)", "PreconditionFailed", "(409)")):
                raise PreconditionFailed(error)
            raise StoreError(f"aws s3api {operation} failed: {error}")
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def head(self, key: str) -> Head | None:
        try:
            response = self._call("head-object", "--key", key, "--checksum-mode", "ENABLED")
        except FileNotFoundError:
            return None
        metadata = {name.lower(): value for name, value in (response.get("Metadata") or {}).items()}
        return Head(
            int(response["ContentLength"]),
            metadata.get("sha256"),
            response.get("ETag", ""),
            checksum_hex(response.get("ChecksumSHA256")),
        )

    def download(self, key: str, path: Path) -> None:
        self._call("get-object", "--key", key, outfile=path)

    def get(self, key: str) -> tuple[bytes, str] | None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "object"
            try:
                response = self._call("get-object", "--key", key, outfile=path)
            except FileNotFoundError:
                return None
            return path.read_bytes(), response.get("ETag", "")

    def put(
        self,
        key: str,
        body: bytes | Path,
        *,
        sha256: str,
        content_type: str,
        cache_control: str,
        if_none_match: bool = False,
        if_match: str | None = None,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            if isinstance(body, bytes):
                path = Path(tmp) / "body"
                path.write_bytes(body)
            else:
                path = body
            args = [
                "--key", key, "--body", str(path),
                "--content-type", content_type, "--cache-control", cache_control,
                "--metadata", f"sha256={sha256}",
                "--checksum-sha256", base64.b64encode(bytes.fromhex(sha256)).decode(),
            ]
            if if_none_match:
                args += ["--if-none-match", "*"]
            if if_match is not None:
                args += ["--if-match", if_match]
            self._call("put-object", *args)
