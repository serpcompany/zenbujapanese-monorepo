from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable, Mapping
from pathlib import Path

SENTRY_CLI = "@sentry/cli@3.8.0"
ORGANIZATION = "serpcompany"
PROJECT = "zenbujapanese-ios"
TOKEN_VARIABLE = "SENTRY_AUTH_TOKEN"
KEYCHAIN_ITEM = "zenbu-sentry-auth-token"
KEYCHAIN = Path.home() / "Library" / "Keychains" / "login.keychain-db"
USAGE = "usage: upload_dsyms.py <an .xcarchive, or a build's products folder>"

Run = Callable[..., subprocess.CompletedProcess]


def warn(message: str) -> None:
    print(f"warning: {message}. The build is fine; upload its dSYMs again later.", file=sys.stderr)


def find_token(environ: Mapping[str, str], run: Run) -> str:
    if environ.get(TOKEN_VARIABLE, "").strip():
        return environ[TOKEN_VARIABLE].strip()
    try:
        found = run(
            ["security", "find-generic-password", "-s", KEYCHAIN_ITEM, "-w", str(KEYCHAIN)],
            capture_output=True,
            text=True,
        )
    except OSError:
        return ""
    return found.stdout.strip() if found.returncode == 0 else ""


def upload_command(dsyms: list[Path]) -> list[str]:
    return [
        "npx",
        "--yes",
        SENTRY_CLI,
        "debug-files",
        "upload",
        "--org",
        ORGANIZATION,
        "--project",
        PROJECT,
        *map(str, dsyms),
    ]


def find_dsyms(build: Path) -> list[Path]:
    folder = build / "dSYMs" if (build / "dSYMs").is_dir() else build
    return sorted(folder.glob("*.dSYM"))


def upload(build: Path, environ: Mapping[str, str], run: Run) -> bool:
    dsyms = find_dsyms(build)
    if not dsyms:
        warn(f"{build} holds no dSYMs, so no debug symbols went to Sentry")
        return False
    token = find_token(environ, run)
    if not token:
        warn(
            f"no Sentry token: set {TOKEN_VARIABLE}, or keep it in the login keychain as "
            f"{KEYCHAIN_ITEM}"
        )
        return False
    try:
        result = run(
            upload_command(dsyms),
            env={**environ, TOKEN_VARIABLE: token},
            capture_output=True,
            text=True,
        )
    except OSError as error:
        warn(f"couldn't run {SENTRY_CLI} ({error.strerror})")
        return False
    if result.returncode != 0:
        warn(f"{SENTRY_CLI} couldn't upload the dSYMs (exit {result.returncode})")
        print(result.stderr.replace(token, "<token>")[-2000:], file=sys.stderr)
        return False
    print(result.stdout.replace(token, "<token>")[-2000:])
    print(f"Uploaded {build.name}'s dSYMs to Sentry's {PROJECT}.")
    return True


def main(arguments: list[str]) -> int:
    if len(arguments) != 1:
        print(USAGE, file=sys.stderr)
        return 2
    upload(Path(arguments[0]).expanduser(), os.environ, subprocess.run)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
