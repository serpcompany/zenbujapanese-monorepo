#!/usr/bin/env bash

set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_dir="$(cd "${tool_dir}/.." && pwd)"
manifest="${ios_dir}/App/PrivacyInfo.xcprivacy"
project="${ZENBU_XCODE_PROJECT:-${ios_dir}/ZenbuJapanese.xcodeproj/project.pbxproj}"
package_manifest="${ios_dir}/Modules/Package.swift"
package_resolved="${ZENBU_PACKAGE_RESOLVED:-${ios_dir}/Modules/Package.resolved}"
xcode_package_resolved="${ZENBU_XCODE_PACKAGE_RESOLVED:-${ios_dir}/ZenbuJapanese.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved}"
release_sbom="${ZENBU_RELEASE_SBOM:-${ios_dir}/ReleaseSBOM.spdx.json}"
language_database="${ios_dir}/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
language_pack_catalog="${ZENBU_LANGUAGE_PACK_CATALOG:-${ios_dir}/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json}"
language_resource_scan_root="${ZENBU_LANGUAGE_RESOURCE_SCAN_ROOT:-${ios_dir}/Modules/Sources/SearchExperience/Resources}"
sudachi_preparation_tool="${ZENBU_SUDACHI_PREPARATION_TOOL:-${tool_dir}/prepare_sudachi_core.py}"
sudachi_notices="${ZENBU_SUDACHI_NOTICES:-${ios_dir}/Modules/Sources/SearchExperience/Resources/SudachiLanguageTechnologyNotices.txt}"
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
require_command jq
require_command plutil
require_command python3
require_command ruby
require_command shasum
require_command sqlite3
require_command strings
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

network_scan_paths=()
while IFS= read -r source_file; do
  network_scan_paths+=("$source_file")
done < <(find "${ios_dir}/App" "${ios_dir}/Modules/Sources" -type f \
  ! -name FrequencyPack.swift ! -name LanguageTechnologyPack.swift -print)
denylist_scan "unreviewed source network or cloud API" 'URLSession|NSURLSession|CloudKit|CKContainer|NWConnection|import[[:space:]]+Network|import[[:space:]]+WebKit' \
  "${network_scan_paths[@]}"
frequency_download_source="${ios_dir}/Modules/Sources/SearchExperience/FrequencyPack.swift"
[[ -f "$frequency_download_source" ]] || fail "reviewed frequency download boundary is missing"
[[ "$(rg -c 'URLSession\.shared\.data\(from: url\)' "$frequency_download_source")" == "1" ]] \
  || fail "frequency download boundary changed or added another network client"
require_rg_match "frequency download must reject non-success HTTP responses" \
  'HTTPURLResponse\)\?\.statusCode == 200' "$frequency_download_source"
pass "only the reviewed checksum-validated Frequency Pack downloader uses URLSession"
language_pack_download_source="${ios_dir}/Modules/Sources/SearchExperience/LanguageTechnologyPack.swift"
[[ -f "$language_pack_download_source" ]] || fail "reviewed Language Technology Pack download boundary is missing"
[[ "$(rg -c 'URLSession\.shared\.data\(from: url\)' "$language_pack_download_source")" == "1" ]] \
  || fail "Language Technology Pack download boundary changed or added another network client"
require_rg_match "Language Technology Pack download must reject non-success HTTP responses" \
  'HTTPURLResponse\)\?\.statusCode == 200' "$language_pack_download_source"
[[ -f "$language_pack_catalog" ]] || fail "Language Technology Pack catalog is missing"
jq -e '.schemaVersion == 1 and (.packs | length) == 1 and .packs[0].packID == "sudachi-core-ja-20260723" and .packs[0].packVersion == "20260723" and .packs[0].engine == "sudachi.rs" and .packs[0].engineVersion == "0.6.11" and .packs[0].binding == "sudachi-swift" and .packs[0].bindingVersion == "0.1.1" and .packs[0].downloadURL == "https://github.com/WorksApplications/SudachiDict/releases/download/v20260723/sudachidict_core-20260723-py3-none-any.whl" and .packs[0].downloadBytes == 72275897 and .packs[0].downloadSHA256 == "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498" and .packs[0].archiveEntry == "sudachidict_core/resources/system.dic" and .packs[0].installedBytes == 217466039 and .packs[0].installedSHA256 == "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f" and .packs[0].runtimeResourceCommit == "90fd6068c80c2fc3b63e0dbab0e341475bad4d8f" and .packs[0].characterDefinitionSHA256 == "b549ec56ad67359f535c80b7efa150538af2a78b7609d0d6bae796dd89f4f29d" and .packs[0].unknownDefinitionSHA256 == "4e8c4c15e18af6a9fc5d636e3dc73fde55d50941b93a6c8835d4653d3f54ba79" and .packs[0].distribution == "bundledDefault" and .packs[0].bundledResource == "system_core" and .packs[0].bundledResourceExtension == "dic" and .packs[0].licenseResource == "SudachiLanguageTechnologyNotices"' \
  "$language_pack_catalog" >/dev/null || fail "Language Technology Pack source or installed checksum pin is missing"
[[ -f "$sudachi_preparation_tool" ]] || fail "bundled Sudachi preparation tool is missing"
[[ -f "$sudachi_notices" ]] || fail "bundled Sudachi notices are missing"
app_target_block="$(awk '
  /5CD4552D207F8AC0D2D15CD6 \/\* ZenbuJapanese \*\/ = \{/ { in_target = 1 }
  in_target { print }
  in_target && /^\t\t};$/ { exit }
' "$project")"
rg -q 'F25800000000000000000001 /\* Prepare bundled Sudachi Core \*/' \
  <<<"$app_target_block" || fail "Sudachi preparation phase is detached from the app target"
require_rg_match "Xcode target no longer invokes the reviewed Sudachi preparation tool" \
  'prepare_sudachi_core\.py' "$project"
source_sudachi_payloads="${scratch_dir}/source-sudachi-payloads"
find "$language_resource_scan_root" -type f \( -name '*.whl' -o -name 'system_core.dic' \) \
  -print >"$source_sudachi_payloads" \
  || fail "failed to enumerate source resources for Sudachi payloads"
if [[ -s "$source_sudachi_payloads" ]]; then
  fail "Sudachi wheel and expanded dictionary must remain outside tracked source resources"
fi
pass "pinned Sudachi manifest, notices, deterministic preparation tool, target staging, and no-source-payload policy match"
pass "only the reviewed checksum-validated optional Language Technology Pack boundary uses URLSession"
denylist_scan "Xcode-project remote package dependency" 'XCRemoteSwiftPackageReference|repositoryURL' "$project"
[[ "$(rg -c '\.package\(' "$package_manifest")" == "2" ]] \
  || fail "Swift package dependency inventory changed"
require_rg_match "pinned sudachi-swift dependency is missing" \
  'url: "https://github\.com/iasnezhkov/sudachi-swift\.git"' "$package_manifest"
require_rg_match "pinned ZIPFoundation dependency is missing" \
  'url: "https://github\.com/weichsel/ZIPFoundation\.git"' "$package_manifest"
sudachi_dependency="$(rg -A 2 'iasnezhkov/sudachi-swift' "$package_manifest")"
zip_dependency="$(rg -A 2 'weichsel/ZIPFoundation' "$package_manifest")"
rg -q 'exact: "0\.1\.1"' <<<"$sudachi_dependency" \
  || fail "sudachi-swift must remain exact 0.1.1"
rg -q 'exact: "0\.9\.20"' <<<"$zip_dependency" \
  || fail "ZIPFoundation must remain exact 0.9.20"
pass "remote Swift dependencies are limited to the reviewed exact Sudachi and archive-reader pins"
for resolved in "$package_resolved" "$xcode_package_resolved"; do
  [[ -f "$resolved" ]] || fail "Swift package lockfile is missing: $resolved"
  jq -e '
    any(.pins[]; .identity == "sudachi-swift" and .state.version == "0.1.1" and
      .state.revision == "92f55c556ba0e6c6f25660b049072811d40f045f") and
    any(.pins[]; .identity == "zipfoundation" and .state.version == "0.9.20" and
      .state.revision == "22787ffb59de99e5dc1fbfe80b19c97a904ad48d")
  ' "$resolved" >/dev/null || fail "Swift package lockfile differs from reviewed revisions: $resolved"
done
pass "SwiftPM and Xcode-consumed lockfiles match the reviewed revisions"
[[ -f "$release_sbom" ]] || fail "release SBOM is missing"
jq -e '
  .spdxVersion == "SPDX-2.3" and
  any(.packages[]; .name == "sudachi-swift" and .versionInfo == "0.1.1") and
  any(.packages[]; .name == "sudachi.rs" and .versionInfo == "0.6.11") and
  any(.packages[]; .name == "SudachiDict Core" and .versionInfo == "20260723" and
    any(.checksums[]; .checksumValue == "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498") and
    (.comment | contains("53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f"))) and
  any(.packages[]; .name == "ZIPFoundation" and .versionInfo == "0.9.20") and
  any(.relationships[];
    .spdxElementId == "SPDXRef-ZenbuJapanese" and
    .relationshipType == "DEPENDS_ON" and
    .relatedSpdxElement == "SPDXRef-SudachiDictCore")
' "$release_sbom" >/dev/null || fail "release SBOM is missing a pinned Japanese Text Analysis component"
pass "release SBOM records the reviewed binding, engine, bundled dictionary, and archive reader"
require_rg_match "Camera usage description is missing or changed" 'INFOPLIST_KEY_NSCameraUsageDescription = "Zenbu uses the camera to recognize Japanese text and save photos with words you are learning\.";' "$project"
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
[[ "$(plist_value NSCameraUsageDescription "$archive_app_info")" == "Zenbu uses the camera to recognize Japanese text and save photos with words you are learning." ]] || fail "archive Camera usage description is missing or changed"
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

archive_sudachi_inventory="${scratch_dir}/archive-sudachi-inventory"
find "$app_path" -type f -name 'system_core.dic' -print >"$archive_sudachi_inventory" \
  || fail "failed to enumerate archive Sudachi dictionaries"
archive_sudachi_count="$(wc -l <"$archive_sudachi_inventory" | tr -d '[:space:]')"
[[ "$archive_sudachi_count" == "1" ]] || fail "archive must contain exactly one bundled Sudachi Core dictionary"
archive_sudachi="$(head -n 1 "$archive_sudachi_inventory")"
[[ "$(wc -c <"$archive_sudachi" | tr -d '[:space:]')" == "217466039" ]] \
  || fail "archive Sudachi Core dictionary size differs from the pinned artifact"
[[ "$(shasum -a 256 "$archive_sudachi" | awk '{print $1}')" == "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f" ]] \
  || fail "archive Sudachi Core dictionary checksum differs from the pinned artifact"
archive_sudachi_wheels="${scratch_dir}/archive-sudachi-wheels"
find "$app_path" -type f -name '*.whl' -print >"$archive_sudachi_wheels" \
  || fail "failed to enumerate archive wheel resources"
if [[ -s "$archive_sudachi_wheels" ]]; then
  fail "archive contains both compressed and expanded Sudachi resources"
fi
pass "archive contains one exact expanded Sudachi Core dictionary and no wheel duplicate"
archive_sudachi_notice_inventory="${scratch_dir}/archive-sudachi-notice-inventory"
find "$app_path" -type f -name 'SudachiLanguageTechnologyNotices.txt' -print \
  >"$archive_sudachi_notice_inventory" \
  || fail "failed to enumerate archive Sudachi notices"
archive_sudachi_notice_count="$(wc -l <"$archive_sudachi_notice_inventory" | tr -d '[:space:]')"
[[ "$archive_sudachi_notice_count" == "1" ]] \
  || fail "archive must contain exactly one Sudachi notice resource"
archive_sudachi_notice="$(head -n 1 "$archive_sudachi_notice_inventory")"
cmp -s "$sudachi_notices" "$archive_sudachi_notice" \
  || fail "archive Sudachi notices differ from the reviewed source"
pass "archive contains the exact reviewed Sudachi notices"

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
executable_name="$(plist_value CFBundleExecutable "$archive_app_info")"
executable="${app_path}/${executable_name}"
[[ -x "$executable" ]] || fail "archive executable is missing"
denylist_scan "DEBUG or test-only runtime marker" 'PrepareImageTextFixtures|StartImageTextFixtures|ExportImageTextFixtures|InjectLookupFailure|DEBUG=1|docs/clone-discovery|clipy\.online' "$app_path"
non_executable_product_files=()
non_executable_product_inventory="${scratch_dir}/non-executable-product-files"
find "$app_path" -type f ! -path "$executable" -print0 \
  >"$non_executable_product_inventory" \
  || fail "failed to enumerate non-executable product files"
while IFS= read -r -d '' product_file; do
  non_executable_product_files+=("$product_file")
done <"$non_executable_product_inventory"
if [[ "${#non_executable_product_files[@]}" -gt 0 ]]; then
  denylist_scan "private build path" '/Users/' "${non_executable_product_files[@]}"
fi
strings "$executable" >"${scratch_dir}/executable-strings" \
  || fail "failed to inspect executable strings for private build paths"
set +e
rg -o '/Users/[^[:space:][:cntrl:]]+' "${scratch_dir}/executable-strings" \
  >"${scratch_dir}/executable-user-paths-unsorted"
executable_user_path_scan_status=$?
set -e
case "$executable_user_path_scan_status" in
  0) ;;
  1) : >"${scratch_dir}/executable-user-paths-unsorted" ;;
  *) fail "scanner error while inventorying executable build paths" ;;
esac
LC_ALL=C sort -u "${scratch_dir}/executable-user-paths-unsorted" \
  >"${scratch_dir}/executable-user-paths" \
  || fail "failed to sort executable build path evidence"
set +e
rg -v '^/Users/runner/(\.cargo/registry/src/index\.crates\.io-1949cf8c6b5b557f/|work/sudachi-swift/sudachi-swift/third_party/sudachi\.rs/)' \
  "${scratch_dir}/executable-user-paths" >"${scratch_dir}/unexpected-executable-user-paths"
unexpected_user_path_status=$?
set -e
case "$unexpected_user_path_status" in
  0) fail "executable contains an unreviewed private build path" ;;
  1) ;;
  *) fail "scanner error while validating executable build paths" ;;
esac
pass "only exact reviewed sudachi-swift Rust build prefixes remain in the executable"
denylist_scan "credential-shaped material" 'gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Za-z0-9_]*(PASSWORD|TOKEN|SECRET|API_KEY)[A-Za-z0-9_]*[=:][^[:space:]]+' "$app_path"
pass "archive contains no known non-Release resources, private evidence markers, or credential-shaped material"

file "$executable" >"${scratch_dir}/file-type" || fail "failed to inspect archive executable type"
require_rg_match "archive executable is not arm64 Mach-O" 'Mach-O 64-bit executable arm64' "${scratch_dir}/file-type"
otool -L "$executable" >"${scratch_dir}/dependencies" || fail "failed to resolve linked libraries"
nm -u "$executable" >"${scratch_dir}/undefined-symbols" || fail "failed to inspect unresolved executable symbols"
generated_denylist_scan "direct network framework dependency" '/(CFNetwork|Network|CloudKit|WebKit)\.framework/|@rpath/' "${scratch_dir}/dependencies"
generated_denylist_scan "unreviewed direct network client symbol" 'NWConnection|CKContainer|CloudKit|WebKit|_connect$|_socket$' "${scratch_dir}/undefined-symbols"
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
url_scan_executable="$executable"
if [[ "$mode" == "signed-candidate" ]]; then
  # Apple code signatures and provisioning profiles carry certificate-status
  # URLs (for example, OCSP and CRL endpoints). They are signing metadata, not
  # product network destinations. Scan a signature-stripped executable copy so
  # compiled product URLs remain covered without inventorying the certificate
  # chain embedded in LC_CODE_SIGNATURE.
  url_scan_executable="${scratch_dir}/unsigned-executable-for-url-scan"
  cp "$executable" "$url_scan_executable" || fail "failed to copy the signed executable for URL inspection"
  codesign --remove-signature "$url_scan_executable" >/dev/null 2>&1 \
    || fail "failed to remove signing metadata from the executable URL-scan copy"
fi
: >"$url_results"
scan_packaged_url_file() {
  local packaged_file="$1"
  local packaged_url_scan_status
  set +e
  rg -a -o --no-filename 'https?://[^[:space:][:cntrl:]"<>]+' \
    "$packaged_file" >>"$url_results" 2>/dev/null
  packaged_url_scan_status=$?
  set -e
  case "$packaged_url_scan_status" in
    0|1) ;;
    *) fail "scanner error while inventorying packaged URLs" ;;
  esac
}
url_scan_files="${scratch_dir}/url-scan-files"
find "$app_path" -type f ! -name '*.sqlite3' \
  ! -path "$executable" \
  ! -path "$archive_sudachi" \
  ! -path "${app_path}/embedded.mobileprovision" \
  ! -path "${app_path}/_CodeSignature/*" -print0 >"$url_scan_files" \
  || fail "failed to enumerate packaged files for URL inspection"
while IFS= read -r -d '' packaged_url_file; do
  scan_packaged_url_file "$packaged_url_file"
done <"$url_scan_files"
scan_packaged_url_file "$url_scan_executable"
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
allowed_url_hosts='^(chasen\.org|clrd\.ninjal\.ac\.jp|codepoints\.net|creativecommons\.org|developer\.hatena\.ne\.jp|downloads\.tatoeba\.org|en\.wikipedia\.org|github\.com|hatenacorp\.jp|kanjivg\.tagaini\.net|raw\.githubusercontent\.com|tatoeba\.org|togetter\.com|unidic\.ninjal\.ac\.jp|www\.apache\.org|www\.apple\.com|www\.edrdg\.org|www\.example\.com|www\.jpgarden\.com|www\.peakstep\.com|www\.post\.japanpost\.jp|www5a\.biglobe\.ne\.jp|zenbujapanese\.com)$'
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
