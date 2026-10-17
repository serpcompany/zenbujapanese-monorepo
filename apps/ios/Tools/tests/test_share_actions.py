import plistlib
import re
import unittest

from contract_checks import BUILD_CONFIGURATION, PROJECT, ROOT, build_setting

APP = ROOT / "apps/ios/App"
SHARE_ACTIONS = ROOT / "apps/ios/ShareActions"
IMAGE_IMPORT = ROOT / "apps/ios/Modules/Sources/SearchExperience/ImageTextImport.swift"
APP_BUNDLE_ID = "com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)"
APP_GROUP = "group.com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)"
ACTIONS = {
    "LookUpShareAction": ("look-up", "Look Up in Zenbu", "NSExtensionActivationSupportsText"),
    "TranslateShareAction": ("translate", "Translate with Zenbu", "NSExtensionActivationSupportsText"),
    "ImageSearchShareAction": (
        "image-search",
        "Image Search in Zenbu",
        "NSExtensionActivationSupportsImageWithMaxCount",
    ),
}


def action_settings(action: str) -> list[str]:
    return [
        found["settings"]
        for found in BUILD_CONFIGURATION.finditer(PROJECT.read_text(encoding="utf-8"))
        if f"INFOPLIST_FILE = \"ShareActions/{action}-Info.plist\";" in found["settings"]
    ]


class ShareActionTests(unittest.TestCase):
    def test_each_action_is_an_extension_of_the_app_in_every_build(self) -> None:
        for action, (suffix, title, _) in ACTIONS.items():
            configurations = action_settings(action)
            self.assertEqual(len(configurations), 2, action)
            for settings in configurations:
                self.assertEqual(
                    build_setting(settings, "PRODUCT_BUNDLE_IDENTIFIER"), f"{APP_BUNDLE_ID}.{suffix}"
                )
                self.assertEqual(build_setting(settings, "ZENBU_BUNDLE_ID_SUFFIX"), "")
                self.assertEqual(build_setting(settings, "DEVELOPMENT_TEAM"), "847HR8U8D9")
                self.assertEqual(build_setting(settings, "INFOPLIST_KEY_CFBundleDisplayName"), title)
                self.assertEqual(
                    build_setting(settings, "SUPPORTED_PLATFORMS"), "iphoneos iphonesimulator macosx"
                )
                self.assertEqual(
                    build_setting(settings, "CODE_SIGN_ENTITLEMENTS"),
                    "ShareActions/ShareActions.entitlements",
                )
                self.assertEqual(
                    build_setting(settings, "ZENBU_SHARE_EXTENSION_POINT"), "com.apple.ui-services"
                )
                self.assertEqual(
                    build_setting(settings, "ZENBU_SHARE_EXTENSION_POINT[sdk=macosx*]"),
                    "com.apple.share-services",
                )
                self.assertEqual(build_setting(settings, "ENABLE_APP_SANDBOX[sdk=macosx*]"), "YES")
                self.assertEqual(
                    build_setting(settings, "ASSETCATALOG_COMPILER_APPICON_NAME[sdk=iphone*]"), "ActionIcon"
                )

    def test_the_action_icon_is_a_glyph_ios_can_draw_as_a_template(self) -> None:
        icon = SHARE_ACTIONS / "Assets.xcassets/ActionIcon.appiconset/ActionIcon.png"
        header = icon.read_bytes()[:26]
        self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(header[16:20], "big"), 1024)
        self.assertEqual(header[25], 6, "an RGBA PNG, whose alpha is the glyph")

    def test_each_action_names_its_class_and_what_it_takes(self) -> None:
        image_limit = re.search(r"static let importLimit = (\d+)", IMAGE_IMPORT.read_text())
        self.assertIsNotNone(image_limit)
        for action, (_, _, rule) in ACTIONS.items():
            info = plistlib.loads((SHARE_ACTIONS / f"{action}-Info.plist").read_bytes())["NSExtension"]
            self.assertEqual(info["NSExtensionPointIdentifier"], "$(ZENBU_SHARE_EXTENSION_POINT)")
            self.assertEqual(info["NSExtensionPrincipalClass"], f"$(PRODUCT_MODULE_NAME).{action}")
            source = (SHARE_ACTIONS / f"{action}.swift").read_text(encoding="utf-8")
            self.assertIn(f"final class {action}: ShareActionController", source)
            activation = info["NSExtensionAttributes"]["NSExtensionActivationRule"]
            expected = int(image_limit.group(1)) if rule.endswith("MaxCount") else True
            self.assertEqual(activation, {rule: expected}, action)

    def test_the_app_and_its_actions_share_one_app_group(self) -> None:
        for entitlements in (APP / "ZenbuJapanese.entitlements", SHARE_ACTIONS / "ShareActions.entitlements"):
            granted = plistlib.loads(entitlements.read_bytes())
            self.assertEqual(granted["com.apple.security.application-groups"], [APP_GROUP])

    def test_the_app_opens_its_own_links_and_embeds_every_action(self) -> None:
        info = plistlib.loads((APP / "Info.plist").read_bytes())
        self.assertEqual(
            info["CFBundleURLTypes"][0]["CFBundleURLSchemes"], ["$(PRODUCT_BUNDLE_IDENTIFIER)"]
        )
        project = PROJECT.read_text(encoding="utf-8")
        embedded = re.search(
            r"/\* Embed Foundation Extensions \*/ = \{.*?dstSubfolderSpec = 13;\s*files = \((?P<files>.*?)\);",
            project,
            re.DOTALL,
        )
        self.assertIsNotNone(embedded)
        for action in ACTIONS:
            self.assertIn(f"{action}.appex in Embed Foundation Extensions", embedded.group("files"))

    def test_the_actions_carry_the_apps_version(self) -> None:
        project = PROJECT.read_text(encoding="utf-8")
        for setting in ("CURRENT_PROJECT_VERSION", "MARKETING_VERSION"):
            self.assertEqual(len(re.findall(rf"^\s*{setting} = ", project, re.MULTILINE)), 2, setting)
        for found in BUILD_CONFIGURATION.finditer(project):
            if "IPHONEOS_DEPLOYMENT_TARGET" in found["settings"]:
                self.assertNotEqual(build_setting(found["settings"], "CURRENT_PROJECT_VERSION"), "<not set>")


if __name__ == "__main__":
    unittest.main()
