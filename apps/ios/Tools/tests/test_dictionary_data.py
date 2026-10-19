import re
import unittest

from project_settings import ROOT

PACKAGE = ROOT / "apps/ios/Modules/Package.swift"
RESOURCES = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources"


def target_named(name: str) -> str:
    package = PACKAGE.read_text(encoding="utf-8")
    start = package.index(f'.target(\n      name: "{name}",')
    return package[start : package.index("\n    ),", start)]


class DictionaryDataTests(unittest.TestCase):
    def test_every_resource_is_bundled_excluded_or_the_targets_source(self) -> None:
        data = target_named("DictionaryData")
        handled = set(re.findall(r'\.process\("([^"]+)"\)', data))
        handled |= set(re.findall(r'exclude: \["([^"]+)"\]', data))
        handled |= set(re.findall(r'sources: \["([^"]+)"\]', data))
        on_disk = {path.name for path in RESOURCES.iterdir() if not path.name.startswith(".")}
        self.assertEqual(on_disk, handled)

    def test_the_search_code_leaves_the_data_to_its_own_target(self) -> None:
        search = target_named("SearchExperience")
        self.assertIn('exclude: ["Resources"]', search)
        self.assertNotIn("resources:", search)


if __name__ == "__main__":
    unittest.main()
