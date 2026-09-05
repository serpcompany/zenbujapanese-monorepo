"""Run the dedicated contrast lane with a verified, restored Simulator setting."""

import argparse
import signal
import subprocess


def run(device: str, command: list[str]) -> int:
    control = ["xcrun", "simctl", "ui", device, "increase_contrast"]

    def read() -> str:
        value = subprocess.run(control, check=True, capture_output=True, text=True).stdout.strip()
        if value not in ("enabled", "disabled"):
            raise RuntimeError(f"unrecognized Increase Contrast setting: {value!r}")
        return value

    original = read()
    try:
        subprocess.run([*control, "enabled"], check=True)
        if read() != "enabled":
            raise RuntimeError("Simulator did not enable Increase Contrast")
        print(f"increase_contrast_device={device} prior={original} verified=enabled", flush=True)
        return subprocess.run(command, check=False).returncode
    finally:
        subprocess.run([*control, original], check=True)
        if read() != original:
            raise RuntimeError("Simulator did not restore Increase Contrast")
        print(f"increase_contrast_device={device} restored={original}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    command = options.command
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        parser.error("a test command is required")

    def interrupted(signum, frame):
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    return run(options.device, command)


if __name__ == "__main__":
    raise SystemExit(main())
