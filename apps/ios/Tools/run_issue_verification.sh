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
reuse_root="$(mktemp -d "${TMPDIR:-/tmp}/zenbu-issue-verification.XXXXXX")"
cleanup_reuse_root() {
  rm -rf "$reuse_root"
}
trap cleanup_reuse_root EXIT
selectors_for() {
  printf '%s' "$plan_json" | jq -c --arg tier "$1" '.partitions[$tier] // []'
}

contracts="$(selectors_for contracts)"
if [[ "$contracts" != '[]' ]]; then
  (
    cd "$repo_root"
    python3 apps/ios/Tools/ios_verification.py validate
    python3 -m unittest discover apps/ios/Tools/Tests -p 'test_*.py'
    actionlint
    bash -n \
      apps/ios/Tools/run_ci_test_plan.sh \
      apps/ios/Tools/run_issue_verification.sh \
      apps/ios/Tools/run_selected_test_plan.sh
    for plan in apps/ios/TestPlans/*.xctestplan; do jq empty "$plan"; done
    xmllint --noout \
      apps/ios/ZenbuJapanese.xcodeproj/xcshareddata/xcschemes/ZenbuJapanese.xcscheme
    bash apps/ios/Tools/Tests/audit-release-privacy.test.sh
    bash apps/ios/Tools/audit_release_privacy.sh source
  )
fi

run_partition() {
  local tier="$1" plan="$2"
  local selectors
  selectors="$(selectors_for "$tier")"
  [[ "$selectors" != '[]' ]] || return 0
  ZENBU_DERIVED_DATA="$reuse_root/$plan" \
    ZENBU_POLICY_AUTHORIZED=true \
    ZENBU_VERIFICATION_STAGE="$stage" \
    "$tool_dir/run_selected_test_plan.sh" \
    "$plan" \
    com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max \
    "$result_dir/Zenbu-${tier}.xcresult" \
    "$selectors" \
    "$current_head"
}

run_partition unit ZenbuPR
run_partition ui ZenbuPR
run_partition accessibility ZenbuAccessibility
run_partition integration ZenbuSudachiIntegration
