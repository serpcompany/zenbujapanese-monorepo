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

no_placeholder=3
written=0
SITE="$env" ORIGIN="$url" NO_PLACEHOLDER="$no_placeholder" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs"
  const { SITE, ORIGIN, NO_PLACEHOLDER } = process.env
  const config = readFileSync("wrangler.jsonc", "utf8")
  const site = "(\"SITE_ENV\":\\s*\"" + SITE + "\",\\s*)"
  const placeholder = new RegExp(site + "\"DICTIONARY_API_URL\":\\s*\"DICTIONARY_API_URL\"")
  if (!placeholder.test(config)) process.exit(Number(NO_PLACEHOLDER))
  const service = "\"DICTIONARY_API_URL\": " + JSON.stringify(ORIGIN)
  writeFileSync("wrangler.jsonc", config.replace(placeholder, (_, before) => before + service))
' || written=$?
case "$written" in
  0) ;;
  "$no_placeholder")
    echo "::error::wrangler.jsonc has no DICTIONARY_API_URL placeholder for $env"
    exit 1
    ;;
  *)
    echo "::error::Couldn't write $env's DICTIONARY_API_URL into wrangler.jsonc: node exited $written, with the error above"
    exit 1
    ;;
esac
grep -qF "\"DICTIONARY_API_URL\": \"$url\"" wrangler.jsonc
