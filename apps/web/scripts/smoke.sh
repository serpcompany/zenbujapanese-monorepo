#!/usr/bin/env bash
# Checks a deployed website: key pages respond, /privacy still redirects for the iOS app, and
# search-engine rules match the environment (only production may be indexed).
set -euo pipefail

base="${1:?usage: smoke.sh <base-url> <staging|production>}"
env="${2:?usage: smoke.sh <base-url> <staging|production>}"
failed=0

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; failed=1; }

expect() {
  local path="$1" want="$2" got
  for _ in 1 2 3 4 5; do
    got="$(curl -s -o /dev/null -w '%{http_code}' "$base$path")"
    [ "$got" = "$want" ] && break
    sleep 3
  done
  if [ "$got" = "$want" ]; then pass "$got $path"; else fail "$got $path (want $want)"; fi
}

for path in / /support /legal/privacy /sitemap-index.xml /sitemaps/pages.xml /robots.txt; do
  expect "$path" 200
done
expect /privacy 308

robots="$(curl -s "$base/robots.txt")"
robots_header="$(curl -sI "$base/" | tr -d '\r' | grep -i '^x-robots-tag:' || true)"

if [ "$env" = production ]; then
  grep -q '^Allow: /$' <<<"$robots" && pass 'robots.txt allows crawling' || fail 'robots.txt does not allow crawling'
  grep -q '^Sitemap: https://zenbujapanese.com/sitemap-index.xml$' <<<"$robots" &&
    pass 'robots.txt lists the sitemap index' || fail 'robots.txt is missing the sitemap index'
  [ -z "$robots_header" ] && pass 'no X-Robots-Tag' || fail "unexpected $robots_header"
else
  grep -q '^Disallow: /$' <<<"$robots" && pass 'robots.txt disallows crawling' || fail 'robots.txt allows crawling'
  grep -qi 'noindex' <<<"$robots_header" && pass 'X-Robots-Tag noindex' || fail 'missing X-Robots-Tag noindex'
fi

exit "$failed"
