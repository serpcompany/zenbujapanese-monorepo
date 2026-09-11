"""Exercise runner ordering and failure accounting with isolated fake Apple tools."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).parents[1]


class RunnerLifecycleTests(unittest.TestCase):
    def run_runner(self, failure=""):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "bin"
            binary.mkdir()
            fake = '''import json, os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
args = sys.argv[1:]
def record(value):
    with open(os.environ["RUNNER_EVENTS"], "a") as output: output.write(value + "\\n")
if name == "python3":
    if len(args) > 1 and args[1] == "fingerprint":
        print(json.dumps({"source_fingerprint": "a" * 64, "build_fingerprint": "b" * 64}))
    else:
        os.execv(sys.executable, [sys.executable, *args])
elif name == "xcodebuild":
    if args[0] == "-version": print("Xcode test fixture")
    elif args[0] == "build-for-testing":
        record("build")
        if os.environ["RUNNER_FAILURE"] == "build": sys.exit(8)
    elif args[0] == "test-without-building":
        record("test")
        Path(args[args.index("-resultBundlePath") + 1]).mkdir()
    else: sys.exit(99)
elif args[:3] == ["simctl", "list", "runtimes"]:
    print(json.dumps({"runtimes": [{"identifier": "owned-runtime", "platform": "iOS", "version": "26.5", "isAvailable": True}]}))
elif args[:2] == ["simctl", "create"]: print("owned-test-device")
elif args[0] == "simctl":
    record(args[1])
    if args[1] == "bootstatus" and os.environ["RUNNER_FAILURE"] == "boot": sys.exit(9)
elif args[:4] == ["xcresulttool", "get", "test-results", "summary"]:
    print(json.dumps({"totalTestCount": 1, "result": "Passed"}))
elif args[:4] == ["xcresulttool", "get", "test-results", "tests"]:
    print(json.dumps({"testNodes": []}))
else: sys.exit(99)
'''
            for name in ("python3", "xcrun", "xcodebuild"):
                command = binary / name
                command.write_text(f"#!{sys.executable}\n" + fake)
                command.chmod(0o755)
            result_path = root / "result.xcresult"
            result = subprocess.run(
                ["bash", str(TOOLS / "run_ci_test_plan.sh"), "ZenbuPR", "test-device-type", str(result_path)],
                env={**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"],
                     "CI": "true", "ZENBU_POLICY_AUTHORIZED": "true",
                     "ZENBU_DERIVED_DATA": str(root / "products"),
                     "ZENBU_SOURCE_SHA": "candidate", "ZENBU_REQUIRES_PHOTOS_FIXTURE": "true",
                     "ZENBU_TIMING_SUMMARY": str(root / "timing.json"),
                     "RUNNER_EVENTS": str(root / "events"), "RUNNER_FAILURE": failure},
                capture_output=True, text=True,
            )
            events = (root / "events").read_text().splitlines()
            summary = json.loads((root / "timing.json").read_text())
            return result, events, summary

    def test_build_overlaps_boot_but_tests_require_boot_and_requested_fixture(self):
        result, events, summary = self.run_runner()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(events[0], "boot")
        self.assertCountEqual(events[1:3], ["build", "bootstatus"])
        self.assertEqual(events[3:], ["addmedia", "test", "shutdown", "delete"])
        self.assertEqual(summary["tests_started"], 1)
        self.assertEqual(summary["failure"]["classification"], "success")

    def test_boot_failure_keeps_build_evidence_and_never_starts_tests(self):
        result, events, summary = self.run_runner("boot")
        self.assertEqual(result.returncode, 9, result.stderr)
        self.assertEqual(events[0], "boot")
        self.assertCountEqual(events[1:3], ["build", "bootstatus"])
        self.assertEqual(events[3:], ["shutdown", "delete"])
        self.assertEqual(summary["tests_started"], 0)
        self.assertEqual(summary["durations_seconds"]["test"], 0)
        self.assertGreater(summary["durations_seconds"]["build"], 0)
        self.assertEqual(summary["failure"]["classification"], "post-build-setup-failure")

    def test_build_failure_cleans_up_without_starting_tests(self):
        result, events, summary = self.run_runner("build")
        self.assertEqual(result.returncode, 8, result.stderr)
        self.assertEqual(events[0], "boot")
        self.assertEqual(events[-2:], ["shutdown", "delete"])
        self.assertIn("build", events)
        self.assertNotIn("test", events)
        self.assertEqual(summary["failure"]["classification"], "build-failure")


if __name__ == "__main__":
    unittest.main()
