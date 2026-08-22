#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: run_ci_test_plan.sh PLAN DEVICE_TYPE RESULT_BUNDLE [XCODEBUILD_ARGS...]" >&2
  exit 64
fi

plan="$1"
device_type="$2"
result_bundle="$3"
shift 3

[[ ! -e "$result_bundle" ]] || {
  echo "result bundle already exists: $result_bundle" >&2
  exit 65
}

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

simulator_name="Zenbu CI ${plan} ${GITHUB_RUN_ID:-local} ${GITHUB_RUN_ATTEMPT:-1}"
simulator_id="$(xcrun simctl create "$simulator_name" "$device_type" "$runtime_id")"
cleanup() {
  xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
  xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b
xcodebuild test \
  -project apps/ios/ZenbuJapanese.xcodeproj \
  -scheme ZenbuJapanese \
  -testPlan "$plan" \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -parallel-testing-enabled NO \
  -resultBundlePath "$result_bundle" \
  "$@"
