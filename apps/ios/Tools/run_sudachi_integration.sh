#!/usr/bin/env bash

set -euo pipefail

tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
result_path="${1:-${TMPDIR:-/tmp}/ZenbuSudachiIntegration.xcresult}"

ZENBU_POLICY_AUTHORIZED=true ZENBU_VERIFICATION_STAGE=integration \
  "${tool_dir}/run_ci_test_plan.sh" \
  ZenbuSudachiIntegration \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max \
  "$result_path"
