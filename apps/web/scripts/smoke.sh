#!/usr/bin/env bash
# Checks a deployed website: key pages respond, /privacy still redirects for the iOS app, and
# search-engine rules match the environment (only production may be indexed). Requests carry the
# smoke-test header so a workers.dev URL serves the site instead of redirecting to the domain.
set -euo pipefail

base="${1:?usage: smoke.sh <base-url> <staging|production>}"
env="${2:?usage: smoke.sh <base-url> <staging|production>}"
failed=0
smoke=(-H 'x-zenbu-smoke-test: 1')
case "$env" in
  production) canonical=https://zenbujapanese.com ;;
  *) canonical=https://staging.zenbujapanese.com ;;
esac

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; failed=1; }

expect() {
  local path="$1" want="$2" got
  for _ in 1 2 3 4 5; do
    got="$(curl -s "${smoke[@]}" -o /dev/null -w '%{http_code}' "$base$path")"
    [ "$got" = "$want" ] && break
    sleep 3
  done
  if [ "$got" = "$want" ]; then pass "$got $path"; else fail "$got $path (want $want)"; fi
}

expect_redirect() {
  local path="$1" want="$2" got
  got="$(curl -s "${smoke[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$base$path")"
  if [ "$got" = "308 $base$want" ]; then pass "308 $path -> $want"; else fail "$path gave '$got' (want 308 -> $want)"; fi
}

for path in / /support/ /legal/privacy/ /sitemap-index.xml /sitemaps/pages.xml /robots.txt; do
  expect "$path" 200
done
# SERP trailing-slash standard: pages end in a slash, files never do. The other form redirects.
expect_redirect /support /support/
expect_redirect /robots.txt/ /robots.txt
expect_redirect /sitemaps/pages.xml/ /sitemaps/pages.xml

# Sitemaps list only canonical URLs: child sitemaps are unslashed files, pages end in a slash.
index_locs="$(curl -s "${smoke[@]}" "$base/sitemap-index.xml" | grep -oE '<loc>[^<]+</loc>' || true)"
page_locs="$(curl -s "${smoke[@]}" "$base/sitemaps/pages.xml" | grep -oE '<loc>[^<]+</loc>' || true)"
if [ -n "$index_locs" ] && ! grep -vqE '\.xml</loc>$' <<<"$index_locs"; then
  pass 'sitemap index lists unslashed .xml files'
else
  fail 'sitemap index has a non-canonical URL'
fi
if [ -n "$page_locs" ] && ! grep -vqE '/</loc>$' <<<"$page_locs"; then
  pass 'pages sitemap lists slashed page URLs'
else
  fail 'pages sitemap has a non-canonical URL'
fi
# The shipped iOS app links to /privacy.
expect /privacy 308

robots="$(curl -s "${smoke[@]}" "$base/robots.txt")"
robots_header="$(curl -sI "${smoke[@]}" "$base/" | tr -d '\r' | grep -i '^x-robots-tag:' || true)"

if [ "$env" = production ]; then
  grep -q '^Allow: /$' <<<"$robots" && pass 'robots.txt allows crawling' || fail 'robots.txt does not allow crawling'
  grep -q '^Sitemap: https://zenbujapanese.com/sitemap-index.xml$' <<<"$robots" &&
    pass 'robots.txt lists the sitemap index' || fail 'robots.txt is missing the sitemap index'
  [ -z "$robots_header" ] && pass 'no X-Robots-Tag' || fail "unexpected $robots_header"
else
  grep -q '^Disallow: /$' <<<"$robots" && pass 'robots.txt disallows crawling' || fail 'robots.txt allows crawling'
  grep -qi 'noindex' <<<"$robots_header" && pass 'X-Robots-Tag noindex' || fail 'missing X-Robots-Tag noindex'
fi

# Without the smoke-test header, a workers.dev URL redirects to the branded domain.
if [[ "$base" == *.workers.dev ]]; then
  got="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$base/legal/terms/")"
  if [ "$got" = "308 $canonical/legal/terms/" ]; then
    pass "workers.dev redirects to $canonical"
  else
    fail "workers.dev gave '$got' (want 308 -> $canonical/legal/terms/)"
  fi
fi

exit "$failed"
