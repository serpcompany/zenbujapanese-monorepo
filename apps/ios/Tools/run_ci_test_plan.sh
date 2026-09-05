#!/usr/bin/env bash

set -euo pipefail

[[ "${ZENBU_POLICY_AUTHORIZED:-false}" == true ]] || {
  echo "use the repository verification policy runner; direct Xcode plan runs are refused" >&2
  exit 63
}

if [[ $# -lt 3 ]]; then
  echo "usage: run_ci_test_plan.sh PLAN DEVICE_TYPE RESULT_BUNDLE [XCODEBUILD_ARGS...]" >&2
  exit 64
fi

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$tool_dir/../../.." && pwd)"

if [[ "${CI:-false}" != true && "${ZENBU_SIMULATOR_LEASE_HELD:-false}" != true ]]; then
  lease_root="${TMPDIR:-/tmp}/zenbu-japanese-ios-simulator.lease"
  export ZENBU_SIMULATOR_LEASE_HELD=true
  exec python3 "$tool_dir/ios_verification.py" lease-run \
    --lock "$lease_root" \
    --owner "${ZENBU_VERIFICATION_OWNER:-local-$$}" \
    -- "$0" "$@"
fi

plan="$1"
device_type="$2"
result_bundle="$3"
shift 3

[[ ! -e "$result_bundle" ]] || {
  echo "result bundle already exists: $result_bundle" >&2
  exit 65
}

seconds() {
  python3 -c 'import time; print(time.monotonic())'
}

elapsed() {
  python3 - "$1" "$2" <<'PY'
import sys
print(f"{float(sys.argv[2]) - float(sys.argv[1]):.3f}")
PY
}

setup_started="$(seconds)"
setup_finished="$setup_started"
build_started="$setup_started"
build_finished="$setup_started"
test_started="$setup_started"
summary_path="${ZENBU_TIMING_SUMMARY:-${result_bundle}.timing.json}"
selector_json="${ZENBU_SELECTOR_IDS:-[]}"
summary_written=false
phase=setup
simulator_id=""
runtime_id=unavailable
xcode_version=unavailable
source_fingerprint=unavailable
build_fingerprint=unavailable
created_derived_data=false
derived_data=""

# Invoked by the EXIT trap through finalize.
# shellcheck disable=SC2329
cleanup() {
  if [[ -n "$simulator_id" ]]; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
  fi
  if [[ "$created_derived_data" == true && -n "$derived_data" ]]; then
    rm -rf "$derived_data"
  fi
}

# Invoked by the EXIT trap.
# shellcheck disable=SC2329
finalize() {
  local execution_exit=$?
  if [[ "$summary_written" != true ]]; then
    local failed_at setup_duration build_duration test_duration failure_json
    failed_at="$(seconds)"
    setup_duration="$(elapsed "$setup_started" "${setup_finished:-$failed_at}")"
    build_duration=0
    test_duration=0
    if [[ "$phase" == setup ]]; then
      setup_duration="$(elapsed "$setup_started" "$failed_at")"
    elif [[ "$phase" == build ]]; then
      build_duration="$(elapsed "$build_started" "$failed_at")"
    else
      build_duration="$(elapsed "$build_started" "$build_finished")"
      test_duration="$(elapsed "$test_started" "$failed_at")"
    fi
    failure_json="{\"classification\":\"${phase}-failure\",\"rerun_eligible\":false}"
    python3 "$tool_dir/ios_verification.py" summary \
      --source-sha "${ZENBU_SOURCE_SHA:-$(git -C "$repo_root" rev-parse HEAD)}" \
      --source-fingerprint "$source_fingerprint" \
      --build-fingerprint "$build_fingerprint" \
      --plan "$plan" \
      --selectors-json "$selector_json" \
      --os-version "$runtime_id" \
      --xcode-version "$xcode_version" \
      --attempt "${GITHUB_RUN_ATTEMPT:-1}" \
      --setup-seconds "$setup_duration" \
      --build-seconds "$build_duration" \
      --test-seconds "$test_duration" \
      --build-mode fresh \
      --tests-started 0 \
      --failure-json "$failure_json" \
      | tee "$summary_path" || true
  fi
  cleanup
  trap - EXIT
  exit "$execution_exit"
}
trap finalize EXIT

runtime_id="$({ xcrun simctl list runtimes --json; } | jq -r '
  [.runtimes[]
    | select(.isAvailable == true)
    | select(.platform == "iOS")
    | select(.version | startswith("26."))]
  | sort_by(.version)
  | last
  | .identifier
')"
[[ -n "$runtime_id" && "$runtime_id" != null ]] || {
  echo "no available iOS 26 Simulator runtime" >&2
  exit 66
}

simulator_name="Zenbu CI ${plan} ${GITHUB_RUN_ID:-local} ${GITHUB_RUN_ATTEMPT:-1} $$"
simulator_id="$(xcrun simctl create "$simulator_name" "$device_type" "$runtime_id")"
derived_data="${ZENBU_DERIVED_DATA:-${result_bundle%.xcresult}-DerivedData}"
if [[ -z "${ZENBU_DERIVED_DATA:-}" ]]; then
  created_derived_data=true
fi

xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b

# A real local Photos asset makes picker selection deterministic on a fresh device.
# This UUID was created by this invocation; personal Simulator libraries are untouched.
xcrun simctl addmedia "$simulator_id" "$repo_root/docs/clone-discovery/nihongo/fixtures/image-text/fixture-clear-horizontal.png"

xcode_version="$(xcodebuild -version | tr '\n' ' ' | sed 's/ $//')"
fingerprint_arguments=()
build_arguments=()
for argument in "$@"; do
  fingerprint_arguments+=("--build-argument=$argument")
  if [[ "$argument" != -only-testing:* && "$argument" != -skip-testing:* ]]; then
    build_arguments+=("$argument")
  fi
done
fingerprint_command=(
  python3 "$tool_dir/ios_verification.py" fingerprint
  --repo-root "$repo_root"
  --plan "$plan"
  --device-type "$device_type"
  --xcode-version "$xcode_version"
  --runtime-id "$runtime_id"
)
if [[ ${#fingerprint_arguments[@]} -gt 0 ]]; then
  fingerprint_command+=("${fingerprint_arguments[@]}")
fi
fingerprints="$("${fingerprint_command[@]}")"
source_fingerprint="$(printf '%s' "$fingerprints" | jq -r .source_fingerprint)"
build_fingerprint="$(printf '%s' "$fingerprints" | jq -r .build_fingerprint)"
marker="$derived_data/ZenbuBuildProducts.json"
setup_finished="$(seconds)"

build_started="$setup_finished"
phase=build
if [[ -f "$marker" ]]; then
  python3 "$tool_dir/ios_verification.py" verify-products \
    --marker "$marker" \
    --source-fingerprint "$source_fingerprint" \
    --build-fingerprint "$build_fingerprint"
  build_mode=reused
else
  mkdir -p "$derived_data"
  build_command=(
    xcodebuild build-for-testing
    -project "$repo_root/apps/ios/ZenbuJapanese.xcodeproj"
    -scheme ZenbuJapanese
    -testPlan "$plan"
    -destination "platform=iOS Simulator,id=$simulator_id"
    -parallel-testing-enabled NO
    -derivedDataPath "$derived_data"
  )
  if [[ ${#build_arguments[@]} -gt 0 ]]; then
    build_command+=("${build_arguments[@]}")
  fi
  "${build_command[@]}"
  printf '%s\n' "$fingerprints" > "$marker"
  build_mode=fresh
fi
build_finished="$(seconds)"

test_started="$build_finished"
phase="test"
test_log="${result_bundle}.xcodebuild.log"
set +e
xcodebuild test-without-building \
  -project "$repo_root/apps/ios/ZenbuJapanese.xcodeproj" \
  -scheme ZenbuJapanese \
  -testPlan "$plan" \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -parallel-testing-enabled NO \
  -derivedDataPath "$derived_data" \
  -resultBundlePath "$result_bundle" \
  "$@" 2>&1 | tee "$test_log"
test_status=${PIPESTATUS[0]}
set -e
test_finished="$(seconds)"

tests_started=0
if [[ -d "$result_bundle" ]]; then
  set +e
  result_summary="$(
    xcrun xcresulttool get test-results summary \
      --path "$result_bundle" \
      --format json 2>>"$test_log"
  )"
  result_summary_exit=$?
  if [[ "$result_summary_exit" -eq 0 ]]; then
    tests_started="$(printf '%s' "$result_summary" | jq -r '.totalTestCount // 0' 2>>"$test_log")"
    result_summary_exit=$?
  fi
  set -e
  if [[ "$result_summary_exit" -ne 0 ]]; then
    printf 'Unable to decode test count from result bundle (exit %s).\n' \
      "$result_summary_exit" >> "$test_log"
    tests_started=0
  fi
fi
failure_category=unclassified-zero-test
if [[ "$test_status" -eq 0 && "$tests_started" -eq 0 ]]; then
  failure_category=zero-test-success
  test_status=67
elif [[ "$test_status" -eq 0 ]]; then
  failure_category=success
elif [[ "$tests_started" -gt 0 ]]; then
  failure_category=product-assertion
elif grep -q 'Unable to find a destination matching' "$test_log"; then
  failure_category=simulator-unavailable
elif grep -Eq 'Failed to start test session|Lost connection to testmanagerd' "$test_log"; then
  failure_category=xcode-service-unavailable
elif grep -q 'No devices are booted' "$test_log"; then
  failure_category=simulator-uuid-lost
fi
failure_json="$(
  if [[ "$failure_category" == success ]]; then
    printf '%s\n' '{"classification":"success","rerun_eligible":false}'
  elif [[ "$failure_category" == zero-test-success ]]; then
    printf '%s\n' '{"classification":"zero-test-success","rerun_eligible":false}'
  else
    python3 "$tool_dir/ios_verification.py" classify-failure \
      --tests-started "$tests_started" \
      --category "$failure_category"
  fi
)"

setup_duration="$(elapsed "$setup_started" "$setup_finished")"
build_duration="$(elapsed "$build_started" "$build_finished")"
test_duration="$(elapsed "$test_started" "$test_finished")"
python3 "$tool_dir/ios_verification.py" summary \
  --source-sha "${ZENBU_SOURCE_SHA:-$(git -C "$repo_root" rev-parse HEAD)}" \
  --source-fingerprint "$source_fingerprint" \
  --build-fingerprint "$build_fingerprint" \
  --plan "$plan" \
  --selectors-json "$selector_json" \
  --os-version "$runtime_id" \
  --xcode-version "$xcode_version" \
  --attempt "${GITHUB_RUN_ATTEMPT:-1}" \
  --setup-seconds "$setup_duration" \
  --build-seconds "$build_duration" \
  --test-seconds "$test_duration" \
  --build-mode "$build_mode" \
  --tests-started "$tests_started" \
  --failure-json "$failure_json" \
  | tee "$summary_path"
summary_written=true

exit "$test_status"
