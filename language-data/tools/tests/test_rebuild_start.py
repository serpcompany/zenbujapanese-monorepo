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
    def refusal(self, paths: list[Path]) -> str | None:
        with mock.patch.object(rebuild_language_data, "tools_built_in_paths", return_value=paths):
            try:
                rebuild_language_data.refuse_missing_tool_paths()
            except SystemExit as refused:
                return str(refused)
        return None

    def test_refuses_to_start_naming_each_built_in_path_that_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            present = Path(scratch)
            missing = present / "Modules/Sources/SearchExperience/Resources"
            refusal = self.refusal([present, missing])
        self.assertIsNotNone(refusal)
        self.assertIn(str(missing), refusal)
        self.assertNotIn(f"{present},", refusal)
        self.assertIn("language-data/tools/README.md", refusal)

    def test_starts_when_every_built_in_path_exists(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            self.assertIsNone(self.refusal([Path(scratch)]))


if __name__ == "__main__":
    unittest.main()
