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
# /dictionary/service.json existed can't tell, so the wait fails there, unless
# SITE_WITHOUT_STATUS_ROUTE is true: a manual run's word that the service's /healthz was confirmed
# by hand, for production's first switch.
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

page="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${smoke[@]}" "$site/dictionary/" || true)"
if [ "$page" != 200 ]; then
  echo "::error::$site/dictionary/ answers ${page:-nothing} (000 is no answer): WEB_WORKERS_DEV_URL should be the $env site's workers.dev address"
  exit 1
fi

seen=""
started=$SECONDS
while [ $((SECONDS - started)) -lt "$timeout" ]; do
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 20 "${smoke[@]}" "$site/dictionary/service.json" || true)"
  if [ "$code" = 404 ]; then
    if [ "${SITE_WITHOUT_STATUS_ROUTE:-false}" = true ]; then
      echo "::warning::The $env site predates /dictionary/service.json, so nothing here confirms its service runs $build; this run says its /healthz was confirmed by hand."
      echo "deployed=true" >>"$output"
      exit 0
    fi
    echo "::error::The $env site has no /dictionary/service.json, so nothing confirms its service runs $build. For production's first switch, run this workflow by hand with site_without_status_route, and check its /healthz by hand before Web deploy (docs/agents/dictionary-api.md, Ship it)."
    exit 1
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
