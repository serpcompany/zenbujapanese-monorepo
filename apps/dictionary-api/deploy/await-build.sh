#!/usr/bin/env bash
# Waits until an environment's dictionary service answers with a build, after the `Dictionary API
# deploy` workflow moved the environment's tag: the server's deployer (deployer.sh) checks the tag
# every 5 minutes, then swaps the image in. Writes `deployed=true` to the step's outputs once it
# does.
#
# It asks through the environment's website, since Bot Fight Mode on the zone challenges CI runners
# that ask the service directly: the site's /dictionary/service.json names the build its Worker
# gets. The site is reached at its workers.dev address (WEB_WORKERS_DEV_URL), which the zone doesn't
# cover, with the smoke-test header that keeps workers.dev from redirecting to the branded domain.
# An environment without WEB_WORKERS_DEV_URL is skipped with a warning. A site deployed before
# /dictionary/service.json existed can't tell, so then the wait ends with a warning.
#
#   await-build.sh <staging|production> <build> [timeout seconds]
set -euo pipefail

env="${1:?usage: await-build.sh <staging|production> <build> [timeout seconds]}"
build="${2:?usage: await-build.sh <staging|production> <build> [timeout seconds]}"
timeout="${3:-900}"
output="${GITHUB_OUTPUT:-/dev/null}"

if [ -z "${WEB_WORKERS_DEV_URL:-}" ]; then
  echo "::warning::The $env GitHub environment has no WEB_WORKERS_DEV_URL variable, so nothing checks that its server deploys $build (docs/agents/dictionary-api.md, Ship it)"
  exit 0
fi
site="${WEB_WORKERS_DEV_URL%/}"
smoke=(-H 'x-zenbu-smoke-test: 1')
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

page="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${smoke[@]}" "$site/dictionary/")"
if [ "$page" != 200 ]; then
  echo "::error::$site/dictionary/ answers $page: WEB_WORKERS_DEV_URL should be the $env site's workers.dev address"
  exit 1
fi

seen=""
started=$SECONDS
while [ $((SECONDS - started)) -lt "$timeout" ]; do
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 20 "${smoke[@]}" "$site/dictionary/service.json" || true)"
  if [ "$code" = 404 ]; then
    echo "::warning::The $env site predates /dictionary/service.json, so nothing confirms its service runs $build; the next deploy will."
    echo "deployed=true" >>"$output"
    exit 0
  fi
  seen="$(jq -r '.build // empty' "$body" 2>/dev/null || true)"
  if [ "$seen" = "$build" ]; then
    echo "$env answers with $build after $((SECONDS - started)) s"
    echo "deployed=true" >>"$output"
    exit 0
  fi
  sleep 15
done
echo "::error::The $env site's service still answers with build '${seen:-nothing}', not $build, after $timeout s ($(head -c 300 "$body")). The server's deployer logs why: journalctl -t zenbujapanese-dictionary-api"
exit 1
