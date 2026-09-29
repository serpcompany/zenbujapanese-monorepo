#!/usr/bin/env bash
# Points a deployed environment at its dictionary service (ADR 0009), before `Web deploy` deploys
# it: checks the service's URL is an HTTPS origin, that the Worker holds the DICTIONARY_API_TOKEN
# secret the service expects, and that the service is up, then writes the URL over the
# environment's DICTIONARY_API_URL placeholder in wrangler.jsonc.
#
#   scripts/use-dictionary-service.sh <staging|production> <https://service-origin>
set -euo pipefail

env="${1:?usage: use-dictionary-service.sh <staging|production> <url>}"
url="${2:-}"
url="${url%/}"
case "$env" in staging | production) ;; *) echo "::error::Unknown environment $env"; exit 1 ;; esac

# The site asks for /v1/... from this origin (src/lib/dictionary/api.ts), so a path would be lost.
if ! [[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "::error::The $env GitHub environment's DICTIONARY_API_URL variable must be the service's HTTPS origin, such as https://dictionary.example.com; it is '${url}'"
  exit 1
fi

# Read whole: `wrangler | grep -q` fails under pipefail when grep exits early.
secrets="$(pnpm exec wrangler secret list --env "$env" --format json)"
if ! grep -q '"DICTIONARY_API_TOKEN"' <<<"$secrets"; then
  echo "::error::The $env Worker has no DICTIONARY_API_TOKEN secret: set it to the service's token with 'pnpm exec wrangler secret put DICTIONARY_API_TOKEN --env $env' (docs/agents/web.md)"
  exit 1
fi

# /healthz needs no token and names the build the service answers with.
health="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$url/healthz")" || {
  echo "::error::The dictionary service at $url isn't answering /healthz"
  exit 1
}
echo "Dictionary service: $health"

placeholder="\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"DICTIONARY_API_URL\""
grep -qF "$placeholder" wrangler.jsonc || {
  echo "::error::wrangler.jsonc has no DICTIONARY_API_URL placeholder for $env"
  exit 1
}
sed -i "s|\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"DICTIONARY_API_URL\"|\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"$url\"|" wrangler.jsonc
grep -qF "\"SITE_ENV\": \"$env\", \"DICTIONARY_API_URL\": \"$url\"" wrangler.jsonc
