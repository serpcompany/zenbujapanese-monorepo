#!/usr/bin/env bash
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

eventually() {
  local pass_message="$1" fail_message="$2" check="$3" describe_last_seen="${4:-}"
  for _ in 1 2 3 4 5; do
    "$check" && { pass "$pass_message"; return; }
    sleep 3
  done
  fail "$fail_message${describe_last_seen:+: $("$describe_last_seen")}"
}

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

for path in / /support/ /legal/privacy/ /sitemaps/pages.xml /robots.txt; do
  expect "$path" 200
done
expect_redirect /support /support/
expect_redirect /robots.txt/ /robots.txt
expect_redirect /sitemaps/pages.xml/ /sitemaps/pages.xml

pages_list_pages() {
  local locs
  locs="$(body /sitemaps/pages.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  [ -n "$locs" ] && ! grep -vqE '/</loc>$' <<<"$locs"
}
eventually 'pages sitemap lists slashed page URLs' 'pages sitemap has a non-canonical URL' \
  pages_list_pages
expect /privacy 308

header_has_dictionary() {
  local home
  home="$(body /)"
  grep -q 'href="/dictionary/"' <<<"$home" && grep -q '<search' <<<"$home"
}
eventually 'the header links to the dictionary and has search' \
  'the header is missing the Dictionary link or search' header_has_dictionary
footer_has_legal() {
  grep -qE '<footer[^>]*>.*href="/legal/"[^>]*>Legal</a>' <<<"$(body / | tr -d '\n')"
}
eventually 'the footer links Legal' 'the footer is missing the Legal link' footer_has_legal

word=/dictionary/%E8%A6%8B%E3%82%8B-1259290/
kanji=/dictionary/kanji/%E8%A6%8B/
conjugations="${word}conjugations/"
miru_examples=/dictionary/search/%E8%A6%8B%E3%82%8B/examples/

if grep -qE '"mitigated": *"challenge"' <<<"$(body /dictionary/service.json)"; then
  echo "::warning::Cloudflare's Bot Fight Mode challenges this machine's requests to the dictionary service, so the dictionary checks were skipped. Run apps/web/scripts/smoke.sh from a machine it doesn't challenge to check them."
else

service_seen=""
reaches_service() {
  service_seen="$(body /dictionary/service.json)"
  grep -q '"status":200' <<<"$service_seen"
}
show_service_seen() { echo "$service_seen"; }
eventually 'the site reaches its dictionary service' \
  "the site can't reach its dictionary service" reaches_service show_service_seen

expect /dictionary/ 200
expect "$word" 200
expect "$kanji" 200
iru=/dictionary/search/iru/
suite="$(dirname "$0")/../../ios/LanguageData/Conformance/search-results.json"
expect "$iru" 200
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

eat=/dictionary/search/eat/
eat_examples="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "eat")
print(case["examples"]["title"])
' "$suite")"
shows_examples_row() {
  local html
  html="$(body "$eat")"
  grep -q 'data-section="examples"' <<<"$html" && grep -qF "$eat_examples" <<<"$html" &&
    grep -q "href=\"${eat}examples/\"" <<<"$html"
}
eventually "eat leads with '$eat_examples', as the app does" \
  "eat has no '$eat_examples' row linked to its examples page" shows_examples_row
expect "${eat}examples/" 200

gakkou=/dictionary/%E5%AD%A6%E6%A0%A1-1206730/
word_suite="$(dirname "$0")/../../ios/LanguageData/Conformance/word-detail.json"
expect "$gakkou" 200
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
miru_seen=""
draws_like_the_app() {
  local html dots rows
  html="$(body "$word")"
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
miru_table='/dictionary/見る-1259290/conjugations/'
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
expect "$conjugations" 200
expect "${conjugations}plain/past/" 200
expect "${conjugations}polite/te-form/" 200
expect "${gakkou}conjugations/" 404
expect "${conjugations}plain/standalone/" 404
expect "${conjugations}formal/past/" 404
expect "${conjugations}plain/" 404
expect_redirect /dictionary/1259290/conjugations/plain/past/ "${conjugations}plain/past/"
conjugation_expected="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["entSeq"][0] == "1259290")
print(" ".join(form["kind"] for form in case["conjugations"]["plain"]))
past = next(form for form in case["conjugations"]["plain"] if form["kind"] == "past")
print(" ".join(i.removeprefix("esp1_") for i in past["examples"]["ids"][:25]))
empty = next(form["kind"] for form in case["conjugations"]["plain"] if not form["examples"]["ids"])
print(empty)
' "$word_suite")"
miru_kinds="$(sed -n 1p <<<"$conjugation_expected")"
miru_past_pairs="$(sed -n 2p <<<"$conjugation_expected")"
miru_empty_form="$(sed -n 3p <<<"$conjugation_expected")"
conjugations_seen=""
conjugations_like_the_app() {
  local table past kinds pairs
  table="$(body "$conjugations")"
  past="$(body "${conjugations}plain/past/")"
  kinds="$(grep -oE 'data-conjugation-row="[^"]+"' <<<"$table" | sed -E 's/.*="([^"]+)"/\1/' |
    paste -sd' ' -)"
  pairs="$(grep -oE 'data-example-pair="[^"]+"' <<<"$past" | sed -E 's/.*="([^"]+)"/\1/' |
    paste -sd' ' -)"
  conjugations_seen="forms $kinds; past's examples $pairs"
  [ "$kinds" = "$miru_kinds" ] && [ "$pairs" = "$miru_past_pairs" ] &&
    grep -q "href=\"${miru_table}plain/past/\"" <<<"$table" &&
    grep -q 'data-page-word="true"' <<<"$past"
}
show_conjugations_seen() {
  echo "$conjugations_seen (want forms $miru_kinds; past's examples $miru_past_pairs)"
}
eventually "見る's conjugations and its past's examples match the app" \
  "見る's conjugations or its past's examples differ from the app" conjugations_like_the_app \
  show_conjugations_seen
form_indexing_follows_examples() {
  grep -q "$noindex" <<<"$(body "${conjugations}plain/$miru_empty_form/")" &&
    ! grep -q "$noindex" <<<"$(body "${conjugations}plain/past/")" &&
    grep -q "<link rel=\"canonical\" href=\"[^\"]*${conjugations}plain/te-form/\"" \
      <<<"$(body "${conjugations}polite/te-form/")" &&
    grep -q "<link rel=\"canonical\" href=\"[^\"]*${conjugations}plain/potential/\"" \
      <<<"$(body "${conjugations}plain/passive/")"
}

iru_examples_title="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "iru")
print(case["examples"]["title"])
' "$suite")"
iru_has_examples_row() {
  local html
  html="$(body "$iru")"
  grep -q "<p class=\"font-semibold\">$iru_examples_title</p>" <<<"$html" &&
    grep -q 'href="/dictionary/search/iru/examples/"' <<<"$html"
}
eventually "iru shows \"$iru_examples_title\", as the app does" \
  'iru is missing the Example Sentences row' iru_has_examples_row

iru_all_rows="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "iru")
print(" ".join(row["entSeq"][0] for row in case["results"]))
' "$suite")"
iru_listed=""
iru_lists_as_the_app_does() {
  iru_listed="$(grep -oE 'data-result-row="[0-9]+"' <<<"$(body "$iru")" | grep -oE '[0-9]+' | paste -sd' ' -)"
  [ "$iru_listed" = "$iru_all_rows" ]
}
show_iru_listed() { echo "$(wc -w <<<"$iru_listed" | tr -d ' ') rows (want $(wc -w <<<"$iru_all_rows" | tr -d ' ') in the suite's order)"; }
eventually "iru lists all its words at once, in the app's order" \
  "iru's words differ from the app" iru_lists_as_the_app_does show_iru_listed

examples_suite="$(dirname "$0")/../../ios/LanguageData/Conformance/example-search.json"
expect /dictionary/search/qzxvkj/examples/ 404
expect '/dictionary/search/t*/examples/' 200
expect "$miru_examples" 200
miru_first_english="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "見る")
english = case["shown"][0]["english"]
for plain, react_escaped in (("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"), ("\"", "&quot;"), ("'"'"'", "&#x27;")):
    english = english.replace(plain, react_escaped)
print(english)
' "$examples_suite")"
miru_examples_seen=""
miru_examples_match_the_app() {
  local html shown examples_path next
  html="$(body "$miru_examples")"
  shown="$(grep -oE 'data-example="[0-9]+"' <<<"$html" | wc -l | tr -d ' ')"
  examples_path="$(grep -oE '/dictionary/search/%E8%A6%8B%E3%82%8B/examples\.json\?build=[0-9A-Za-z._-]+' <<<"$html" | head -n 1)"
  next=""
  [ -n "$examples_path" ] && next="$(body "$examples_path&from=25" | python3 -c '
import json, sys
try:
    print(" ".join(str(example["position"]) for example in json.load(sys.stdin)["examples"]))
except Exception:
    print("unreadable")
')"
  miru_examples_seen="$shown in the page; next positions ${next:-none} from ${examples_path:-no examples route}"
  [ "$shown" = 25 ] && grep -qF "<p class=\"text-muted-foreground\">$miru_first_english</p>" <<<"$html" &&
    [ "$next" = "$(echo {25..49})" ]
}
show_miru_examples() { echo "$miru_examples_seen (want 25, the suite's first sentence, then 25 to 49)"; }
eventually '見る lists its example sentences as the app does, 25 at a time' \
  "見る's Example Sentences page differs from the app" miru_examples_match_the_app show_miru_examples

expect_redirect /dictionary/1259290/ "$word"
expect /dictionary/999999999/ 404

lists_release_sitemaps() {
  local locs
  locs="$(body "$index" | grep -oE '<loc>[^<]+</loc>' || true)"
  grep -q '<loc>https://zenbujapanese.com/sitemaps/dictionary/1.xml</loc>' <<<"$locs" &&
    grep -q '<loc>https://zenbujapanese.com/sitemaps/kanji.xml</loc>' <<<"$locs" &&
    grep -q '<loc>https://zenbujapanese.com/sitemaps/conjugations.xml</loc>' <<<"$locs"
}
for index in /sitemap-index.xml /sitemap.xml; do
  eventually "$index lists the dictionary, kanji, and conjugations sitemaps" \
    "$index is missing the dictionary, kanji, or conjugations sitemap" lists_release_sitemaps
done
index_lists_files() {
  local locs
  locs="$(body /sitemap-index.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  [ -n "$locs" ] && ! grep -vqE '\.xml</loc>$' <<<"$locs"
}
eventually 'sitemap index lists unslashed .xml files' 'sitemap index has a non-canonical URL' \
  index_lists_files
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
lists_indexable_kanji() {
  local kanji_sitemap
  kanji_sitemap="$(body /sitemaps/kanji.xml)"
  grep -q "<loc>https://zenbujapanese.com$kanji</loc>" <<<"$kanji_sitemap" &&
    ! grep -q '/dictionary/kanji/%E3%90%82/' <<<"$kanji_sitemap"
}
eventually 'kanji sitemap lists indexable kanji only' 'kanji sitemap is missing 見 or lists 㐂' \
  lists_indexable_kanji
noindex='<meta name="robots" content="noindex'
noindex_follows_meanings() {
  grep -q "$noindex" <<<"$(body /dictionary/kanji/%E3%90%82/)" &&
    ! grep -q "$noindex" <<<"$(body "$kanji")"
}
eventually 'a kanji without meanings or readings is noindex' 'noindex is wrong on 㐂 or 見' \
  noindex_follows_meanings
examples_indexing() {
  ! grep -q "$noindex" <<<"$(body "$miru_examples")" &&
    grep -q "$noindex" <<<"$(body "${eat}examples/")"
}
eventually "only a direct Japanese search's examples page is indexable" \
  "noindex is wrong on 見る's or eat's examples page" examples_indexing
eventually "a form's page is noindex without examples, and names its spelling's first page" \
  "noindex or canonical is wrong on 見る's form pages" form_indexing_follows_examples
lists_conjugations() {
  local locs
  locs="$(body /sitemaps/conjugations.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  grep -q "<loc>https://zenbujapanese.com$conjugations</loc>" <<<"$locs" &&
    grep -q "<loc>https://zenbujapanese.com${conjugations}plain/past/</loc>" <<<"$locs" &&
    ! grep -q "<loc>https://zenbujapanese.com${conjugations}plain/$miru_empty_form/</loc>" <<<"$locs" &&
    ! grep -q "<loc>https://zenbujapanese.com${conjugations}polite/te-form/</loc>" <<<"$locs" &&
    grep -q "<loc>https://zenbujapanese.com${conjugations}plain/potential/</loc>" <<<"$locs" &&
    ! grep -q "<loc>https://zenbujapanese.com${conjugations}plain/passive/</loc>" <<<"$locs"
}
conjugations_status="$(curl -s -o /dev/null -w '%{http_code}' "${smoke[@]}" "$base/sitemaps/conjugations.xml")"
if [ "$conjugations_status" = 503 ]; then
  echo "skip the conjugations sitemap: the dictionary service is still working it out (503)"
else
  eventually 'conjugations sitemap lists tables and the form pages that list examples' \
    "conjugations sitemap is missing 見る's pages or lists one it shouldn't" lists_conjugations
fi
fi

robots_tag() { curl -sI "${smoke[@]}" "$base$1" | tr -d '\r' | grep -i '^x-robots-tag:' || true; }
robots() { body /robots.txt; }

if [ "$env" = production ]; then
  for path in / "$word" "$kanji" "$miru_examples" "$conjugations" "${conjugations}plain/past/" \
    /sitemaps/kanji.xml /sitemaps/conjugations.xml; do
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

if [[ "$base" == *.workers.dev ]]; then
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
