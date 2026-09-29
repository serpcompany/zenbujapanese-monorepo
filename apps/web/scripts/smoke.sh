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
# previous Worker version. eventually <pass message> <fail message> <check function> [detail
# function], where the detail function prints what the last, failed check saw.
eventually() {
  local ok="$1" bad="$2" check="$3" detail="${4:-}"
  for _ in 1 2 3 4 5; do
    "$check" && { pass "$ok"; return; }
    sleep 3
  done
  fail "$bad${detail:+: $("$detail")}"
}

# The response body, fetched whole: `curl | grep -q` fails under pipefail when grep exits early.
body() { curl -s "${smoke[@]}" "$base$1"; }

expect_redirect() {
  local path="$1" want="$2" got
  for _ in 1 2 3 4 5; do
    got="$(curl -s "${smoke[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$base$path")"
    [ "$got" = "308 $base$want" ] && break
    sleep 3
  done
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
index_lists_files() {
  local locs
  locs="$(body /sitemap-index.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  [ -n "$locs" ] && ! grep -vqE '\.xml</loc>$' <<<"$locs"
}
eventually 'sitemap index lists unslashed .xml files' 'sitemap index has a non-canonical URL' \
  index_lists_files
pages_list_pages() {
  local locs
  locs="$(body /sitemaps/pages.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  [ -n "$locs" ] && ! grep -vqE '/</loc>$' <<<"$locs"
}
eventually 'pages sitemap lists slashed page URLs' 'pages sitemap has a non-canonical URL' \
  pages_list_pages
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
header_has_dictionary() {
  local home
  home="$(body /)"
  grep -q 'href="/dictionary/"' <<<"$home" && grep -q '<search' <<<"$home"
}
eventually 'the header links to the dictionary and has search' \
  'the header is missing the Dictionary link or search' header_has_dictionary
# Search results show what the app shows: the iru case of the app-recorded suite, read at run time
# so a re-recorded suite (which the search import's gate checks) never leaves this check stale.
# For iru, that's the "Search for「いる」" refinement, then the first rows' entry numbers and chips,
# in order.
iru=/dictionary/search/iru/
suite="$(dirname "$0")/../../ios/LanguageData/Conformance/search-results.json"
expect "$iru" 200
# The iru case: the refinement's query, its search path, then "<entry number> <chips>" per row.
iru_expected="$(python3 -c '
import json, sys, urllib.parse
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "iru")
query = case["readingRefinement"]["query"]
print(query)
print("/dictionary/search/%s/" % urllib.parse.quote(query, safe=""))
for row in case["results"][:7]:
    print(" ".join([row["entSeq"][0]] + ["%s %s" % (c["name"], c["text"]) for c in row["chips"]]))
' "$suite")"
iru_refinement="$(sed -n 1p <<<"$iru_expected")"
iru_refinement_path="$(sed -n 2p <<<"$iru_expected")"
iru_rows="$(sed -n '3,$p' <<<"$iru_expected")"
# A page's first result rows as "<entry number> <chips>", from each row's marker to the next, tags
# removed.
result_rows() {
  awk 'BEGIN { RS = "data-result-row=\"" } NR > 1 {
      gsub(/<span class="sr-only">[^<]*<\/span>/, "")
      gsub(/<[^>]*>/, " ")
      entry = $0; sub(/".*/, "", entry)
      chips = ""
      rest = $0
      while (match(rest, /(JLPT|YouTube) +[^ ]+/)) {
        chip = substr(rest, RSTART, RLENGTH); gsub(/ +/, " ", chip)
        chips = chips " " chip
        rest = substr(rest, RSTART + RLENGTH)
      }
      print entry chips
    }' | head -n 7
}
# What the last fetch of iru showed, for the failure message.
iru_seen=""
iru_matches_the_app() {
  local html refinement=no
  html="$(body "$iru")"
  grep -q "Search for「<span lang=\"ja\">$iru_refinement</span>」" <<<"$html" &&
    grep -q "href=\"$iru_refinement_path\"" <<<"$html" && refinement=yes
  iru_seen="refinement $refinement; rows $(result_rows <<<"$html" | paste -sd, -)"
  [ "$refinement" = yes ] && [ "$(result_rows <<<"$html")" = "$iru_rows" ]
}
show_iru_seen() { echo "$iru_seen (want refinement yes; rows $(paste -sd, - <<<"$iru_rows"))"; }
eventually 'iru shows the refinement and its first rows with their chips, as the app does' \
  'iru differs from the app' iru_matches_the_app show_iru_seen

# The footer links Legal, as the #462 design's footer does.
footer_has_legal() {
  grep -qE '<footer[^>]*>.*href="/legal/"[^>]*>Legal</a>' <<<"$(body / | tr -d '\n')"
}
eventually 'the footer links Legal' 'the footer is missing the Legal link' footer_has_legal

# Word pages draw what the app draws, read from the app-recorded word-detail suite at run time:
# 学校's kanji each highlight their own part of the furigana (がっ・こう), 見る's pitch graph puts
# each dot where the app does, and each Frequency row opens its details.
gakkou=/dictionary/%E5%AD%A6%E6%A0%A1-1206730/
word_suite="$(dirname "$0")/../../ios/LanguageData/Conformance/word-detail.json"
expect "$gakkou" 200
# 学校's split, joined with ・; 見る's dots' x positions, the particle's last; its dictionaries.
word_expected="$(python3 -c '
import json, sys
cases = {c["entSeq"][0]: c for c in json.load(open(sys.argv[1]))["cases"]}
print("・".join(cases["1206730"]["furigana"][0]["kanjiReadings"]))
graph = cases["1259290"]["pitch"]["graph"]
print(" ".join(str(p["x"]) for p in graph["points"] + [graph["particle"]]))
print(" ".join(row["name"] for row in cases["1259290"]["frequency"]))
' "$word_suite")"
gakkou_split="$(sed -n 1p <<<"$word_expected")"
miru_dots="$(sed -n 2p <<<"$word_expected")"
miru_rows="$(sed -n 3p <<<"$word_expected")"
highlights_kanji() { grep -q "data-kanji-split=\"$gakkou_split\"" <<<"$(body "$gakkou")"; }
eventually "学校's kanji each highlight their part of the furigana ($gakkou_split)" \
  "学校 has no per-kanji highlight of $gakkou_split" highlights_kanji
# The page's dots' cx values in order, and the Frequency rows that open details.
miru_seen=""
draws_like_the_app() {
  local html dots rows
  html="$(body "$word")"
  # Only the pitch graph's circles: icons elsewhere on the page draw circles too.
  dots="$(tr -d '\n' <<<"$html" | grep -oE 'data-pitch-graph[^>]*>.*</svg>' | sed 's|</svg>.*||' |
    grep -oE '<circle[^>]* cx="[0-9]+"' | grep -oE 'cx="[0-9]+"' | tr -dc '0-9\n' |
    paste -sd' ' -)"
  rows="$(grep -oE 'aria-haspopup="dialog" aria-label="[^"]*" data-frequency-row="[^"]+"' <<<"$html" |
    sed -E 's/.*data-frequency-row="([^"]+)"/\1/' | paste -sd' ' -)"
  miru_seen="dots $dots; rows $rows"
  [ "$dots" = "$miru_dots" ] && [ "$rows" = "$miru_rows" ] &&
    grep -q '<circle data-particle' <<<"$html"
}
show_miru_seen() { echo "$miru_seen (want dots $miru_dots; rows $miru_rows)"; }
eventually "見る's pitch graph and Frequency rows match the app" \
  "見る's pitch graph or Frequency rows differ from the app" draws_like_the_app show_miru_seen
# The part-of-speech row opens a conjugation table exactly where the app's does: 見る's does, and
# 学校's (a noun) doesn't.
opens_expected="$(python3 -c '
import json, sys
cases = {c["entSeq"][0]: c for c in json.load(open(sys.argv[1]))["cases"]}
print(" ".join("yes" if cases[n]["opensConjugations"] else "no" for n in ("1259290", "1206730")))
' "$word_suite")"
opens_seen=""
opens_like_the_app() {
  local path opens=()
  for path in "$word" "$gakkou"; do
    if grep -q 'data-opens-conjugations' <<<"$(body "$path")"; then opens+=(yes); else opens+=(no); fi
  done
  opens_seen="${opens[*]}"
  [ "$opens_seen" = "$opens_expected" ]
}
show_opens_seen() { echo "見る, 学校 open conjugations: $opens_seen (want $opens_expected)"; }
eventually "the part of speech opens conjugations where the app's does ($opens_expected)" \
  'the part of speech opens conjugations where the app does not' opens_like_the_app show_opens_seen

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
word_count=0
word_sitemap_is_canonical() {
  local locs
  locs="$(body /sitemaps/dictionary/1.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  word_count="$(grep -c . <<<"$locs" || true)"
  [ "$word_count" -ge 1 ] && [ "$word_count" -le 50000 ] &&
    ! LC_ALL=C grep -vqE '^<loc>https://zenbujapanese\.com/dictionary/[!-~]+-[0-9]+/</loc>$' <<<"$locs"
}
eventually 'word sitemap lists 1 to 50,000 canonical URLs' \
  'word sitemap has no URLs, more than 50,000, or a non-canonical one' word_sitemap_is_canonical
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
noindex_follows_meanings() {
  grep -q "$noindex" <<<"$(body /dictionary/kanji/%E3%90%82/)" &&
    ! grep -q "$noindex" <<<"$(body "$kanji")"
}
eventually 'a kanji without meanings or readings is noindex' 'noindex is wrong on 㐂 or 見' \
  noindex_follows_meanings

# The X-Robots-Tag header a path sends, if any.
robots_tag() { curl -sI "${smoke[@]}" "$base$1" | tr -d '\r' | grep -i '^x-robots-tag:' || true; }
robots() { body /robots.txt; }

if [ "$env" = production ]; then
  # Production's dictionary is indexable: its pages send no X-Robots-Tag, like the rest of the site.
  for path in / "$word" "$kanji" /sitemaps/kanji.xml; do
    has_no_robots_tag() { [ -z "$(robots_tag "$path")" ]; }
    eventually "no X-Robots-Tag on $path" "unexpected X-Robots-Tag on $path" has_no_robots_tag
  done
  allows_crawling() { grep -q '^Allow: /$' <<<"$(robots)"; }
  eventually 'robots.txt allows crawling' 'robots.txt does not allow crawling' allows_crawling
  lists_index() { grep -q '^Sitemap: https://zenbujapanese.com/sitemap-index.xml$' <<<"$(robots)"; }
  eventually 'robots.txt lists the sitemap index' 'robots.txt is missing the sitemap index' lists_index
else
  disallows_crawling() { grep -q '^Disallow: /$' <<<"$(robots)"; }
  eventually 'robots.txt disallows crawling' 'robots.txt allows crawling' disallows_crawling
  sends_noindex() { grep -qi 'noindex' <<<"$(robots_tag /)"; }
  eventually 'X-Robots-Tag noindex' 'missing X-Robots-Tag noindex' sends_noindex
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
