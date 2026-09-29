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

# Content checks retry like expect: for a few seconds after a deploy, some requests still reach the
# previous Worker version. eventually <pass message> <fail message> <check function>
eventually() {
  local ok="$1" bad="$2" check="$3"
  for _ in 1 2 3 4 5; do
    "$check" && { pass "$ok"; return; }
    sleep 3
  done
  fail "$bad"
}

# The response body, fetched whole: `curl | grep -q` fails under pipefail when grep exits early.
body() { curl -s "${smoke[@]}" "$base$1"; }

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

# Dictionary pages: each environment reads its own release databases (SEARCH_DB and
# DICTIONARY_DB), so a word and a kanji without local fixtures (見る, 見) have pages.
word=/dictionary/%E8%A6%8B%E3%82%8B-1259290/
kanji=/dictionary/kanji/%E8%A6%8B/
expect /dictionary/ 200
expect "$word" 200
expect "$kanji" 200
# Every page links to the dictionary and has the header search.
if grep -q 'href="/dictionary/"' <<<"$(body /)" && grep -q '<search' <<<"$(body /)"; then
  pass 'the header links to the dictionary and has search'
else
  fail 'the header is missing the Dictionary link or search'
fi
# A stale or missing slug redirects to the word's one URL; an unknown number doesn't exist.
expect_redirect /dictionary/1259290/ "$word"
expect /dictionary/999999999/ 404

# Both sitemap indexes list the word and kanji sitemaps (ADR 0007): /sitemap.xml serves the same
# index, and neither may be a copy frozen at build time.
lists_release_sitemaps() {
  local locs
  locs="$(body "$index" | grep -oE '<loc>[^<]+</loc>' || true)"
  grep -q '<loc>https://zenbujapanese.com/sitemaps/dictionary/1.xml</loc>' <<<"$locs" &&
    grep -q '<loc>https://zenbujapanese.com/sitemaps/kanji.xml</loc>' <<<"$locs"
}
for index in /sitemap-index.xml /sitemap.xml; do
  eventually "$index lists the dictionary and kanji sitemaps" \
    "$index is missing the dictionary or kanji sitemap" lists_release_sitemaps
done
# A word sitemap holds 1 to 50,000 canonical word URLs, percent-encoded (ASCII only).
expect /sitemaps/dictionary/1.xml 200
word_locs="$(curl -s "${smoke[@]}" "$base/sitemaps/dictionary/1.xml" | grep -oE '<loc>[^<]+</loc>' || true)"
word_count="$(grep -c . <<<"$word_locs" || true)"
if [ "$word_count" -ge 1 ] && [ "$word_count" -le 50000 ] &&
  ! LC_ALL=C grep -vqE '^<loc>https://zenbujapanese\.com/dictionary/[!-~]+-[0-9]+/</loc>$' <<<"$word_locs"; then
  pass "word sitemap lists $word_count canonical URLs"
else
  fail "word sitemap has $word_count URLs or a non-canonical one"
fi
# The kanji sitemap lists indexable kanji only: 見, but not 㐂, which has no meanings or readings.
lists_indexable_kanji() {
  local kanji_sitemap
  kanji_sitemap="$(body /sitemaps/kanji.xml)"
  grep -q "<loc>https://zenbujapanese.com$kanji</loc>" <<<"$kanji_sitemap" &&
    ! grep -q '/dictionary/kanji/%E3%90%82/' <<<"$kanji_sitemap"
}
eventually 'kanji sitemap lists indexable kanji only' 'kanji sitemap is missing 見 or lists 㐂' \
  lists_indexable_kanji
# 㐂's page is noindex on its own, not only through staging's X-Robots-Tag; 見's isn't.
noindex='<meta name="robots" content="noindex'
if grep -q "$noindex" <<<"$(body /dictionary/kanji/%E3%90%82/)" &&
  ! grep -q "$noindex" <<<"$(body "$kanji")"; then
  pass 'a kanji without meanings or readings is noindex'
else
  fail 'noindex is wrong on 㐂 or 見'
fi
# Production's dictionary is indexable: its pages send no X-Robots-Tag (staging's all send noindex,
# checked below for /).
if [ "$env" = production ]; then
  for path in "$word" "$kanji" /sitemaps/kanji.xml; do
    header="$(curl -sI "${smoke[@]}" "$base$path" | tr -d '\r' | grep -i '^x-robots-tag:' || true)"
    [ -z "$header" ] && pass "no X-Robots-Tag on $path" || fail "unexpected $header on $path"
  done
fi

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
  # Retry: a new deploy can take a few seconds to replace the previous version at the edge.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    got="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$base/legal/terms/")"
    [ "$got" = "308 $canonical/legal/terms/" ] && break
    sleep 3
  done
  if [ "$got" = "308 $canonical/legal/terms/" ]; then
    pass "workers.dev redirects to $canonical"
  else
    fail "workers.dev gave '$got' (want 308 -> $canonical/legal/terms/)"
  fi
fi

exit "$failed"
