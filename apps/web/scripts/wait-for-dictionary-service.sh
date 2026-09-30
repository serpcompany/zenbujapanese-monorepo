#!/usr/bin/env bash
# Waits, before `Web deploy` deploys an environment, for the same commit's `Dictionary API deploy`
# run to have signed and tagged that environment's image, so a site doesn't go out ahead of the
# service it reads (docs/agents/dictionary-api.md, Ship it). The server's deployer swaps the image
# in within about 5 minutes of that; nothing in CI can confirm when, since Bot Fight Mode on the
# zone challenges CI runners. A commit that doesn't change the service has no such run, and nothing
# to wait for. A service deploy that failed, skipped this environment, or was cancelled stops the
# site's deploy too.
#
#   scripts/wait-for-dictionary-service.sh <staging|production>
#
# Needs GH_TOKEN, with read access to the repository's Actions.
set -euo pipefail

env="${1:?usage: wait-for-dictionary-service.sh <staging|production>}"
sha="${GITHUB_SHA:?}"
workflow=dictionary-api-deploy.yml

# The service's run, if the commit has one: the push that started this run started it too, so give
# it a moment to appear. A pull request's run only builds and checks the image, so it doesn't count.
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
# The run builds and checks the image, then signs and tags it: a few minutes.
deadline=$((SECONDS + 1200))
while [ "$SECONDS" -lt "$deadline" ]; do
  job="$(gh run view "$run" --json jobs \
    --jq ".jobs[] | select(.name == \"$env\") | \"\(.status) \(.conclusion)\"")"
  # A run that ended without the job never deployed this environment, such as one cancelled while
  # it waited in the concurrency queue.
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
  # Not started, or still running: its job may not exist yet either.
  sleep 30
done
echo "::error::The dictionary service's $env deploy for $sha hasn't finished after 20 minutes: $url"
exit 1
