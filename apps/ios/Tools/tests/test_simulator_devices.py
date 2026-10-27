import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import simulator_devices


class DevicesTests(unittest.TestCase):
    def test_a_tool_that_fails_says_why(self) -> None:
        with self.assertRaises(SystemExit) as failed:
            simulator_devices.run("git", "no-such-command")
        self.assertIn("git no-such-command failed:", str(failed.exception))
        self.assertIn("is not a git command", str(failed.exception))

    def test_emptying_old_installs_deletes_only_what_is_inside_the_dead_folder(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            simulators = Path(scratch) / "Devices"
            outside = Path(scratch) / "outside"
            (outside / "kept").mkdir(parents=True)
            dead = simulator_devices.dead_installs("LIVE", simulators)
            (dead / "temp.abc" / "Zenbu Japanese.app").mkdir(parents=True)
            (dead / "temp.abc" / "Zenbu Japanese.app" / "Zenbu Japanese").write_bytes(b"x" * 1000)
            (dead / "loose").write_bytes(b"y" * 10)
            (dead / "linked").symlink_to(outside, target_is_directory=True)
            (dead / "temp.moving-in").mkdir()
            for name in ["temp.abc", "loose", "linked"]:
                os.utime(dead / name, (1, 1), follow_symlinks=False)
            moved_in = os.stat(dead / "temp.moving-in").st_mtime
            emptied, freed = simulator_devices.empty_dead_installs(
                "LIVE", simulators, now=lambda: moved_in + 1
            )
            self.assertEqual(emptied, 3)
            self.assertGreaterEqual(freed, 1010)
            self.assertEqual([entry.name for entry in dead.iterdir()], ["temp.moving-in"])
            self.assertTrue((outside / "kept").is_dir())
            self.assertEqual(simulator_devices.empty_dead_installs("GONE", simulators), (0, 0))


if __name__ == "__main__":
    unittest.main()
