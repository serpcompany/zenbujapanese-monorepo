import plistlib
import unittest

from project_settings import BUILD_CONFIGURATION, PROJECT, ROOT, build_setting
from project_settings import share_extension_build_settings as extension_build_settings

APP_ENTITLEMENTS = ROOT / "apps/ios/App/ZenbuJapanese.entitlements"
EXTENSION = ROOT / "apps/ios/ShareExtension"
APP_GROUP = "group.com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)"


class ShareExtensionTests(unittest.TestCase):
    def test_the_extension_is_the_apps_with_share_on_iphone_and_ipad(self) -> None:
        configurations = extension_build_settings()
        self.assertEqual(len(configurations), 2)
        for settings in configurations:
            self.assertEqual(
                build_setting(settings, "PRODUCT_BUNDLE_IDENTIFIER"),
                "com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX).share",
            )
            self.assertEqual(
                build_setting(settings, "SUPPORTED_PLATFORMS"), "iphoneos iphonesimulator"
            )
            self.assertEqual(build_setting(settings, "TARGETED_DEVICE_FAMILY"), "1,2")
            self.assertEqual(build_setting(settings, "DEVELOPMENT_TEAM"), "847HR8U8D9")

    def test_only_iphone_and_ipad_builds_embed_it(self) -> None:
        embedded = "ZenbuShare.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile;"
        lines = PROJECT.read_text(encoding="utf-8").splitlines()
        embed = [line for line in lines if embedded in line]
        self.assertEqual(len(embed), 1)
        self.assertIn("platformFilters = (ios, );", embed[0])

    def test_the_app_and_its_extension_share_one_version(self) -> None:
        project = PROJECT.read_text(encoding="utf-8")
        configurations = [found["settings"] for found in BUILD_CONFIGURATION.finditer(project)]
        with_version = [settings for settings in configurations if "MARKETING_VERSION" in settings]
        self.assertEqual(len(with_version), 2)
        for settings in with_version:
            self.assertIn("CLANG_ENABLE_MODULES", settings)
            self.assertNotEqual(build_setting(settings, "CURRENT_PROJECT_VERSION"), "<not set>")

    def test_the_app_and_its_extension_share_an_app_group(self) -> None:
        extension = plistlib.loads((EXTENSION / "ZenbuShare.entitlements").read_bytes())
        app = plistlib.loads(APP_ENTITLEMENTS.read_bytes())
        self.assertEqual(extension["com.apple.security.application-groups"], [APP_GROUP])
        self.assertEqual(app["com.apple.security.application-groups"], [APP_GROUP])

    def test_the_extension_takes_text_or_one_image(self) -> None:
        info = plistlib.loads((EXTENSION / "Info.plist").read_bytes())["NSExtension"]
        self.assertEqual(info["NSExtensionPointIdentifier"], "com.apple.share-services")
        rule = info["NSExtensionAttributes"]["NSExtensionActivationRule"]
        self.assertEqual(
            rule,
            {
                "NSExtensionActivationSupportsText": True,
                "NSExtensionActivationSupportsImageWithMaxCount": 1,
            },
        )


if __name__ == "__main__":
    unittest.main()
