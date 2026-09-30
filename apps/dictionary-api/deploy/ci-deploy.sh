#!/usr/bin/env bash
# Deploys an image of the dictionary service to one environment, from the `Dictionary API deploy`
# workflow: runs host-deploy.sh on the environment's server over SSH, then checks that the
# environment's public URL answers with the new build. Writes `deployed=true` to the step's
# outputs once it does.
#
#   ci-deploy.sh <staging|production> <image@sha256:digest> <build>
#
# The environment's GitHub settings (docs/agents/dictionary-api.md, Ship it): the variables
# DICTIONARY_API_URL, DICTIONARY_API_SSH_HOST, DICTIONARY_API_SSH_KNOWN_HOSTS, and optionally
# DICTIONARY_API_SSH_USER (deploy) and DICTIONARY_API_SSH_PORT (22), and the DICTIONARY_API_SSH_KEY
# secret. An environment without a server yet (no DICTIONARY_API_SSH_HOST) is skipped with a
# warning.
set -euo pipefail

env="${1:?usage: ci-deploy.sh <staging|production> <image> <build>}"
image="${2:?usage: ci-deploy.sh <staging|production> <image> <build>}"
build="${3:?usage: ci-deploy.sh <staging|production> <image> <build>}"
output="${GITHUB_OUTPUT:-/dev/null}"

if [ -z "${DICTIONARY_API_SSH_HOST:-}" ]; then
  echo "::warning::The $env GitHub environment has no DICTIONARY_API_SSH_HOST variable, so $image isn't deployed there yet (docs/agents/dictionary-api.md, Ship it)"
  exit 0
fi
for setting in DICTIONARY_API_URL DICTIONARY_API_SSH_KNOWN_HOSTS DICTIONARY_API_SSH_KEY; do
  if [ -z "${!setting:-}" ]; then
    echo "::error::The $env GitHub environment has DICTIONARY_API_SSH_HOST but no $setting (docs/agents/dictionary-api.md, Ship it)"
    exit 1
  fi
done

# The key and the server's pinned host keys, readable only by this job.
ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
(
  umask 077
  printf '%s\n' "$DICTIONARY_API_SSH_KEY" >"$ssh_dir/key"
  printf '%s\n' "$DICTIONARY_API_SSH_KNOWN_HOSTS" >"$ssh_dir/known_hosts"
)
# The deploy user's key runs only host-deploy.sh, which reads the request from the command.
ssh -i "$ssh_dir/key" -p "${DICTIONARY_API_SSH_PORT:-22}" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$ssh_dir/known_hosts" -o ConnectTimeout=20 \
  "${DICTIONARY_API_SSH_USER:-deploy}@$DICTIONARY_API_SSH_HOST" "deploy $image"

# The proxy moves to the new slot within a few seconds of the old one stopping.
url="${DICTIONARY_API_URL%/}"
seen=""
for _ in $(seq 1 30); do
  seen="$(curl -fsS --max-time 10 "$url/healthz" | jq -r .build 2>/dev/null || true)"
  if [ "$seen" = "$build" ]; then
    echo "$env answers with $build"
    echo "deployed=true" >>"$output"
    exit 0
  fi
  sleep 2
done
echo "::error::$url/healthz answers with build '${seen:-nothing}', not $build"
exit 1
