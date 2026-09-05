#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "usage: run_issue_verification.sh STAGE BASE_SHA HEAD_SHA RESULT_DIR [CAPABILITY...]" >&2
  exit 64
fi

stage="$1"
base_sha="$2"
head_sha="$3"
result_dir="$4"
shift 4
[[ "$stage" == tdd || "$stage" == issue-final ]] || {
  echo "local issue verification supports only tdd or issue-final" >&2
  exit 65
}

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$tool_dir/../../.." && pwd)"
resolved_head="$(git -C "$repo_root" rev-parse "$head_sha")"
current_head="$(git -C "$repo_root" rev-parse HEAD)"
[[ "$resolved_head" == "$current_head" ]] || {
  echo "requested head $resolved_head is not current checkout $current_head" >&2
  exit 66
}

plan_arguments=(
  --stage "$stage"
  --event local
  --draft true
  --source-sha "$current_head"
  --base "$base_sha"
  --head "$current_head"
)
for capability in "$@"; do
  plan_arguments+=(--capability "$capability")
done
while IFS= read -r changed_path; do
  [[ -z "$changed_path" ]] || plan_arguments+=(--path "$changed_path")
done < <(
  {
    git -C "$repo_root" diff --name-only HEAD
    git -C "$repo_root" ls-files --others --exclude-standard
  } | sort -u
)

plan_json="$(
  cd "$repo_root"
  python3 "$tool_dir/ios_verification.py" plan "${plan_arguments[@]}"
)"
printf '%s\n' "$plan_json"
resolved_selector_count="$(printf '%s' "$plan_json" | jq '.selectors | length')"
[[ "$resolved_selector_count" -gt 0 ]] || {
  echo "no repository verification selector covers this issue change" >&2
  exit 67
}

mkdir -p "$result_dir"
selectors_for() {
  printf '%s' "$plan_json" | jq -c --arg tier "$1" '.partitions[$tier] // []'
}

contracts="$(selectors_for contracts)"
units="$(selectors_for unit)"
for prohibited_tier in ui diagnostics accessibility integration complete performance; do
  [[ "$(selectors_for "$prohibited_tier")" == '[]' ]] || {
    echo "issue verification policy selected prohibited $prohibited_tier coverage" >&2
    exit 68
  }
done

if [[ "$contracts" != '[]' ]]; then
  [[ "$contracts" == '["contracts.issue-policy"]' ]] || {
    echo "issue verification resolved an unsupported broad contract selector: $contracts" >&2
    exit 68
  }
  (
    cd "$repo_root"
    python3 apps/ios/Tools/ios_verification.py validate
    python3 apps/ios/Tools/Tests/test_issue_verification_policy.py
  )
fi

if [[ "$units" != '[]' ]]; then
  python3 "$tool_dir/prepare_sudachi_core.py" \
    --manifest "$repo_root/apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json" \
    --cache "${ZENBU_SUDACHI_BUILD_CACHE:-$HOME/Library/Caches/com.zenbujapanese.build/SudachiCore}" \
    --cache-only \
    --offline
  source_fingerprint="$(
    python3 "$tool_dir/ios_verification.py" source-fingerprint --repo-root "$repo_root"
  )"
  reuse_root="${ZENBU_ISSUE_DERIVED_DATA_ROOT:-${TMPDIR:-/tmp}/zenbu-issue-verification-products}/$source_fingerprint"
  mkdir -p "$reuse_root"
fi

run_partition() {
  local tier="$1" plan="$2"
  local selectors partition_status duration_status maximum_prepared_seconds
  selectors="$(selectors_for "$tier")"
  [[ "$selectors" != '[]' ]] || return 0
  set +e
  ZENBU_DERIVED_DATA="$reuse_root/$plan" \
    ZENBU_TIMING_SUMMARY="$result_dir/Zenbu-${tier}.timing.json" \
    ZENBU_POLICY_AUTHORIZED=true \
    ZENBU_VERIFICATION_STAGE="$stage" \
    "$tool_dir/run_selected_test_plan.sh" \
    "$plan" \
    com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max \
    "$result_dir/Zenbu-${tier}.xcresult" \
    "$selectors" \
    "$current_head"
  partition_status=$?
  set -e
  maximum_prepared_seconds="$(
    jq -r '.issue_execution.maximum_prepared_seconds' "$repo_root/apps/ios/VerificationPolicy.json"
  )"
  duration_status=70
  if [[ -f "$result_dir/Zenbu-${tier}.timing.json" ]]; then
    set +e
    python3 "$tool_dir/ios_verification.py" verify-issue-duration \
      --summary "$result_dir/Zenbu-${tier}.timing.json" \
      --maximum-seconds "$maximum_prepared_seconds"
    duration_status=$?
    set -e
  else
    echo "issue verification emitted no timing summary for $tier" >&2
  fi
  if [[ "$partition_status" -ne 0 ]]; then
    [[ "$duration_status" -eq 0 ]] || {
      echo "the failed $tier partition also failed its observed-duration contract" >&2
    }
    return "$partition_status"
  fi
  return "$duration_status"
}

run_partition unit ZenbuPR
