from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import locations


def push_paths(workflow: Path) -> list[str]:
    lines = workflow.read_text().splitlines()
    start = lines.index("  push:")
    paths, in_paths = [], False
    for line in lines[start + 1 :]:
        if line and not line.startswith("    "):
            break
        stripped = line.strip()
        if stripped == "paths:":
            in_paths = True
        elif in_paths and stripped.startswith("- "):
            paths.append(stripped[2:].strip("'\""))
        elif in_paths and stripped and not stripped.startswith("#"):
            in_paths = False
    return paths


class WorkflowTriggerTests(unittest.TestCase):
    def test_every_release_input_root_triggers_both_workflows(self):
        roots = json.loads((locations.LANGUAGE_DATA / "release-inputs.json").read_text())["roots"]
        workflows = locations.REPO_ROOT / ".github" / "workflows"
        for name in ("language-data-build.yml", "language-data-release.yml"):
            filters = push_paths(workflows / name)
            self.assertTrue(filters, name)
            prefixes = [f[: -len("/**")] for f in filters if f.endswith("/**")]
            for root, path in roots.items():
                with self.subTest(workflow=name, root=root):
                    self.assertTrue(
                        any(path == p or path.startswith(p + "/") for p in prefixes),
                        f"{name} doesn't trigger on {path}/** ({root}): {filters}",
                    )


if __name__ == "__main__":
    unittest.main()
