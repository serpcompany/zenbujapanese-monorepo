#!/usr/bin/env bash
# Waits, before `Web deploy` deploys an environment, until that environment's dictionary service
# runs a release that includes every change to its image up to this commit, so a site never goes
# out ahead of the service it reads (docs/agents/dictionary-api.md, Ship it). A commit whose
# service is already current deploys at once, however the service got there.
#
# The service's release comes from the site deployed there now: its /dictionary/service.json, at
# its workers.dev address (WEB_WORKERS_DEV_URL; Bot Fight Mode challenges CI runners that ask the
# service directly). The last change to the image is the last commit, up to this one, that touched
# the `Dictionary API deploy` workflow's push paths. While it waits, a service deploy of a commit
# that includes that change, and that ended without bringing this environment up to date, stops
# the site's deploy too; so does an hour without one.
#
#   scripts/wait-for-dictionary-service.sh <staging|production>
#
# Needs GH_TOKEN (read access to the repository's Actions), WEB_WORKERS_DEV_URL, and the
# repository's history (a checkout with fetch-depth: 0). SITE_WITHOUT_STATUS_ROUTE=true accepts a
# site that predates /dictionary/service.json: a manual run's word that the service was checked by
# hand, for production's first switch.
set -euo pipefail

env="${1:?usage: wait-for-dictionary-service.sh <staging|production>}"
sha="${GITHUB_SHA:?}"
site="${WEB_WORKERS_DEV_URL:-}"
if [ -z "$site" ]; then
  echo "::error::The $env GitHub environment has no WEB_WORKERS_DEV_URL variable, so nothing can tell which release its dictionary service runs (docs/agents/dictionary-api.md, Set up the server)"
  exit 1
fi
site="${site%/}"
root="$(git rev-parse --show-toplevel)"
workflow=dictionary-api-deploy.yml
service_deploy_timeout_seconds=3600
poll_seconds=30

# What the image holds: the deploy workflow's push paths, as git pathspecs.
pathspecs=()
while read -r path; do
  if [[ "$path" == '!'* ]]; then
    pathspecs+=(":(exclude,glob)${path#!}")
  else
    pathspecs+=(":(glob)$path")
  fi
done < <(awk '
  /^  push:/ { in_push = 1; next }
  in_push && /^    paths:/ { in_paths = 1; next }
  in_paths && /^      - / { sub(/^      - /, ""); gsub(/\047/, ""); print; next }
  in_paths { exit }
' "$root/.github/workflows/$workflow")
if [ "${#pathspecs[@]}" -eq 0 ]; then
  echo "::error::Couldn't read the image's paths from .github/workflows/$workflow"
  exit 1
fi

needed="$(git -C "$root" log -1 --format=%H "$sha" -- "${pathspecs[@]}")"
if [ -z "$needed" ]; then
  echo "No commit up to $sha changed the dictionary service's image: nothing to wait for."
  exit 0
fi
echo "The $env service must run a release that includes $needed, the last change to its image."

# Whether a release (a commit, as the service's build names it) includes the needed change.
includes_needed() {
  local commit
  commit="$(git -C "$root" rev-parse --verify --quiet "$1^{commit}")" || return 1
  git -C "$root" merge-base --is-ancestor "$needed" "$commit"
}

# The newest service deploy on main of a commit that includes the needed change: the run that
# brings the service up to date.
deploying_run() {
  local id head
  gh run list --workflow "$workflow" --branch main --limit 30 --json databaseId,headSha,event \
    --jq '.[] | select(.event != "pull_request") | "\(.databaseId) \(.headSha)"' |
    while read -r id head; do
      if git -C "$root" merge-base --is-ancestor "$needed" "$head" 2>/dev/null; then
        echo "$id"
        return
      fi
    done
}

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
deadline=$((SECONDS + service_deploy_timeout_seconds))
seen="unread"
while [ "$SECONDS" -lt "$deadline" ]; do
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 20 -H 'x-zenbu-smoke-test: 1' \
    "$site/dictionary/service.json" || true)"
  if [ "$code" = 404 ]; then
    if [ "${SITE_WITHOUT_STATUS_ROUTE:-false}" = true ]; then
      echo "::warning::The $env site predates /dictionary/service.json, so nothing here confirms its service includes $needed; this run says the service was checked by hand."
      exit 0
    fi
    echo "::error::The $env site has no /dictionary/service.json, so nothing confirms its service includes $needed. For production's first switch, check its /healthz by hand, then run this workflow by hand with site_without_status_route (docs/agents/dictionary-api.md, Ship it)."
    exit 1
  fi
  build="$(sed -n 's/.*"build":"\([^"]*\)".*/\1/p' "$body")"
  if [ -n "$build" ] && includes_needed "${build##*-}"; then
    echo "The $env service runs $build, which includes $needed."
    exit 0
  fi
  if [ "$build" != "$seen" ]; then
    echo "The $env service runs ${build:-nothing the site can name (HTTP $code)}; waiting for a release that includes $needed."
    seen="$build"
  fi

  run="$(deploying_run)"
  if [ -n "$run" ]; then
    url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$run"
    state="$(gh run view "$run" --json status,conclusion,jobs \
      --jq "\"\(.status) \(.conclusion) \" + ([.jobs[] | select(.name == \"$env\") | \"\(.status)/\(.conclusion)\"] | join(\",\"))")"
    read -r run_status run_conclusion job_state <<<"$state"
    if [ "$run_status" = completed ]; then
      if [ "$job_state" = completed/success ]; then
        echo "::error::The service deploy that includes $needed deployed $env ($url), but the service now runs ${build:-something else}: it changed since, such as a rollback. Deploy the service to $env again (run Dictionary API deploy by hand), then this."
      else
        echo "::error::The service deploy that includes $needed ended ($run_conclusion) without deploying $env (its $env job: ${job_state:-none}), so its site isn't deployed either. Deploy the service to $env (run Dictionary API deploy by hand), then this: $url"
      fi
      exit 1
    fi
  fi
  sleep "$poll_seconds"
done
echo "::error::After an hour, the $env service still runs ${build:-nothing the site can name}, not a release that includes $needed: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/workflows/$workflow"
exit 1
