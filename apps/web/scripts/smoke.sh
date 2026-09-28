#!/usr/bin/env bash
# Checks a deployed website: key pages respond and /privacy still redirects for the iOS app.
set -euo pipefail

base="${1:?usage: smoke.sh <base-url>}"
failed=0

expect() {
  local path="$1" want="$2" got
  for _ in 1 2 3 4 5; do
    got="$(curl -s -o /dev/null -w '%{http_code}' "$base$path")"
    [ "$got" = "$want" ] && break
    sleep 3
  done
  if [ "$got" = "$want" ]; then echo "ok   $got $path"; else echo "FAIL $got $path (want $want)"; failed=1; fi
}

for path in / /support /legal/privacy /sitemap-index.xml /sitemaps/pages.xml /robots.txt; do
  expect "$path" 200
done
expect /privacy 308

exit "$failed"
