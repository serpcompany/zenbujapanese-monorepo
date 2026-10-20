import json
import re
import unittest
from pathlib import Path

from project_settings import ROOT

MODULES = ROOT / "apps/ios/Modules"
APP_PACKAGES = ROOT / "apps/ios/ZenbuJapanese.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
RESOLVED = (APP_PACKAGES / "Package.resolved", MODULES / "Package.resolved")
MANIFEST = MODULES / "Package.swift"
CREDITS = MODULES / "Sources/SearchExperience/CreditsView.swift"
RESOURCES = MODULES / "Sources/SearchExperience/Resources"
DEPENDENCY = re.compile(r'\.package\(\s*url: "[^"]*/([^/"]+?)(?:\.git)?"')
LISTED = re.compile(r"static let listed = \[(?P<rows>.*?)\n  \]", re.DOTALL)
ROW = re.compile(r"BundledLicenseText\((?P<fields>.*?)\)", re.DOTALL)
FIELD = re.compile(r'(\w+): "([^"]*)"')
COPYRIGHT_LINE = re.compile(r"^Copyright ", re.MULTILINE)


def linked_packages() -> set[str]:
    resolved = {
        pin["identity"]
        for path in RESOLVED
        for pin in json.loads(path.read_text(encoding="utf-8"))["pins"]
    }
    declared = DEPENDENCY.findall(MANIFEST.read_text(encoding="utf-8"))
    return resolved | {name.lower() for name in declared}


def listed_license_texts() -> list[dict[str, str]]:
    listed = LISTED.search(CREDITS.read_text(encoding="utf-8"))
    if listed is None:
        raise AssertionError(f"{CREDITS} has no BundledLicenseText.listed")
    return [dict(FIELD.findall(row["fields"])) for row in ROW.finditer(listed["rows"])]


def bundled_file(text: dict[str, str]) -> Path:
    name = f'{text["resource"]}.{text.get("resourceExtension", "txt")}'
    folder = text.get("subdirectory")
    return RESOURCES / folder / name if folder else RESOURCES / name


class PackageLicenseTests(unittest.TestCase):
    def test_every_swift_package_the_app_links_has_a_license_text_on_the_licenses_screen(
        self,
    ) -> None:
        listed = {text["package"] for text in listed_license_texts() if "package" in text}
        missing = sorted(linked_packages() - listed)
        self.assertEqual(
            missing,
            [],
            "Swift packages without a license text on the Licenses screen: "
            f"{', '.join(missing)}. Bundle each one's license, verbatim from the version "
            "Package.resolved pins, under the app's Resources, and list it in "
            "BundledLicenseText.listed (CreditsView.swift) with its package identity.",
        )

    def test_each_package_license_text_is_bundled_with_its_copyright_line(self) -> None:
        manifest = MANIFEST.read_text(encoding="utf-8")
        packages = [text for text in listed_license_texts() if "package" in text]
        self.assertNotEqual(packages, [])
        for text in packages:
            with self.subTest(package=text["package"]):
                path = bundled_file(text)
                self.assertIn(f'.process("{path.relative_to(RESOURCES).parts[0]}")', manifest)
                self.assertRegex(path.read_text(encoding="utf-8"), COPYRIGHT_LINE)


if __name__ == "__main__":
    unittest.main()
