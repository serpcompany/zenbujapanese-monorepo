#!/usr/bin/env bash

set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_dir="$(cd "${tool_dir}/.." && pwd)"
manifest="${ios_dir}/App/PrivacyInfo.xcprivacy"
project="${ios_dir}/ZenbuJapanese.xcodeproj/project.pbxproj"
package_manifest="${ios_dir}/Modules/Package.swift"
language_database="${ios_dir}/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
language_import_manifest="${ios_dir}/LanguageData/Generated/JMdict_e-2026-08-10.import.json"
retrieval_validator="${tool_dir}/example_sentence_retrieval_index.py"
dictionary_ranking_validator="${tool_dir}/validate_dictionary_ranking_data.py"
dictionary_ranking_contract="${ios_dir}/Modules/Sources/SearchExperience/Resources/DictionaryRankingArtifactContract.json"
dictionary_source="${ios_dir}/LanguageData/Sources/JMdict_e-2026-08-10.gz"
retrieval_fixture_validator="${tool_dir}/validate_example_sentence_retrieval_fixtures.rb"
retrieval_contexts="${ios_dir}/../../docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv"
retrieval_summary="${ios_dir}/LanguageData/Generated/ExampleSentenceRetrieval-v1-summary.tsv"
retrieval_rows="${ios_dir}/LanguageData/Generated/ExampleSentenceRetrieval-v1-rows.tsv"
retrieval_baseline_candidates="${ios_dir}/../../docs/research/fixtures/example-sentence-retrieval-issue-147-retrieval-candidate-rows.tsv"
retrieval_comparison_summary="${ios_dir}/LanguageData/Generated/ExampleSentenceRetrieval-v1-comparison-summary.tsv"
retrieval_comparison_rows="${ios_dir}/LanguageData/Generated/ExampleSentenceRetrieval-v1-comparison-rows.tsv"
mode="${1:-}"
archive_path="${2:-}"
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

usage() {
  cat >&2 <<'EOF'
Usage:
  audit_release_privacy.sh source
  audit_release_privacy.sh unsigned-preflight /absolute/path/to/App.xcarchive
  audit_release_privacy.sh signed-candidate /absolute/path/to/App.xcarchive

`unsigned-preflight` validates an explicitly unsigned Release archive and can
never produce signed-candidate evidence. `signed-candidate` requires valid code
signing, readable entitlements, and an embedded provisioning profile.
EOF
  exit 64
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required audit command is unavailable: $1"
}

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$2" 2>/dev/null
}

require_rg_match() {
  local description="$1"
  local pattern="$2"
  shift 2
  local scan_status
  set +e
  rg -q -- "$pattern" "$@"
  scan_status=$?
  set -e
  case "$scan_status" in
    0) return 0 ;;
    1) fail "$description" ;;
    *) fail "scanner error while checking: $description" ;;
  esac
}

denylist_scan() {
  local category="$1"
  local pattern="$2"
  shift 2
  local result_file="${scratch_dir}/denylist-$RANDOM"
  local scan_status
  set +e
  rg -a -l --hidden --glob '*' -- "$pattern" "$@" >"$result_file" 2>/dev/null
  scan_status=$?
  set -e
  case "$scan_status" in
    0)
      while IFS= read -r matched_file; do
        case "$matched_file" in
          "$ios_dir"/*) matched_file="${matched_file#"$ios_dir"/}" ;;
          "$archive_path"/*) matched_file="${matched_file#"$archive_path"/}" ;;
          *) matched_file="$(basename "$matched_file")" ;;
        esac
        echo "DENYLIST[$category]: $matched_file" >&2
      done <"$result_file"
      fail "$category denylist matched; matched content is intentionally redacted"
      ;;
    1) return 0 ;;
    *) fail "scanner error while running $category denylist" ;;
  esac
}

generated_denylist_scan() {
  local category="$1"
  local pattern="$2"
  local input_file="$3"
  local scan_status
  set +e
  rg -q -- "$pattern" "$input_file"
  scan_status=$?
  set -e
  case "$scan_status" in
    0) fail "$category denylist matched; matched content is intentionally redacted" ;;
    1) return 0 ;;
    *) fail "scanner error while running $category denylist" ;;
  esac
}

require_command rg
require_command plutil
require_command python3
require_command ruby
require_command shasum
require_command sqlite3
[[ "$mode" == "source" || "$mode" == "unsigned-preflight" || "$mode" == "signed-candidate" ]] || usage
if [[ "$mode" == "source" ]]; then
  [[ $# -eq 1 ]] || usage
else
  [[ $# -eq 2 ]] || usage
fi

[[ -f "$manifest" ]] || fail "privacy manifest is missing"
plutil -lint "$manifest" >/dev/null || fail "privacy manifest is invalid"
[[ "$(plist_value NSPrivacyTracking "$manifest")" == "false" ]] || fail "tracking must be false"
[[ "$(plist_value NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPIType "$manifest")" == "NSPrivacyAccessedAPICategoryFileTimestamp" ]] || fail "file metadata API category is missing"
[[ "$(plist_value NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0 "$manifest")" == "3B52.1" ]] || fail "user-selected file metadata reason is missing"
[[ "$(plist_value NSPrivacyAccessedAPITypes:1:NSPrivacyAccessedAPIType "$manifest")" == "NSPrivacyAccessedAPICategoryUserDefaults" ]] || fail "UserDefaults API category is missing"
[[ "$(plist_value NSPrivacyAccessedAPITypes:1:NSPrivacyAccessedAPITypeReasons:0 "$manifest")" == "CA92.1" ]] || fail "app-only UserDefaults reason is missing"
require_rg_match "privacy manifest is not in the app resources phase" 'PrivacyInfo\.xcprivacy in Resources' "$project"
pass "source privacy manifest is valid and included in the app target"

denylist_scan "unreviewed source network or cloud API" 'URLSession|NSURLSession|CloudKit|CKContainer|NWConnection|import[[:space:]]+Network|import[[:space:]]+WebKit' "${ios_dir}/App" "${ios_dir}/Modules/Sources"
denylist_scan "remote package dependency" 'XCRemoteSwiftPackageReference|repositoryURL|\.package\([[:space:]]*url:' "$project" "$package_manifest"
require_rg_match "Camera usage description is missing or changed" 'INFOPLIST_KEY_NSCameraUsageDescription = "Zenbu uses the camera to recognize Japanese text in a photo you choose to capture\.";' "$project"
settings_source="$(find "${ios_dir}/Modules/Sources" -name DictionarySourcesView.swift -type f -print -quit)"
[[ -n "$settings_source" ]] || fail "DictionarySourcesView.swift is missing"
require_rg_match "in-app privacy link is missing" 'https://zenbujapanese\.com/privacy' "$settings_source"
require_rg_match "in-app support link is missing" 'https://zenbujapanese\.com/support' "$settings_source"
pass "source privacy boundary, Camera copy, dependency declarations, and public links match the release contract"

[[ -f "$language_database" ]] || fail "bundled Language Reference Data is missing"
[[ -f "$language_import_manifest" ]] || fail "generated Language Reference Data manifest is missing"
python3 "$dictionary_ranking_validator" "$language_database" "$language_import_manifest" \
  "$dictionary_source" --contract "$dictionary_ranking_contract" \
  >"${scratch_dir}/dictionary-ranking-validation" \
  || fail "bundled Dictionary Ranking artifact validation failed"
python3 "$retrieval_validator" "$language_database" --manifest "$language_import_manifest" \
  >"${scratch_dir}/retrieval-validation" \
  || fail "bundled Example Sentence Retrieval index validation failed"
ruby "$retrieval_fixture_validator" "$language_database" "$retrieval_contexts" \
  "$retrieval_summary" "$retrieval_rows" "$retrieval_baseline_candidates" \
  "$retrieval_comparison_summary" "$retrieval_comparison_rows" \
  >"${scratch_dir}/retrieval-fixture-validation" \
  || fail "bundled Example Sentence Retrieval regression fixture replay failed"
pass "bundled Dictionary Ranking and Example Sentence Retrieval artifacts, manifests, and regression fixtures match"

if [[ "$mode" == "source" ]]; then
  echo "INFO: source audit complete; this is not archive or signed-candidate evidence"
  exit 0
fi

require_command codesign
require_command file
require_command find
require_command nm
require_command otool
[[ -d "$archive_path" ]] || fail "archive does not exist: $archive_path"
archive_info="${archive_path}/Info.plist"
[[ -f "$archive_info" ]] || fail "archive metadata is missing"
[[ "$(plist_value SchemeName "$archive_info")" == "ZenbuJapanese" ]] || fail "archive was not produced by the ZenbuJapanese scheme"
app_path="$(find "$archive_path/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
[[ -n "$app_path" ]] || fail "archive contains no application bundle"
archive_manifest="${app_path}/PrivacyInfo.xcprivacy"
archive_app_info="${app_path}/Info.plist"
[[ -f "$archive_manifest" ]] || fail "archive application is missing PrivacyInfo.xcprivacy"
plutil -lint "$archive_manifest" >/dev/null || fail "archive privacy manifest is invalid"
cmp -s "$manifest" "$archive_manifest" || fail "archive privacy manifest differs from the reviewed source manifest"
[[ "$(plist_value CFBundleIdentifier "$archive_app_info")" == "com.zenbujapanese.dictionary" ]] || fail "archive bundle identifier is unexpected"
[[ "$(plist_value NSCameraUsageDescription "$archive_app_info")" == "Zenbu uses the camera to recognize Japanese text in a photo you choose to capture." ]] || fail "archive Camera usage description is missing or changed"
pass "archive identity, privacy manifest, and Camera copy match the reviewed source"

archive_language_database="$(find "$app_path" -type f -name 'LanguageReferenceData.sqlite3' -print -quit)"
[[ -n "$archive_language_database" ]] || fail "archive application is missing LanguageReferenceData.sqlite3"
archive_dictionary_ranking_contract="$(find "$app_path" -type f -name 'DictionaryRankingArtifactContract.json' -print -quit)"
[[ -n "$archive_dictionary_ranking_contract" ]] \
  || fail "archive application is missing DictionaryRankingArtifactContract.json"
cmp -s "$dictionary_ranking_contract" "$archive_dictionary_ranking_contract" \
  || fail "embedded Dictionary Ranking contract differs from reviewed source contract"
python3 "$dictionary_ranking_validator" "$archive_language_database" "$language_import_manifest" \
  "$dictionary_source" --contract "$archive_dictionary_ranking_contract" \
  >"${scratch_dir}/archive-dictionary-ranking-validation" \
  || fail "archive Dictionary Ranking artifact validation failed"
python3 "$retrieval_validator" "$archive_language_database" --manifest "$language_import_manifest" \
  >"${scratch_dir}/archive-retrieval-validation" \
  || fail "archive Example Sentence Retrieval index validation failed"
ruby "$retrieval_fixture_validator" "$archive_language_database" "$retrieval_contexts" \
  "$retrieval_summary" "$retrieval_rows" "$retrieval_baseline_candidates" \
  "$retrieval_comparison_summary" "$retrieval_comparison_rows" \
  >"${scratch_dir}/archive-retrieval-fixture-validation" \
  || fail "archive Example Sentence Retrieval regression fixture replay failed"
pass "archive Dictionary Ranking and Example Sentence Retrieval artifacts, manifests, and regression fixtures match"

signing_identity="$(plist_value ApplicationProperties:SigningIdentity "$archive_info" || true)"
if [[ "$mode" == "signed-candidate" ]]; then
  [[ -n "$signing_identity" ]] || fail "signed-candidate archive metadata has no signing identity"
  [[ -f "${app_path}/embedded.mobileprovision" ]] || fail "signed-candidate app has no embedded provisioning profile"
  codesign --verify --deep --strict --verbose=2 "$app_path" >"${scratch_dir}/codesign-verify" 2>&1 || fail "signed-candidate code signature verification failed"
  codesign -d --entitlements :- "$app_path" >"${scratch_dir}/entitlements.plist" 2>"${scratch_dir}/codesign-metadata" || fail "signed-candidate entitlements could not be read"
  [[ -s "${scratch_dir}/entitlements.plist" ]] || fail "signed-candidate entitlements output is empty"
  plutil -lint "${scratch_dir}/entitlements.plist" >/dev/null || fail "signed-candidate entitlements output is invalid"
  pass "signed-candidate signature and entitlements are valid"
else
  [[ -z "$signing_identity" ]] || fail "unsigned-preflight archive unexpectedly records a signing identity"
  set +e
  codesign -d "$app_path" >"${scratch_dir}/unsigned-codesign-output" 2>"${scratch_dir}/unsigned-codesign-error"
  unsigned_codesign_status=$?
  set -e
  if [[ "$unsigned_codesign_status" -eq 0 ]]; then
    fail "unsigned-preflight archive is signed; use signed-candidate mode"
  fi
  require_rg_match "codesign failed for an unexpected reason while confirming the unsigned preflight" 'code object is not signed at all' "${scratch_dir}/unsigned-codesign-error"
  pass "archive is explicitly unsigned preflight evidence, not a signed candidate"
fi

non_release_results="${scratch_dir}/non-release-files"
find "$app_path" \( -name 'ImageTextFixtures' -o -name '*.xctest' -o -name '*.xcresult' -o -name '*.dSYM' -o -name '*.swift' -o -name '*.swiftmodule' -o -name '*.map' \) -print >"$non_release_results" || fail "failed to enumerate non-Release resources"
if [[ -s "$non_release_results" ]]; then
  while IFS= read -r matched_file; do
    echo "DENYLIST[non-Release resource]: ${matched_file#"$app_path"/}" >&2
  done <"$non_release_results"
  fail "non-Release resources were packaged"
fi
denylist_scan "DEBUG or test-only runtime marker" 'PrepareImageTextFixtures|StartImageTextFixtures|ExportImageTextFixtures|InjectLookupFailure|DEBUG=1|docs/clone-discovery|clipy\.online|/Users/' "$app_path"
denylist_scan "credential-shaped material" 'gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Za-z0-9_]*(PASSWORD|TOKEN|SECRET|API_KEY)[A-Za-z0-9_]*[=:][^[:space:]]+' "$app_path"
pass "archive contains no known non-Release resources, private evidence markers, or credential-shaped material"

executable_name="$(plist_value CFBundleExecutable "$archive_app_info")"
executable="${app_path}/${executable_name}"
[[ -x "$executable" ]] || fail "archive executable is missing"
file "$executable" >"${scratch_dir}/file-type" || fail "failed to inspect archive executable type"
require_rg_match "archive executable is not arm64 Mach-O" 'Mach-O 64-bit executable arm64' "${scratch_dir}/file-type"
otool -L "$executable" >"${scratch_dir}/dependencies" || fail "failed to resolve linked libraries"
nm -u "$executable" >"${scratch_dir}/undefined-symbols" || fail "failed to inspect unresolved executable symbols"
generated_denylist_scan "direct network framework dependency" '/(CFNetwork|Network|CloudKit|WebKit)\.framework/|@rpath/' "${scratch_dir}/dependencies"
generated_denylist_scan "direct network client symbol" 'NSURLSession|URLSession|NWConnection|CKContainer|CFNetwork|WebKit|_connect$|_socket$' "${scratch_dir}/undefined-symbols"
embedded_framework_results="${scratch_dir}/embedded-frameworks"
if [[ -d "${app_path}/Frameworks" ]]; then
  find "${app_path}/Frameworks" -mindepth 1 -print -quit >"$embedded_framework_results" || fail "failed to enumerate embedded frameworks"
fi
if [[ -s "$embedded_framework_results" ]]; then
  fail "archive unexpectedly embeds a third-party framework"
fi
echo "INFO: resolved system dependency inventory"
tail -n +2 "${scratch_dir}/dependencies" | sed -E 's/^[[:space:]]+([^[:space:]]+).*/\1/'
pass "resolved dependencies contain no embedded SDK or direct network-client indicator"

url_results="${scratch_dir}/urls"
set +e
rg -a -o --no-filename --glob '!*.sqlite3' 'https?://[^[:space:][:cntrl:]"<>]+' \
  "$app_path" >"$url_results" 2>/dev/null
url_scan_status=$?
set -e
case "$url_scan_status" in
  0|1) ;;
  *) fail "scanner error while inventorying packaged URLs" ;;
esac
# Scan SQLite values through SQLite rather than across raw database pages. Raw
# page bytes can concatenate the end of one URL with the beginning of the next
# record and invent a host that is not present in any packaged value.
while IFS= read -r -d '' packaged_database; do
  set +e
  sqlite3 -readonly "$packaged_database" .dump 2>/dev/null \
    | rg -o --no-filename 'https?://[^[:space:][:cntrl:]"<>]+' >>"$url_results"
  database_url_scan_status=${PIPESTATUS[1]}
  set -e
  case "$database_url_scan_status" in
    0|1) ;;
    *) fail "scanner error while inventorying packaged SQLite URLs" ;;
  esac
done < <(find "$app_path" -type f -name '*.sqlite3' -print0)
# A few corpus sentences run a sentence number directly into the terminal URL
# period (for example, `example.com.5`); an all-numeric DNS suffix is not a host.
sed -E 's#^[Hh][Tt][Tt][Pp][Ss]?://([^/:?#]+).*#\1#' "$url_results" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9.-].*$//; s/\.[0-9]+$//; s/\.$//' \
  | sed '/^$/d' \
  | LC_ALL=C sort -u >"${scratch_dir}/url-hosts"
allowed_url_hosts='^(clrd\.ninjal\.ac\.jp|creativecommons\.org|github\.com|kanjivg\.tagaini\.net|tatoeba\.org|www\.apple\.com|www\.edrdg\.org|www\.example\.com|www\.jpgarden\.com|zenbujapanese\.com)$'
set +e
rg -v -- "$allowed_url_hosts" "${scratch_dir}/url-hosts" >"${scratch_dir}/unexpected-url-hosts"
host_scan_status=$?
set -e
case "$host_scan_status" in
  0)
    while IFS= read -r host; do echo "DENYLIST[unexpected URL host]: $host" >&2; done <"${scratch_dir}/unexpected-url-hosts"
    fail "archive contains an unreviewed URL host"
    ;;
  1) ;;
  *) fail "scanner error while validating packaged URL hosts" ;;
esac
generated_denylist_scan "private or local URL" '(^|://)(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)|file://' "$url_results"
echo "INFO: reviewed packaged URL host inventory"
sed 's/^/  /' "${scratch_dir}/url-hosts"
pass "packaged URLs are limited to reviewed public documentation, license, privacy, and support hosts"

artifact_sha="$({
  cd "$app_path"
  find . -type f -print0 \
    | LC_ALL=C sort -z \
    | while IFS= read -r -d '' packaged_file; do
        packaged_sha="$(shasum -a 256 "$packaged_file" | awk '{print $1}')"
        printf '%s  %s\0' "$packaged_sha" "${packaged_file#./}"
      done
} | shasum -a 256 | awk '{print $1}')"
[[ "$artifact_sha" =~ ^[0-9a-f]{64}$ ]] || fail "failed to compute canonical artifact hash"
echo "ARTIFACT_SHA256=$artifact_sha"
if [[ "$mode" == "signed-candidate" ]]; then
  pass "frozen signed-candidate privacy audit complete"
else
  pass "unsigned Release archive preflight complete; signed-candidate audit remains required"
fi
