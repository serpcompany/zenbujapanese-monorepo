import plistlib
import re
import unittest

from contract_checks import ROOT

PROJECT = ROOT / "apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj"
INFO_PLIST = ROOT / "apps/ios/App/Info.plist"
BACKGROUND_SYNC = ROOT / "apps/ios/Modules/Sources/SearchExperience/AccountBackgroundSync.swift"
APP_STORE_BUNDLE_ID = "com.zenbujapanese.dictionary"
APP_STORE_TEAM = "847HR8U8D9"
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

    def test_every_build_signs_as_the_app_store_record_on_its_team(self) -> None:
        for name in ("Release", "Debug"):
            configurations = app_settings(name)
            self.assertEqual(len(configurations), 1)
            self.assertEqual(
                setting(configurations[0], "PRODUCT_BUNDLE_IDENTIFIER"),
                f"{APP_STORE_BUNDLE_ID}$(ZENBU_BUNDLE_ID_SUFFIX)",
            )
            self.assertEqual(setting(configurations[0], "DEVELOPMENT_TEAM"), APP_STORE_TEAM)

    def test_background_sync_runs_under_its_permitted_task_identifier(self) -> None:
        permitted = plistlib.loads(INFO_PLIST.read_bytes())["BGTaskSchedulerPermittedIdentifiers"]
        identifier = re.search(
            r'taskIdentifier = "([^"]+)"', BACKGROUND_SYNC.read_text(encoding="utf-8")
        )
        self.assertIsNotNone(identifier)
        self.assertEqual(permitted, [identifier.group(1)])


if __name__ == "__main__":
    unittest.main()
