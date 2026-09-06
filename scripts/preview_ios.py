#!/usr/bin/env python3
"""Disposable, local-only iOS issue preview. Requires Xcode and an iOS 26 runtime."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import uuid


def run(*args, capture=False, **kwargs):
    result = subprocess.run(args, check=True, text=True,
                            **({"stdout": subprocess.PIPE} if capture else {}), **kwargs)
    return result.stdout.strip() if capture else None


def main():
    if len(sys.argv) not in (2, 3) or sys.argv[1] != "issue-313" or (
        len(sys.argv) == 3 and sys.argv[2] != "--clean"
    ):
        raise RuntimeError("Usage: ./scripts/preview-ios.sh issue-313 [--clean]")
    for tool in ("git", "xcodebuild", "xcrun"):
        if not shutil.which(tool):
            raise RuntimeError(f"Install {tool}; select full Xcode with xcode-select.")
    source = pathlib.Path(__file__).resolve().parent.parent
    repo_key = hashlib.sha256(str(source).encode()).hexdigest()[:12]
    root = pathlib.Path.home() / "Library/Caches/ZenbuPreviews" / repo_key / "issue-313"
    manifest = root / "owner.json"
    checkout = root / "checkout"
    branch = "codex/issue-313-native-search"
    if root.exists() and not manifest.exists():
        raise RuntimeError(f"Unrecognized directory; refusing to change {root}")
    state = json.loads(manifest.read_text()) if manifest.exists() else {
        "source": str(source), "token": str(uuid.uuid4()), "device": None
    }
    if state.get("source") != str(source):
        raise RuntimeError("Preview ownership does not match this checkout.")
    name = "Zenbu Preview issue-313 " + state["token"]
    devices = json.loads(run("xcrun", "simctl", "list", "devices", "--json", capture=True))
    owned = next((d for group in devices["devices"].values() for d in group
                  if d["udid"] == state["device"]), None)
    if owned and owned["name"] != name:
        raise RuntimeError("Simulator identity changed; refusing to operate on it.")
    if len(sys.argv) == 3:
        if not manifest.exists():
            print("No preview to clean.")
            return
        if checkout.exists() and run("git", "-C", str(checkout), "status", "--porcelain", capture=True):
            raise RuntimeError(f"Preview checkout has edits; preserve them before cleanup: {checkout}")
        if owned:
            if owned["state"] == "Booted":
                run("xcrun", "simctl", "shutdown", owned["udid"])
            run("xcrun", "simctl", "delete", owned["udid"])
        shutil.rmtree(root)
        print("Removed this preview's checkout, build and Simulator. Branch/PR preserved.")
        return
    run("xcodebuild", "-version")
    runtimes = json.loads(run("xcrun", "simctl", "list", "runtimes", "--json", capture=True))["runtimes"]
    runtimes = [r for r in runtimes if r.get("isAvailable") and "iOS" in r["name"]
                and int(r["version"].split(".")[0]) >= 26]
    if not runtimes:
        raise RuntimeError("Install an iOS 26 Simulator runtime in Xcode Settings > Components.")
    runtime = max(runtimes, key=lambda r: tuple(map(int, r["version"].split("."))))
    root.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(state, indent=2))
    if not checkout.exists():
        run("git", "clone", "--no-hardlinks", "--no-checkout", str(source), str(checkout))
    if run("git", "-C", str(checkout), "status", "--porcelain", capture=True):
        # An initial --no-checkout clone has no HEAD worktree yet.
        if (checkout / "apps").exists():
            raise RuntimeError(f"Preview checkout has edits; refusing to overwrite: {checkout}")
    # The local issue branch is the reviewed source; never switch the owner's checkout.
    commit = run("git", "-C", str(source), "rev-parse", "--verify", branch + "^{commit}", capture=True)
    run("git", "-C", str(checkout), "fetch", "origin", branch)
    run("git", "-C", str(checkout), "checkout", "--detach", commit)
    print(f"Preview source: {branch} @ {commit}", flush=True)
    run(sys.executable, str(checkout / "apps/ios/Tools/prepare_sudachi_core.py"),
        "--manifest", str(checkout / "apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json"),
        "--cache", str(pathlib.Path.home() / "Library/Caches/com.zenbujapanese.build/SudachiCore"), "--cache-only")
    if not owned:
        state["device"] = run("xcrun", "simctl", "create", name,
                              "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max",
                              runtime["identifier"], capture=True)
        manifest.write_text(json.dumps(state, indent=2))
    device = state["device"]
    log = root / "build.log"
    print(f"Building; log: {log}", flush=True)
    with log.open("w") as output:
        try:
            run("xcodebuild", "-project", str(checkout / "apps/ios/ZenbuJapanese.xcodeproj"),
                "-scheme", "ZenbuJapanese", "-configuration", "Debug",
                "-destination", f"platform=iOS Simulator,id={device}",
                "-derivedDataPath", str(root / "build"), "CODE_SIGNING_ALLOWED=NO", "build",
                stdout=output, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError:
            raise RuntimeError(f"Build failed. Read {log}; then rerun the same preview command.")
    if not owned or owned["state"] != "Booted":
        run("xcrun", "simctl", "boot", device)
    run("xcrun", "simctl", "bootstatus", device, "-b")
    product = root / "build/Build/Products/Debug-iphonesimulator/Zenbu Japanese.app"
    run("xcrun", "simctl", "install", device, str(product))
    run("xcrun", "simctl", "launch", "--terminate-running-process", device, "com.zenbujapanese.dictionary")
    run("open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", device)
    print(f"Ready: {commit}\nRerun this command anytime; use --clean to discard this preview.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(f"Preview error: {error}", file=sys.stderr)
        sys.exit(1)
