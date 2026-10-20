import plistlib
import re
import unittest

from project_settings import ROOT
from project_settings import app_build_settings as app_settings
from project_settings import share_extension_build_settings as share_extension_settings
from project_settings import build_setting as setting

APP = ROOT / "apps/ios/App"
POLICY = ROOT / "apps/ios/Modules/Sources/SearchExperience/Diagnostics/CrashReportingPolicy.swift"
SENTRY_INGEST = re.compile(r"^https://[0-9a-f]{32}@o\d+\.ingest\.us\.sentry\.io/\d+$")
REPORTS = {
    "NSPrivacyCollectedDataTypeDeviceID",
    "NSPrivacyCollectedDataTypeCustomerSupport",
    "NSPrivacyCollectedDataTypeCrashData",
    "NSPrivacyCollectedDataTypeOtherDiagnosticData",
}


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

    def test_the_privacy_manifest_declares_what_reports_send_as_linked(self) -> None:
        manifest = plistlib.loads((APP / "PrivacyInfo.xcprivacy").read_bytes())
        declared = {
            entry["NSPrivacyCollectedDataType"]: entry
            for entry in manifest["NSPrivacyCollectedDataTypes"]
        }
        self.assertLessEqual(REPORTS, declared.keys())
        for name in REPORTS:
            self.assertTrue(declared[name]["NSPrivacyCollectedDataTypeLinked"])
            self.assertFalse(declared[name]["NSPrivacyCollectedDataTypeTracking"])
            self.assertEqual(
                declared[name]["NSPrivacyCollectedDataTypePurposes"],
                ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
            )


if __name__ == "__main__":
    unittest.main()
