import plistlib
import re
import unittest

from project_settings import BUILD_CONFIGURATION, PROJECT, ROOT
from project_settings import app_build_settings as app_settings
from project_settings import build_setting as setting

APP = ROOT / "apps/ios/App"
POLICY = ROOT / "apps/ios/Modules/Sources/SearchExperience/Diagnostics/CrashReportingPolicy.swift"
SENTRY_INGEST = re.compile(r"^https://[0-9a-f]{32}@o\d+\.ingest\.us\.sentry\.io/\d+$")
DIAGNOSTICS = {
    "NSPrivacyCollectedDataTypeCrashData",
    "NSPrivacyCollectedDataTypeOtherDiagnosticData",
}


def share_extension_settings() -> list[str]:
    return [
        found["settings"]
        for found in BUILD_CONFIGURATION.finditer(PROJECT.read_text(encoding="utf-8"))
        if "INFOPLIST_FILE = ShareExtension/Info.plist;" in found["settings"]
    ]


class CrashReportSettingsTests(unittest.TestCase):
    def test_only_a_release_build_carries_the_sentry_destination(self) -> None:
        releases = app_settings("Release")
        self.assertEqual(len(releases), 1)
        self.assertRegex(setting(releases[0], "ZENBU_CRASH_REPORTS_DSN"), SENTRY_INGEST)
        debugs = app_settings("Debug")
        self.assertEqual(len(debugs), 1)
        self.assertEqual(setting(debugs[0], "ZENBU_CRASH_REPORTS_DSN"), "")

    def test_the_share_extension_never_reports(self) -> None:
        extensions = share_extension_settings()
        self.assertEqual(len(extensions), 2)
        for settings in extensions:
            self.assertEqual(setting(settings, "ZENBU_CRASH_REPORTS_DSN"), "<not set>")

    def test_the_destination_reaches_the_key_the_app_reads(self) -> None:
        info = plistlib.loads((APP / "Info.plist").read_bytes())
        key = re.search(
            r'destinationInfoKey = "([^"]+)"', POLICY.read_text(encoding="utf-8")
        )
        self.assertIsNotNone(key)
        self.assertEqual(info[key.group(1)], "$(ZENBU_CRASH_REPORTS_DSN)")

    def test_the_privacy_manifest_declares_unlinked_diagnostics(self) -> None:
        manifest = plistlib.loads((APP / "PrivacyInfo.xcprivacy").read_bytes())
        declared = {
            entry["NSPrivacyCollectedDataType"]: entry
            for entry in manifest["NSPrivacyCollectedDataTypes"]
        }
        self.assertLessEqual(DIAGNOSTICS, declared.keys())
        for name in DIAGNOSTICS:
            self.assertFalse(declared[name]["NSPrivacyCollectedDataTypeLinked"])
            self.assertFalse(declared[name]["NSPrivacyCollectedDataTypeTracking"])
            self.assertEqual(
                declared[name]["NSPrivacyCollectedDataTypePurposes"],
                ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
            )


if __name__ == "__main__":
    unittest.main()
