#!/usr/bin/env bash
# Waits until an environment's dictionary service answers with a build, after the `Dictionary API
# deploy` workflow moved the environment's tag: the server's deployer (deployer.sh) checks the tag
# every 5 minutes, then swaps the image in. Writes `deployed=true` to the step's outputs once the
# environment's public URL names the build. An environment without a service yet (no
# DICTIONARY_API_URL) is skipped with a warning.
#
#   await-build.sh <staging|production> <build> [timeout seconds]
set -euo pipefail

env="${1:?usage: await-build.sh <staging|production> <build> [timeout seconds]}"
build="${2:?usage: await-build.sh <staging|production> <build> [timeout seconds]}"
timeout="${3:-900}"
output="${GITHUB_OUTPUT:-/dev/null}"

if [ -z "${DICTIONARY_API_URL:-}" ]; then
  echo "::warning::The $env GitHub environment has no DICTIONARY_API_URL variable, so nothing checks that its server deploys $build (docs/agents/dictionary-api.md, Ship it)"
  exit 0
fi
url="${DICTIONARY_API_URL%/}"
seen=""
started=$SECONDS
while [ $((SECONDS - started)) -lt "$timeout" ]; do
  seen="$(curl -fsS --max-time 10 "$url/healthz" | jq -r .build 2>/dev/null || true)"
  if [ "$seen" = "$build" ]; then
    echo "$env answers with $build after $((SECONDS - started)) s"
    echo "deployed=true" >>"$output"
    exit 0
  fi
  sleep 15
done
echo "::error::$url/healthz still answers with build '${seen:-nothing}', not $build, after $timeout s. The server's deployer logs why: journalctl -t zenbujapanese-dictionary-api"
exit 1
