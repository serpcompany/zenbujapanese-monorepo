#!/usr/bin/env bash
set -euo pipefail

env="${1:?usage: write-dictionary-sitemaps.sh <staging|production>}"
case "$env" in staging | production) ;; *) echo "::error::Unknown environment $env"; exit 1 ;; esac

image="ghcr.io/serpcompany/zenbujapanese-dictionary-api:$env"
container=zenbujapanese-sitemaps
port=8788
token="$(openssl rand -hex 24)"

stop() { docker rm --force "$container" >/dev/null 2>&1 || true; }
trap stop EXIT

docker pull --quiet "$image"
docker run --detach --name "$container" --publish "127.0.0.1:$port:8788" \
  --env DICTIONARY_API_TOKEN="$token" --env DICTIONARY_API_WORKERS=2 "$image" >/dev/null
if ! curl -fsS --retry 60 --retry-delay 2 --retry-connrefused --retry-all-errors \
  "http://127.0.0.1:$port/healthz" >health.json; then
  echo "::error::$image didn't start, so the dictionary's sitemaps weren't written"
  docker logs "$container" || true
  exit 1
fi
echo "Writing the dictionary's sitemaps from $image, which answers as $(jq -r .build health.json)"
rm -f health.json

SITE_ENV="$env" DICTIONARY_API_URL="http://127.0.0.1:$port" DICTIONARY_API_TOKEN="$token" pnpm sitemaps
