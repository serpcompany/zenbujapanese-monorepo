from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from contract_checks import ROOT

sys.path.insert(0, str(ROOT / "language-data/tools"))
import rebuild_language_data


class RebuildStartTests(unittest.TestCase):
    def refusal(self, paths: dict[str, Path]) -> str | None:
        with mock.patch.object(rebuild_language_data, "tools_built_in_paths", return_value=paths):
            try:
                rebuild_language_data.refuse_missing_tool_paths()
            except SystemExit as refused:
                return str(refused)
        return None

    def test_refuses_to_start_naming_each_built_in_path_that_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            present = Path(scratch) / "present"
            present.mkdir()
            refusal = self.refusal(
                {
                    "tool_a.PRESENT": present,
                    "tool_a.MISSING": Path(scratch) / "missing",
                    "tool_b.ALSO_MISSING": Path(scratch) / "also-missing",
                }
            )
        self.assertIsNotNone(refusal)
        self.assertIn(f"tool_a.MISSING ({Path(scratch) / 'missing'})", refusal)
        self.assertIn(f"tool_b.ALSO_MISSING ({Path(scratch) / 'also-missing'})", refusal)
        self.assertNotIn("tool_a.PRESENT", refusal)
        self.assertIn("language-data/tools/README.md", refusal)

    def test_starts_when_every_built_in_path_exists(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            self.assertIsNone(self.refusal({"tool_a.PRESENT": Path(scratch)}))

    def test_reads_each_frequency_tools_built_in_path_as_a_path(self) -> None:
        paths = rebuild_language_data.tools_built_in_paths()
        self.assertEqual(4, len(paths))
        for name, path in paths.items():
            with self.subTest(name=name):
                self.assertIsInstance(path, Path)

    def test_every_frequency_tools_built_in_path_exists_in_this_checkout(self) -> None:
        for name, path in rebuild_language_data.tools_built_in_paths().items():
            with self.subTest(name=name):
                self.assertTrue(path.exists(), path)


if __name__ == "__main__":
    unittest.main()
