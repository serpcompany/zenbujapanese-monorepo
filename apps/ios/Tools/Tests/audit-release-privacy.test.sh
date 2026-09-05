#!/usr/bin/env bash

set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
audit="$(cd "${test_dir}/.." && pwd)/audit_release_privacy.sh"
ios_dir="$(cd "${test_dir}/../.." && pwd)"
source_contract="${ios_dir}/Modules/Sources/SearchExperience/Resources/DictionaryRankingArtifactContract.json"
import_manifest="${ios_dir}/LanguageData/Generated/JMdict_e-2026-08-10.import.json"
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

test_nested_signing_metadata() {
  [[ -n "${ZENBU_SIGNED_ARCHIVE:-}" ]] || fail "signing-metadata test requires ZENBU_SIGNED_ARCHIVE"
  # shellcheck source=apps/ios/Tools/release_signing_metadata.sh
  source "${test_dir}/../release_signing_metadata.sh"
  local signed_bundle="${ZENBU_SIGNED_ARCHIVE}/Products/Applications/Zenbu Japanese.app/ZIPFoundation_ZIPFoundation.bundle"
  local fixture_bundle="${scratch_dir}/Valid.bundle"
  cp -R "$signed_bundle" "$fixture_bundle"
  codesign --verify --strict "$fixture_bundle" >"${scratch_dir}/fixture-signature.log" 2>&1 \
    || fail "signed resource fixture is not valid"
  local signature_file="${fixture_bundle}/_CodeSignature/CodeSignature"
  release_is_validated_signing_metadata signed-candidate "$signature_file" "${scratch_dir}/verify.log" \
    || fail "valid nested signature metadata remains in the product URL scan"
  if release_is_validated_signing_metadata unsigned-preflight "$signature_file" "${scratch_dir}/verify.log"; then
    fail "unsigned preflight unexpectedly excluded nested signature bytes"
  fi
  local ordinary_file="${scratch_dir}/ordinary-resource.txt"
  printf '%s\n' 'https://certs.apple.com/example' >"$ordinary_file"
  if release_is_validated_signing_metadata signed-candidate "$ordinary_file" "${scratch_dir}/verify.log"; then
    fail "ordinary Apple-host product URL was excluded"
  fi
  local allowed_hosts
  allowed_hosts="$(sed -n "s/^allowed_url_hosts='\(.*\)'$/\1/p" "$audit")"
  [[ -n "$allowed_hosts" ]] || fail "could not read the real product-host policy"
  printf '%s\n' certs.apple.com | rg -v "$allowed_hosts" >/dev/null \
    || fail "certificate host was globally allowed as product traffic"
  local unknown_file="${fixture_bundle}/_CodeSignature/ordinary-resource.txt"
  printf '%s\n' 'https://certs.apple.com/example' >"$unknown_file"
  if release_is_validated_signing_metadata signed-candidate "$unknown_file" "${scratch_dir}/verify.log"; then
    fail "unknown file inside a signature directory was excluded"
  fi
  local fake_file="${scratch_dir}/Fake.bundle/_CodeSignature/CodeSignature"
  mkdir -p "$(dirname "$fake_file")"
  printf '%s\n' 'https://certs.apple.com/example' >"$fake_file"
  local fake_status=0
  release_is_validated_signing_metadata signed-candidate "$fake_file" "${scratch_dir}/verify.log" \
    || fake_status=$?
  [[ "$fake_status" == 2 ]] || fail "fake unsigned signature directory did not fail closed"
  echo "PASS: validated nested signatures only; unsigned, fake, and ordinary resources stay blocking"
}

if [[ "${1:-}" == signing-metadata ]]; then
  test_nested_signing_metadata
  exit 0
fi

[[ -f "$source_contract" ]] || fail "reviewed source contract fixture is missing"

"$audit" source >"${scratch_dir}/source.log"
rg -q 'source audit complete; this is not archive or signed-candidate evidence' "${scratch_dir}/source.log" || fail "source mode did not identify its evidence boundary"

if ZENBU_SUDACHI_PREPARATION_TOOL="${scratch_dir}/missing-prepare-tool.py" "$audit" source \
  >"${scratch_dir}/missing-sudachi.log" 2>&1; then
  fail "source audit without the Sudachi preparation tool unexpectedly passed"
fi
rg -q 'bundled Sudachi preparation tool is missing' "${scratch_dir}/missing-sudachi.log" \
  || fail "missing Sudachi preparation tool was not reported"

duplicate_resource_root="${scratch_dir}/duplicate-language-resources"
mkdir "$duplicate_resource_root"
touch "${duplicate_resource_root}/system_core.dic"
touch "${duplicate_resource_root}/sudachidict_core.whl"
if ZENBU_LANGUAGE_RESOURCE_SCAN_ROOT="$duplicate_resource_root" "$audit" source \
  >"${scratch_dir}/duplicate-sudachi.log" 2>&1; then
  fail "source audit with both bundled dictionary and wheel unexpectedly passed"
fi
rg -q 'Sudachi wheel and expanded dictionary must remain outside tracked source resources' \
  "${scratch_dir}/duplicate-sudachi.log" \
  || fail "duplicate Sudachi payload was not reported"

catalog_mutations=(
  '(.packs[0].packVersion) = "stale"'
  '(.packs[0].engineVersion) = "stale"'
  '(.packs[0].bindingVersion) = "stale"'
  '(.packs[0].downloadBytes) = 1'
  '(.packs[0].downloadSHA256) = "stale"'
  '(.packs[0].archiveEntry) = "wrong/system.dic"'
  '(.packs[0].installedBytes) = 1'
  '(.packs[0].installedSHA256) = "stale"'
  '(.packs[0].runtimeResourceCommit) = "stale"'
  '(.packs[0].characterDefinitionSHA256) = "stale"'
  '(.packs[0].unknownDefinitionSHA256) = "stale"'
  '(.packs[0].licenseResource) = "MissingNotice"'
)
catalog_index=0
for mutation in "${catalog_mutations[@]}"; do
  catalog_index=$((catalog_index + 1))
  invalid_catalog="${scratch_dir}/invalid-sudachi-catalog-${catalog_index}.json"
  jq "$mutation" \
    "${ios_dir}/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json" \
    >"$invalid_catalog"
  if ZENBU_LANGUAGE_PACK_CATALOG="$invalid_catalog" "$audit" source \
    >"${scratch_dir}/invalid-sudachi-catalog-${catalog_index}.log" 2>&1; then
    fail "source audit with mutated Sudachi catalog field ${catalog_index} unexpectedly passed"
  fi
  rg -q 'Language Technology Pack source or installed checksum pin is missing' \
    "${scratch_dir}/invalid-sudachi-catalog-${catalog_index}.log" \
    || fail "mutated Sudachi catalog field ${catalog_index} was not reported"
done

if ZENBU_SUDACHI_NOTICES="${scratch_dir}/missing-Sudachi-notices.txt" "$audit" source \
  >"${scratch_dir}/missing-sudachi-notices.log" 2>&1; then
  fail "source audit without Sudachi notices unexpectedly passed"
fi
rg -q 'bundled Sudachi notices are missing' "${scratch_dir}/missing-sudachi-notices.log" \
  || fail "missing Sudachi notices were not reported"

detached_project="${scratch_dir}/detached-sudachi-project.pbxproj"
awk '
  /5CD4552D207F8AC0D2D15CD6 \/\* ZenbuJapanese \*\/ = \{/ { in_target = 1 }
  in_target && /F25800000000000000000001 \/\* Prepare bundled Sudachi Core \*\// { next }
  { print }
  in_target && /^\t\t};$/ { in_target = 0 }
' "${ios_dir}/ZenbuJapanese.xcodeproj/project.pbxproj" >"$detached_project"
if ZENBU_XCODE_PROJECT="$detached_project" "$audit" source \
  >"${scratch_dir}/detached-sudachi-project.log" 2>&1; then
  fail "source audit without Sudachi target staging unexpectedly passed"
fi
rg -q 'Sudachi preparation phase is detached from the app target' \
  "${scratch_dir}/detached-sudachi-project.log" \
  || fail "detached Sudachi target staging was not reported"

reversed_sbom="${scratch_dir}/reversed-sbom.json"
jq '(.relationships[] | select(.spdxElementId == "SPDXRef-ZenbuJapanese" and .relatedSpdxElement == "SPDXRef-SudachiDictCore")) |=
  (.spdxElementId = "SPDXRef-SudachiDictCore" | .relatedSpdxElement = "SPDXRef-ZenbuJapanese")' \
  "${ios_dir}/ReleaseSBOM.spdx.json" >"$reversed_sbom"
if ZENBU_RELEASE_SBOM="$reversed_sbom" "$audit" source >"${scratch_dir}/reversed-sbom.log" 2>&1; then
  fail "SBOM with reversed optional dependency unexpectedly passed"
fi
rg -q 'release SBOM is missing a pinned Japanese Text Analysis component' \
  "${scratch_dir}/reversed-sbom.log" || fail "reversed SBOM relationship was not reported"

missing_sudachi_sbom="${scratch_dir}/missing-sudachi-sbom.json"
jq 'del(.packages[] | select(.SPDXID == "SPDXRef-SudachiDictCore"))' \
  "${ios_dir}/ReleaseSBOM.spdx.json" >"$missing_sudachi_sbom"
if ZENBU_RELEASE_SBOM="$missing_sudachi_sbom" "$audit" source \
  >"${scratch_dir}/missing-sudachi-sbom.log" 2>&1; then
  fail "SBOM without SudachiDict Core unexpectedly passed"
fi
rg -q 'release SBOM is missing a pinned Japanese Text Analysis component' \
  "${scratch_dir}/missing-sudachi-sbom.log" || fail "missing Sudachi SBOM row was not reported"

stale_lockfile="${scratch_dir}/stale-Package.resolved"
jq '(.pins[] | select(.identity == "sudachi-swift").state.revision) = "stale"' \
  "${ios_dir}/Modules/Package.resolved" >"$stale_lockfile"
if ZENBU_PACKAGE_RESOLVED="$stale_lockfile" "$audit" source >"${scratch_dir}/stale-lockfile.log" 2>&1; then
  fail "stale Swift package revision unexpectedly passed"
fi
rg -q 'Swift package lockfile differs from reviewed revisions' \
  "${scratch_dir}/stale-lockfile.log" || fail "stale Swift package revision was not reported"

if ZENBU_XCODE_PACKAGE_RESOLVED="$stale_lockfile" "$audit" source \
  >"${scratch_dir}/stale-xcode-lockfile.log" 2>&1; then
  fail "stale Xcode-consumed Swift package revision unexpectedly passed"
fi
rg -q 'Swift package lockfile differs from reviewed revisions' \
  "${scratch_dir}/stale-xcode-lockfile.log" \
  || fail "stale Xcode-consumed Swift package revision was not reported"

if "$audit" unsupported-mode >"${scratch_dir}/unsupported.log" 2>&1; then
  fail "unsupported mode unexpectedly succeeded"
fi

fake_bin="${test_dir}/Fixtures/scan-error-bin"
if PATH="${fake_bin}:$PATH" "$audit" source >"${scratch_dir}/scanner-error.log" 2>&1; then
  fail "scanner execution error unexpectedly succeeded"
fi
rg -q 'scanner error' "${scratch_dir}/scanner-error.log" || fail "scanner execution error was not reported"

if [[ -n "${ZENBU_UNSIGNED_ARCHIVE:-}" ]]; then
  "$audit" unsigned-preflight "$ZENBU_UNSIGNED_ARCHIVE" >"${scratch_dir}/preflight-original.log"
  copied_archive="${scratch_dir}/moved-copy.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$copied_archive"
  "$audit" unsigned-preflight "$copied_archive" >"${scratch_dir}/preflight-copy.log"
  original_sha="$(rg -o 'ARTIFACT_SHA256=[0-9a-f]{64}' "${scratch_dir}/preflight-original.log")"
  copied_sha="$(rg -o 'ARTIFACT_SHA256=[0-9a-f]{64}' "${scratch_dir}/preflight-copy.log")"
  [[ "$original_sha" == "$copied_sha" ]] || fail "canonical artifact hash changed after moving the archive"

  missing_sudachi_archive="${scratch_dir}/missing-sudachi.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$missing_sudachi_archive"
  missing_sudachi="$(find "$missing_sudachi_archive/Products/Applications" -type f -name 'system_core.dic' -print -quit)"
  [[ -n "$missing_sudachi" ]] || fail "test archive did not contain the bundled Sudachi dictionary"
  unlink "$missing_sudachi"
  if "$audit" unsigned-preflight "$missing_sudachi_archive" \
    >"${scratch_dir}/missing-archive-sudachi.log" 2>&1; then
    fail "archive without bundled Sudachi dictionary unexpectedly passed"
  fi
  rg -q 'archive must contain exactly one bundled Sudachi Core dictionary' \
    "${scratch_dir}/missing-archive-sudachi.log" \
    || fail "missing archive Sudachi dictionary was not reported"

  corrupt_sudachi_archive="${scratch_dir}/corrupt-sudachi.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$corrupt_sudachi_archive"
  corrupt_sudachi="$(find "$corrupt_sudachi_archive/Products/Applications" -type f -name 'system_core.dic' -print -quit)"
  printf 'x' >>"$corrupt_sudachi"
  if "$audit" unsigned-preflight "$corrupt_sudachi_archive" \
    >"${scratch_dir}/corrupt-archive-sudachi.log" 2>&1; then
    fail "archive with corrupt Sudachi dictionary unexpectedly passed"
  fi
  rg -q 'archive Sudachi Core dictionary size differs' \
    "${scratch_dir}/corrupt-archive-sudachi.log" \
    || fail "corrupt archive Sudachi dictionary was not reported"

  duplicate_sudachi_archive="${scratch_dir}/duplicate-sudachi.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$duplicate_sudachi_archive"
  duplicate_sudachi="$(find "$duplicate_sudachi_archive/Products/Applications" -type f -name 'system_core.dic' -print -quit)"
  duplicate_sudachi_app="$(find "$duplicate_sudachi_archive/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
  mkdir "${duplicate_sudachi_app}/DuplicateLanguageResource"
  cp "$duplicate_sudachi" "${duplicate_sudachi_app}/DuplicateLanguageResource/system_core.dic"
  if "$audit" unsigned-preflight "$duplicate_sudachi_archive" \
    >"${scratch_dir}/duplicate-archive-sudachi.log" 2>&1; then
    fail "archive with duplicate Sudachi dictionary unexpectedly passed"
  fi
  rg -q 'archive must contain exactly one bundled Sudachi Core dictionary' \
    "${scratch_dir}/duplicate-archive-sudachi.log" \
    || fail "duplicate archive Sudachi dictionary was not reported"

  wheel_duplicate_archive="${scratch_dir}/wheel-duplicate-sudachi.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$wheel_duplicate_archive"
  wheel_duplicate_app="$(find "$wheel_duplicate_archive/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
  touch "${wheel_duplicate_app}/sudachidict_core-20260723.whl"
  if "$audit" unsigned-preflight "$wheel_duplicate_archive" \
    >"${scratch_dir}/wheel-duplicate-archive-sudachi.log" 2>&1; then
    fail "archive containing both wheel and expanded Sudachi dictionary unexpectedly passed"
  fi
  rg -q 'archive contains both compressed and expanded Sudachi resources' \
    "${scratch_dir}/wheel-duplicate-archive-sudachi.log" \
    || fail "archive wheel/dictionary duplication was not reported"

  missing_notice_archive="${scratch_dir}/missing-sudachi-notice.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$missing_notice_archive"
  missing_notice="$(find "$missing_notice_archive/Products/Applications" -type f -name 'SudachiLanguageTechnologyNotices.txt' -print -quit)"
  [[ -n "$missing_notice" ]] || fail "test archive did not contain Sudachi notices"
  unlink "$missing_notice"
  if "$audit" unsigned-preflight "$missing_notice_archive" \
    >"${scratch_dir}/missing-archive-sudachi-notice.log" 2>&1; then
    fail "archive without Sudachi notices unexpectedly passed"
  fi
  rg -q 'archive must contain exactly one Sudachi notice resource' \
    "${scratch_dir}/missing-archive-sudachi-notice.log" \
    || fail "missing archive Sudachi notices were not reported"

  missing_contract_archive="${scratch_dir}/missing-contract.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$missing_contract_archive"
  missing_contract="$(find "$missing_contract_archive/Products/Applications" -type f -name 'DictionaryRankingArtifactContract.json' -print -quit)"
  [[ -n "$missing_contract" ]] || fail "test archive did not contain the contract fixture"
  rm "$missing_contract"
  if "$audit" unsigned-preflight "$missing_contract_archive" >"${scratch_dir}/missing-contract.log" 2>&1; then
    fail "archive without embedded Dictionary Ranking contract unexpectedly passed"
  fi
  rg -q 'missing DictionaryRankingArtifactContract.json' "${scratch_dir}/missing-contract.log" \
    || fail "missing embedded contract was not reported"

  stale_contract_archive="${scratch_dir}/stale-contract.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$stale_contract_archive"
  stale_contract="$(find "$stale_contract_archive/Products/Applications" -type f -name 'DictionaryRankingArtifactContract.json' -print -quit)"
  [[ -n "$stale_contract" ]] || fail "test archive did not contain the contract fixture"
  cp "$import_manifest" "$stale_contract"
  if "$audit" unsigned-preflight "$stale_contract_archive" >"${scratch_dir}/stale-contract.log" 2>&1; then
    fail "archive with stale Dictionary Ranking contract unexpectedly passed"
  fi
  rg -q 'embedded Dictionary Ranking contract differs' "${scratch_dir}/stale-contract.log" \
    || fail "stale embedded contract was not reported"

  unreviewed_url_archive="${scratch_dir}/unreviewed-url.xcarchive"
  cp -R "$ZENBU_UNSIGNED_ARCHIVE" "$unreviewed_url_archive"
  unreviewed_url_app="$(find "$unreviewed_url_archive/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
  [[ -n "$unreviewed_url_app" ]] || fail "test archive did not contain an application bundle"
  unreviewed_url_executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${unreviewed_url_app}/Info.plist")"
  mkdir "${unreviewed_url_app}/NestedResource"
  printf '%s\n' 'https://unreviewed.invalid' >"${unreviewed_url_app}/NestedResource/${unreviewed_url_executable}"
  if "$audit" unsigned-preflight "$unreviewed_url_archive" >"${scratch_dir}/unreviewed-url.log" 2>&1; then
    fail "archive with an unreviewed product URL unexpectedly passed"
  fi
  rg -q 'unexpected URL host' "${scratch_dir}/unreviewed-url.log" \
    || fail "unreviewed product URL was not reported"

  url_find_error_bin="${test_dir}/Fixtures/url-find-error-bin"
  if PATH="${url_find_error_bin}:$PATH" "$audit" unsigned-preflight "$ZENBU_UNSIGNED_ARCHIVE" \
    >"${scratch_dir}/url-find-error.log" 2>&1; then
    fail "packaged URL file-enumeration error unexpectedly succeeded"
  fi
  rg -q 'failed to enumerate packaged files for URL inspection' "${scratch_dir}/url-find-error.log" \
    || fail "packaged URL file-enumeration error was not reported"

  strings_error_bin="${test_dir}/Fixtures/strings-error-bin"
  if PATH="${strings_error_bin}:$PATH" "$audit" unsigned-preflight "$ZENBU_UNSIGNED_ARCHIVE" \
    >"${scratch_dir}/strings-error.log" 2>&1; then
    fail "executable strings scanner error unexpectedly succeeded"
  fi
  rg -q 'failed to inspect executable strings for private build paths' \
    "${scratch_dir}/strings-error.log" \
    || fail "executable strings scanner error was not reported"
fi

if [[ -n "${ZENBU_SIGNED_ARCHIVE:-}" ]]; then
  test_nested_signing_metadata
  "$audit" signed-candidate "$ZENBU_SIGNED_ARCHIVE" >"${scratch_dir}/signed-candidate.log"
  rg -q 'frozen signed-candidate privacy audit complete' "${scratch_dir}/signed-candidate.log" \
    || fail "signed candidate did not complete the frozen privacy audit"
fi

echo "PASS: release privacy audit mode, scanner failure, and optional archive identity tests"
