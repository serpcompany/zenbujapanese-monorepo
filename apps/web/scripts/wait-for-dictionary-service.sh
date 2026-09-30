#!/usr/bin/env bash
set -euo pipefail

env="${1:?usage: wait-for-dictionary-service.sh <staging|production>}"
sha="${GITHUB_SHA:?}"
workflow=dictionary-api-deploy.yml

run=""
for _ in 1 2 3 4 5 6; do
  run="$(gh run list --workflow "$workflow" --commit "$sha" --limit 20 --json databaseId,event \
    --jq '[.[] | select(.event != "pull_request")][0].databaseId // empty')"
  [ -n "$run" ] && break
  sleep 10
done
if [ -z "$run" ]; then
  echo "No dictionary service deploy for $sha: nothing to wait for."
  exit 0
fi

url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$run"
echo "Waiting for the dictionary service's $env deploy: $url"
deadline=$((SECONDS + 1200))
while [ "$SECONDS" -lt "$deadline" ]; do
  job="$(gh run view "$run" --json jobs \
    --jq ".jobs[] | select(.name == \"$env\") | \"\(.status) \(.conclusion)\"")"
  if [ -z "$job" ]; then
    run_state="$(gh run view "$run" --json status,conclusion --jq '"\(.status) \(.conclusion)"')"
    if [ "${run_state%% *}" = completed ]; then
      echo "::error::The dictionary service's run for $sha ended ($run_state) without a $env job, so its site isn't deployed either. Run Dictionary API deploy by hand, then this: $url"
      exit 1
    fi
  fi
  case "$job" in
    "completed success")
      echo "The dictionary service's $env deploy succeeded."
      exit 0
      ;;
    "completed skipped")
      echo "::error::The dictionary service's run for $sha skipped $env, so its site isn't deployed either. Deploy the service to $env first (run Dictionary API deploy by hand), then this: $url"
      exit 1
      ;;
    completed*)
      echo "::error::The dictionary service's $env deploy for $sha didn't succeed ($job), so its site isn't deployed: $url"
      exit 1
      ;;
  esac
  sleep 30
done
echo "::error::The dictionary service's $env deploy for $sha hasn't finished after 20 minutes: $url"
exit 1
