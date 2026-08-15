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

[[ -f "$source_contract" ]] || fail "reviewed source contract fixture is missing"

"$audit" source >"${scratch_dir}/source.log"
rg -q 'source audit complete; this is not archive or signed-candidate evidence' "${scratch_dir}/source.log" || fail "source mode did not identify its evidence boundary"

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
fi

if [[ -n "${ZENBU_SIGNED_ARCHIVE:-}" ]]; then
  "$audit" signed-candidate "$ZENBU_SIGNED_ARCHIVE" >"${scratch_dir}/signed-candidate.log"
  rg -q 'frozen signed-candidate privacy audit complete' "${scratch_dir}/signed-candidate.log" \
    || fail "signed candidate did not complete the frozen privacy audit"
fi

echo "PASS: release privacy audit mode, scanner failure, and optional archive identity tests"
