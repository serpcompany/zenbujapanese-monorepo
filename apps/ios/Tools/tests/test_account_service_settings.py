import unittest

from contract_checks import app_build_settings as app_settings
from contract_checks import build_setting as setting

GOOGLE_IOS_CLIENT_ID = "881343714137-8v279fqjrkk1qeg18opnqbac41jteoqq.apps.googleusercontent.com"


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
