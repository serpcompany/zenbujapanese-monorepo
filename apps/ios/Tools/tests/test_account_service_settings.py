import re
import unittest

from contract_checks import ROOT

PROJECT = ROOT / "apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj"
GOOGLE_IOS_CLIENT_ID = "881343714137-8v279fqjrkk1qeg18opnqbac41jteoqq.apps.googleusercontent.com"
CONFIGURATION = re.compile(
    r"isa = XCBuildConfiguration;\s*buildSettings = \{(?P<settings>.*?)\};\s*name = (?P<name>\w+);",
    re.DOTALL,
)


def app_settings(name: str) -> list[str]:
    return [
        found["settings"]
        for found in CONFIGURATION.finditer(PROJECT.read_text(encoding="utf-8"))
        if found["name"] == name and "PRODUCT_BUNDLE_IDENTIFIER" in found["settings"]
    ]


def setting(settings: str, key: str) -> str:
    found = re.search(rf"^\s*{key} = (.*);$", settings, re.MULTILINE)
    return "<not set>" if found is None else found.group(1).strip('"')


class AccountServiceSettingsTests(unittest.TestCase):
    def test_release_builds_offer_no_sign_in_until_production_answers(self) -> None:
        releases = app_settings("Release")
        self.assertEqual(len(releases), 1)
        self.assertEqual(setting(releases[0], "ZENBU_ACCOUNT_API_URL"), "")
        self.assertEqual(setting(releases[0], "ZENBU_GOOGLE_IOS_CLIENT_ID"), "")

    def test_debug_builds_and_zenbu_dev_use_staging(self) -> None:
        debugs = app_settings("Debug")
        self.assertEqual(len(debugs), 1)
        self.assertEqual(
            setting(debugs[0], "ZENBU_ACCOUNT_API_URL"), "https://api-staging.zenbujapanese.com"
        )

    def test_debug_builds_offer_google_with_the_ios_client(self) -> None:
        debugs = app_settings("Debug")
        self.assertEqual(len(debugs), 1)
        self.assertEqual(setting(debugs[0], "ZENBU_GOOGLE_IOS_CLIENT_ID"), GOOGLE_IOS_CLIENT_ID)


if __name__ == "__main__":
    unittest.main()
