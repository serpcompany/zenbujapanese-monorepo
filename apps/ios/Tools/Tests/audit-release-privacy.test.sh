#!/usr/bin/env bash

set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
audit="$(cd "${test_dir}/.." && pwd)/audit_release_privacy.sh"
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

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
fi

echo "PASS: release privacy audit mode, scanner failure, and optional archive identity tests"
