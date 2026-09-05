import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "increased_contrast", Path(__file__).parents[1] / "increased_contrast.py"
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class IncreasedContrastTests(unittest.TestCase):
    def test_restores_original_setting_after_success_and_test_failure(self):
        for original in ("enabled", "disabled"):
            for result in (0, 65):
                with self.subTest(original=original, result=result):
                    calls = []
                    setting = original

                    def run(command, **kwargs):
                        nonlocal setting
                        calls.append(command)
                        if command == ["test-command"]:
                            self.assertEqual(setting, "enabled")
                            return subprocess.CompletedProcess(command, result)
                        if len(command) == 6:
                            setting = command[-1]
                        return subprocess.CompletedProcess(command, 0, stdout=setting)

                    with patch.object(module.subprocess, "run", side_effect=run):
                        self.assertEqual(module.run("owned-device", ["test-command"]), result)
                    self.assertEqual(setting, original)
                    self.assertEqual(calls[-1], ["xcrun", "simctl", "ui", "owned-device", "increase_contrast"])

    def test_unconfirmed_enable_never_starts_tests_and_restores(self):
        calls = []

        def run(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, stdout="disabled")

        with patch.object(module.subprocess, "run", side_effect=run):
            with self.assertRaisesRegex(RuntimeError, "did not enable"):
                module.run("owned-device", ["test-command"])
        self.assertNotIn(["test-command"], calls)
        self.assertIn(["xcrun", "simctl", "ui", "owned-device", "increase_contrast", "disabled"], calls)

    def test_command_exception_and_interruption_restore_before_propagating(self):
        for failure in (OSError("launch failed"), KeyboardInterrupt()):
            setting = "disabled"

            def run(command, **kwargs):
                nonlocal setting
                if command == ["test-command"]:
                    raise failure
                if len(command) == 6:
                    setting = command[-1]
                return subprocess.CompletedProcess(command, 0, stdout=setting)

            with patch.object(module.subprocess, "run", side_effect=run):
                with self.assertRaises(type(failure)):
                    module.run("owned-device", ["test-command"])
            self.assertEqual(setting, "disabled")

    def test_failed_restore_is_not_reported_as_a_pass(self):
        def run(command, **kwargs):
            if command == ["test-command"]:
                return subprocess.CompletedProcess(command, 0)
            if command[-1] == "disabled":
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0, stdout=next(states))

        states = iter(["disabled", "", "enabled"])
        with patch.object(module.subprocess, "run", side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                module.run("owned-device", ["test-command"])


if __name__ == "__main__":
    unittest.main()
