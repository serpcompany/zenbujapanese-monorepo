#!/usr/bin/env bash

# Return 0 only for validated nested signing metadata, 1 for bytes that must
# remain in the product URL scan, and 2 when signature verification fails.
release_is_validated_signing_metadata() {
  local mode="$1"
  local packaged_file="$2"
  local verification_log="$3"
  [[ "$mode" == signed-candidate ]] || return 1
  case "$packaged_file" in
    *.bundle/_CodeSignature/CodeResources|*.bundle/_CodeSignature/CodeDirectory|*.bundle/_CodeSignature/CodeSignature|*.bundle/_CodeSignature/CodeRequirements) ;;
    *) return 1 ;;
  esac
  local bundle_path="${packaged_file%/_CodeSignature/*}"
  codesign --verify --strict "$bundle_path" >"$verification_log" 2>&1 || return 2
  return 0
}
