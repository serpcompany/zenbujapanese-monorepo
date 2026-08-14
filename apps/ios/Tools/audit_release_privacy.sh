#!/usr/bin/env bash

set -euo pipefail

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_dir="$(cd "${tool_dir}/.." && pwd)"
repo_dir="$(cd "${ios_dir}/../.." && pwd)"
manifest="${ios_dir}/App/PrivacyInfo.xcprivacy"
project="${ios_dir}/ZenbuJapanese.xcodeproj/project.pbxproj"
archive_path="${1:-}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$2" 2>/dev/null
}

[[ -f "$manifest" ]] || fail "missing ${manifest}"
plutil -lint "$manifest" >/dev/null
[[ "$(plist_value NSPrivacyTracking "$manifest")" == "false" ]] || fail "tracking must be false"
[[ "$(plist_value NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPIType "$manifest")" == "NSPrivacyAccessedAPICategoryFileTimestamp" ]] || fail "missing file metadata API category"
[[ "$(plist_value NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0 "$manifest")" == "3B52.1" ]] || fail "missing user-selected file metadata reason"
[[ "$(plist_value NSPrivacyAccessedAPITypes:1:NSPrivacyAccessedAPIType "$manifest")" == "NSPrivacyAccessedAPICategoryUserDefaults" ]] || fail "missing UserDefaults API category"
[[ "$(plist_value NSPrivacyAccessedAPITypes:1:NSPrivacyAccessedAPITypeReasons:0 "$manifest")" == "CA92.1" ]] || fail "missing app-only UserDefaults reason"
rg -q 'PrivacyInfo\.xcprivacy in Resources' "$project" || fail "privacy manifest is not in the app resources phase"
pass "source privacy manifest is valid and included in the app target"

if rg -n --glob '*.swift' 'URLSession|CloudKit|CKContainer|NWConnection|import[[:space:]]+Network' "${ios_dir}/App" "${ios_dir}/Modules/Sources"; then
  fail "source contains an unreviewed app networking or cloud API"
fi
if rg -n 'XCRemoteSwiftPackageReference|repositoryURL' "$project"; then
  fail "project contains an unreviewed remote Swift package"
fi
rg -q 'INFOPLIST_KEY_NSCameraUsageDescription = "Zenbu uses the camera to recognize Japanese text in a photo you choose to capture\.";' "$project" || fail "camera usage description is missing or changed"
rg -q 'https://zenbujapanese\.com/privacy' "${ios_dir}/Modules/Sources/LookupReplica/DictionarySourcesView.swift" || fail "in-app privacy link is missing"
rg -q 'https://zenbujapanese\.com/support' "${ios_dir}/Modules/Sources/LookupReplica/DictionarySourcesView.swift" || fail "in-app support link is missing"
pass "source privacy boundary, camera copy, and public links match the release contract"

if [[ -z "$archive_path" ]]; then
  echo "INFO: source audit complete; pass an .xcarchive path to inspect the frozen archive"
  exit 0
fi

[[ -d "$archive_path" ]] || fail "archive does not exist: ${archive_path}"
app_path="$(find "$archive_path/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit 2>/dev/null || true)"
[[ -n "$app_path" ]] || fail "archive contains no application bundle"
archive_manifest="${app_path}/PrivacyInfo.xcprivacy"
archive_info="${app_path}/Info.plist"
[[ -f "$archive_manifest" ]] || fail "archive application is missing PrivacyInfo.xcprivacy"
plutil -lint "$archive_manifest" >/dev/null
cmp -s "$manifest" "$archive_manifest" || fail "archive privacy manifest differs from the reviewed source manifest"
[[ "$(plist_value NSCameraUsageDescription "$archive_info")" == "Zenbu uses the camera to recognize Japanese text in a photo you choose to capture." ]] || fail "archive camera usage description is missing or changed"
pass "archive contains the reviewed privacy manifest and camera copy"

if find "$app_path" -type d -name 'ImageTextFixtures' -print -quit | rg -q .; then
  fail "archive includes DEBUG-only Image Text fixtures"
fi
if find "$app_path" -type f \( -name '*.xctest' -o -name '*.xcresult' \) -print -quit | rg -q .; then
  fail "archive application contains test artifacts"
fi
if rg -a -n -m 1 'docs/clone-discovery|clipy\.online|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' "$app_path"; then
  fail "archive contains private evidence, a private path, or credential-shaped material"
fi
pass "archive contains no known DEBUG fixtures, test artifacts, private evidence paths, or credential-shaped material"

executable_name="$(plist_value CFBundleExecutable "$archive_info")"
executable="${app_path}/${executable_name}"
[[ -x "$executable" ]] || fail "archive executable is missing"
echo "INFO: linked libraries"
otool -L "$executable"
echo "INFO: signed entitlements"
codesign -d --entitlements :- "$app_path" 2>/dev/null || true
echo "INFO: archive application SHA-256"
find "$app_path" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256
pass "frozen archive privacy audit complete"
