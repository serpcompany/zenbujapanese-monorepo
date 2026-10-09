import json
import plistlib
import re
import unittest

from contract_checks import PROJECT, ROOT, app_build_settings, build_setting

ENTITLEMENTS = ROOT / "apps/ios/App/ZenbuJapanese.entitlements"
ICON = ROOT / "apps/ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json"
IPAD_ORIENTATIONS = {
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight",
}
MAC_SANDBOX = {
    "ENABLE_APP_SANDBOX": "YES",
    "ENABLE_HARDENED_RUNTIME": "YES",
    "ENABLE_OUTGOING_NETWORK_CONNECTIONS": "YES",
    "ENABLE_RESOURCE_ACCESS_AUDIO_INPUT": "YES",
    "ENABLE_USER_SELECTED_FILES": "readonly",
}


class AppPlatformTests(unittest.TestCase):
    def test_one_target_builds_for_iphone_ipad_and_the_mac(self) -> None:
        configurations = app_build_settings()
        self.assertEqual(len(configurations), 2)
        for settings in configurations:
            self.assertEqual(build_setting(settings, "TARGETED_DEVICE_FAMILY"), "1,2")
            self.assertEqual(
                build_setting(settings, "SUPPORTED_PLATFORMS"), "iphoneos iphonesimulator macosx"
            )
            self.assertEqual(build_setting(settings, "SUPPORTS_MACCATALYST"), "NO")
            self.assertEqual(build_setting(settings, "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD"), "NO")
            self.assertEqual(
                build_setting(settings, "PRODUCT_BUNDLE_IDENTIFIER"),
                "com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)",
            )

    def test_the_mac_build_is_apple_silicon_only_on_macos_26(self) -> None:
        project = PROJECT.read_text(encoding="utf-8")
        self.assertEqual(project.count("MACOSX_DEPLOYMENT_TARGET = 26.0;"), 2)
        for settings in app_build_settings():
            self.assertEqual(build_setting(settings, "ARCHS[sdk=macosx*]"), "arm64")

    def test_the_mac_build_runs_in_the_app_sandbox_with_only_what_it_uses(self) -> None:
        for settings in app_build_settings():
            granted = {
                key.removesuffix("[sdk=macosx*]"): value
                for key, value in re.findall(r'^\s*"?(\w+\[sdk=macosx\*\])"? = (\w+);$', settings, re.MULTILINE)
                if key.startswith("ENABLE_")
            }
            self.assertEqual(granted, MAC_SANDBOX)

    def test_iphone_stays_portrait_and_ipad_turns_every_way(self) -> None:
        for settings in app_build_settings():
            self.assertEqual(
                build_setting(settings, "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone"),
                "UIInterfaceOrientationPortrait",
            )
            ipad = set(build_setting(settings, "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad").split())
            self.assertEqual(ipad, IPAD_ORIENTATIONS)
            self.assertEqual(build_setting(settings, "INFOPLIST_KEY_UIRequiresFullScreen"), "<not set>")

    def test_privacy_strings_name_no_single_device(self) -> None:
        for settings in app_build_settings():
            for key in ("NSMicrophoneUsageDescription", "NSCameraUsageDescription"):
                self.assertNotIn("iPhone", build_setting(settings, f"INFOPLIST_KEY_{key}"), key)

    def test_no_profile_or_mac_signing_identity_is_committed(self) -> None:
        project = PROJECT.read_text(encoding="utf-8")
        self.assertNotIn("PROVISIONING_PROFILE", project)
        self.assertNotIn("CODE_SIGN_IDENTITY[sdk=macosx*]", project)

    def test_sign_in_with_apple_and_universal_links_stay_entitled(self) -> None:
        entitlements = plistlib.loads(ENTITLEMENTS.read_bytes())
        self.assertEqual(entitlements["com.apple.developer.applesignin"], ["Default"])
        self.assertEqual(
            entitlements["com.apple.developer.associated-domains"], ["applinks:zenbujapanese.com"]
        )

    def test_the_app_icon_has_every_mac_size(self) -> None:
        images = json.loads(ICON.read_text(encoding="utf-8"))["images"]
        mac = {(image["size"], image["scale"]) for image in images if image["idiom"] == "mac"}
        sizes = {f"{side}x{side}" for side in (16, 32, 128, 256, 512)}
        self.assertEqual(mac, {(size, scale) for size in sizes for scale in ("1x", "2x")})
        for image in images:
            self.assertTrue((ICON.parent / image["filename"]).is_file(), image["filename"])


if __name__ == "__main__":
    unittest.main()
