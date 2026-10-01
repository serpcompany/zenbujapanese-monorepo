#!/usr/bin/env bash
set -euo pipefail

env="${1:?usage: use-dictionary-service.sh <staging|production> <url>}"
url="${2:-}"
url="${url%/}"
case "$env" in staging | production) ;; *) echo "::error::Unknown environment $env"; exit 1 ;; esac

if ! [[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "::error::The $env GitHub environment's DICTIONARY_API_URL variable must be the service's HTTPS origin, such as https://dictionary.example.com; it is '${url}'"
  exit 1
fi

secrets="$(pnpm exec wrangler secret list --env "$env" --format json)"
if ! grep -q '"DICTIONARY_API_TOKEN"' <<<"$secrets"; then
  echo "::error::The $env Worker has no DICTIONARY_API_TOKEN secret: set it to the service's token with 'pnpm exec wrangler secret put DICTIONARY_API_TOKEN --env $env' (docs/agents/web.md)"
  exit 1
fi

placeholder="\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"DICTIONARY_API_URL\""
grep -qF "$placeholder" wrangler.jsonc || {
  echo "::error::wrangler.jsonc has no DICTIONARY_API_URL placeholder for $env"
  exit 1
}
sed -i "s|\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"DICTIONARY_API_URL\"|\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"$url\"|" wrangler.jsonc
grep -qF "\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"$url\"" wrangler.jsonc
