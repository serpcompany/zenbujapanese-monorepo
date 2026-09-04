#!/usr/bin/env bash

set -euo pipefail

[[ "${ZENBU_POLICY_AUTHORIZED:-false}" == true ]] || {
  echo "use run_issue_verification.sh or a repository workflow; direct selector runs are refused" >&2
  exit 63
}
[[ -n "${ZENBU_VERIFICATION_STAGE:-}" ]] || {
  echo "missing repository-resolved verification stage" >&2
  exit 63
}

if [[ $# -ne 5 ]]; then
  echo "usage: run_selected_test_plan.sh PLAN DEVICE_TYPE RESULT_BUNDLE SELECTORS_JSON SOURCE_SHA" >&2
  exit 64
fi

plan="$1"
device_type="$2"
result_bundle="$3"
selectors_json="$4"
source_sha="$5"
tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$tool_dir/../../.." && pwd)"
python3 "$tool_dir/ios_verification.py" verify-sha \
  --current "$(git -C "$repo_root" rev-parse HEAD)" \
  --tested "$source_sha"

selector_ids=()
while IFS= read -r selector_id; do
  [[ -z "$selector_id" ]] || selector_ids+=("$selector_id")
done < <(printf '%s' "$selectors_json" | jq -r '.[]')
[[ ${#selector_ids[@]} -gt 0 ]] || {
  echo "repository policy resolved no selectors for $plan; refusing a broad implicit run" >&2
  exit 65
}

test_names=()
selector_arguments=()
full_plan_selector_count=0
for selector_id in "${selector_ids[@]}"; do
  resolved_selection="$(
    python3 "$tool_dir/ios_verification.py" tests \
      --plan "$plan" \
      --stage "$ZENBU_VERIFICATION_STAGE" \
      --repo-root "$repo_root" \
      --selector "$selector_id"
  )"
  selection_mode="$(printf '%s' "$resolved_selection" | jq -er '.mode')"
  case "$selection_mode" in
    full-plan)
      [[ "$(printf '%s' "$resolved_selection" | jq '.tests | length')" -eq 0 ]] || {
        echo "full-plan selection unexpectedly contained test identities" >&2
        exit 66
      }
      full_plan_selector_count=$((full_plan_selector_count + 1))
      ;;
    selected-tests)
      while IFS= read -r test_name; do
        [[ -z "$test_name" ]] && continue
        test_names+=("$test_name")
        selector_arguments+=("-only-testing:$test_name")
      done < <(printf '%s' "$resolved_selection" | jq -r '.tests[]')
      ;;
    *)
      echo "unknown repository test-selection mode: $selection_mode" >&2
      exit 66
      ;;
  esac
done

[[ $full_plan_selector_count -eq 0 || ($full_plan_selector_count -eq 1 && ${#selector_ids[@]} -eq 1) ]] || {
  echo "a full-plan selector cannot be combined with another selector" >&2
  exit 66
}
[[ ${#test_names[@]} -gt 0 || $full_plan_selector_count -eq 1 ]] || {
  echo "repository selector resolved zero tests for $plan" >&2
  exit 67
}

printf 'source_sha=%s\nplan=%s\nselector_ids=%s\ntests=%s\n' \
  "$source_sha" "$plan" "$selectors_json" "${test_names[*]:-all}"

selected_command=(
  "$tool_dir/run_ci_test_plan.sh"
  "$plan"
  "$device_type"
  "$result_bundle"
)
if [[ ${#selector_arguments[@]} -gt 0 ]]; then
  selected_command+=("${selector_arguments[@]}")
fi
ZENBU_SELECTOR_IDS="$selectors_json" ZENBU_SOURCE_SHA="$source_sha" \
  "${selected_command[@]}"
