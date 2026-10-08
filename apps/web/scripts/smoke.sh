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

for path in / /support/ /legal/privacy/ /sitemap-pages.xml /robots.txt; do
  expect "$path" 200
done
expect_redirect /support /support/
expect_redirect /robots.txt/ /robots.txt
expect_redirect /sitemap-pages.xml/ /sitemap-pages.xml
expect_redirect /sitemaps/pages.xml /sitemap-pages.xml

pages_list_pages() {
  local locs pages
  locs="$(body /sitemap-pages.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  pages="$(grep -vxF "<loc>$canonical</loc>" <<<"$locs" || true)"
  grep -qxF "<loc>$canonical</loc>" <<<"$locs" && [ -n "$pages" ] &&
    ! grep -vqE "^<loc>${canonical//./\\.}/[^<]*/</loc>$" <<<"$pages"
}
eventually "pages sitemap lists the homepage as $canonical and slashed pages on it" \
  'pages sitemap has a non-canonical URL, or another host' pages_list_pages
expect_redirect /privacy /legal/privacy/

canonicals_name_host() {
  local home about
  home="$(body /)"
  about="$(body /about/)"
  grep -qF "<link rel=\"canonical\" href=\"$canonical\"/>" <<<"$home" &&
    grep -qF "<meta property=\"og:url\" content=\"$canonical\"/>" <<<"$home" &&
    grep -qF "<link rel=\"canonical\" href=\"$canonical/about/\"/>" <<<"$about"
}
eventually "canonical tags name $canonical, the homepage with no slash" \
  "a canonical tag names another host, or the homepage's has a slash" canonicals_name_host

header_has_dictionary() {
  local header
  header="$(body / | tr -d '\n' | grep -oE '<header[^>]*>.*</header>')"
  grep -q 'href="/dictionary/"' <<<"$header" && ! grep -q '<search' <<<"$header"
}
eventually 'the header links to the dictionary and has no search' \
  'the header is missing the Dictionary link, or has a search' header_has_dictionary
header_marks_dictionary() {
  local header
  header="$(body /dictionary/ | tr -d '\n' | grep -oE '<header[^>]*>.*</header>')"
  grep -qE '<button [^>]*aria-current="true"[^>]*>Dictionary' <<<"$header" &&
    grep -oE '<a [^>]*href="/dictionary/"[^>]*>' <<<"$header" | grep -q 'aria-current="page"'
}
eventually 'the header marks Dictionary current on the dictionary home' \
  'the header does not mark Dictionary current on the dictionary home' header_marks_dictionary
footer_has_privacy_policy() {
  grep -qE '<footer[^>]*>.*href="/legal/privacy/"[^>]*>Privacy Policy</a>' <<<"$(body / | tr -d '\n')"
}
eventually 'the footer links the Privacy Policy' 'the footer is missing the Privacy Policy link' \
  footer_has_privacy_policy

word=/dictionary/%E8%A6%8B%E3%82%8B-1259290/
kanji_search=/dictionary/search/%E8%A6%8B/
miru_search=/dictionary/search/%E8%A6%8B%E3%82%8B/
eat=/dictionary/search/eat/

expect_redirect /dictionary/kanji/%E8%A6%8B/ "$kanji_search"
expect_redirect "${word}conjugations/" "$word"
expect_redirect "${word}conjugations/plain/past/" "$word"
expect_redirect "${miru_search}examples/" "$miru_search"
expect /sitemaps/kanji.xml 404
expect /sitemaps/conjugations.xml 404

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
if python3 -c 'import json, sys; seen = json.loads(sys.argv[1]); sys.exit(seen.get("contract") != seen.get("siteContract"))' "$service_seen"; then
  pass 'the site and its dictionary service answer the same contract'
else
  echo "::warning::The site and its dictionary service answer different contracts ($service_seen). The site still serves, and the pages whose response shape changed may be wrong until the other one deploys (docs/agents/web.md, Dictionary)."
fi

expect /dictionary/ 200
expect "$word" 200
expect "$kanji_search" 200
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

eat_examples="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "eat")
print(case["examples"]["title"])
' "$suite")"
shows_examples_row() {
  local html
  html="$(body "$eat")"
  grep -q 'data-section="examples"' <<<"$html" && grep -qF "$eat_examples" <<<"$html" &&
    grep -q 'href="#examples"' <<<"$html" && grep -q 'id="examples"' <<<"$html" &&
    grep -q 'data-section="searchExamples"' <<<"$html"
}
eventually "eat leads with '$eat_examples', linked to its Example Sentences on the page, as the app does" \
  "eat has no '$eat_examples' row linked to an Example Sentences section on the page" \
  shows_examples_row

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
print(" ".join(kanji["character"] for kanji in cases["1259290"]["kanji"]))
' "$word_suite")"
gakkou_split="$(sed -n 1p <<<"$word_expected")"
miru_dots="$(sed -n 2p <<<"$word_expected")"
miru_rows="$(sed -n 3p <<<"$word_expected")"
read -ra miru_kanji <<<"$(sed -n 4p <<<"$word_expected")"
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
word_holds_its_sections() {
  local html wanted
  html="$(body "$word")"
  for wanted in 'id="conjugations"' 'data-conjugation-table' 'id="examples"'; do
    grep -qF "$wanted" <<<"$html" || return 1
  done
  for wanted in "${miru_kanji[@]}"; do
    grep -qF "data-kanji-details=\"$wanted\"" <<<"$html" || return 1
  done
}
eventually "見る's page holds its Conjugations section, its Examples, and ${miru_kanji[*]}'s kanji details" \
  "見る's page is missing its Conjugations section, its Examples, or a kanji's details" \
  word_holds_its_sections
conjugation_expected="$(python3 -c '
import json, sys, urllib.parse
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["entSeq"][0] == "1259290")
print(" ".join(form["kind"] for form in case["conjugations"]["plain"]))
past = next(form for form in case["conjugations"]["plain"] if form["kind"] == "past")
print("/dictionary/conjugations/%s.json" % urllib.parse.quote(past["surface"], safe=""))
print(" ".join(i.removeprefix("esp1_") for i in past["examples"]["ids"]))
' "$word_suite")"
miru_kinds="$(sed -n 1p <<<"$conjugation_expected")"
miru_past_examples="$(sed -n 2p <<<"$conjugation_expected")"
miru_past_pairs="$(sed -n 3p <<<"$conjugation_expected")"
conjugations_seen=""
conjugations_like_the_app() {
  local kinds past marked pairs
  kinds="$(awk 'BEGIN { RS = "data-conjugation-rows=\"" } /^Plain"/' <<<"$(body "$word")" |
    grep -oE 'data-conjugation-row="[^"]+"' | sed -E 's/.*="([^"]+)"/\1/' | paste -sd' ' -)"
  past="$(body "$miru_past_examples" | python3 -c '
import json, sys
try:
    examples = json.load(sys.stdin)["examples"]
except Exception:
    print("unreadable")
    sys.exit()
print("yes" if any(t["isPageWord"] for e in examples for t in e["tokens"]) else "no")
print(" ".join(example["pairId"] for example in examples))
')"
  marked="$(sed -n 1p <<<"$past")"
  pairs="$(sed -n 2p <<<"$past")"
  conjugations_seen="forms $kinds; past's examples $pairs; the form marked $marked"
  [ "$kinds" = "$miru_kinds" ] && [ "$pairs" = "$miru_past_pairs" ] && [ "$marked" = yes ]
}
show_conjugations_seen() {
  echo "$conjugations_seen (want forms $miru_kinds; past's examples $miru_past_pairs; the form marked yes)"
}
eventually "見る's conjugations and its past's examples match the app" \
  "見る's conjugations or its past's examples differ from the app" conjugations_like_the_app \
  show_conjugations_seen
search_holds_kanji_details() {
  local html
  html="$(body /dictionary/search/%E8%A6%81/)"
  grep -qF 'data-kanji-row="要"' <<<"$html" && grep -qF 'data-kanji-details="要"' <<<"$html"
}
eventually "要's search holds its kanji row and the kanji's details" \
  "要's search is missing its kanji row or the kanji's details" search_holds_kanji_details

iru_examples_expected="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "iru")
print(case["examples"]["title"])
primary = case["examples"]["primaryEntry"]
print(next(row["entSeq"][0] for row in case["results"] if row["languageReferenceID"] == primary))
' "$suite")"
iru_examples_title="$(sed -n 1p <<<"$iru_examples_expected")"
iru_examples_word="$(sed -n 2p <<<"$iru_examples_expected")"
iru_has_examples_row() {
  local html
  html="$(body "$iru")"
  grep -q "<p class=\"font-semibold\">$iru_examples_title</p>" <<<"$html" &&
    grep -qE "href=\"/dictionary/[^\"/]+-$iru_examples_word/#examples\"" <<<"$html"
}
eventually "iru shows \"$iru_examples_title\", linked to its word's examples, as the app does" \
  "iru's Example Sentences row is missing or doesn't open word $iru_examples_word's examples" \
  iru_has_examples_row

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
expect '/dictionary/search/t*/' 200
eat_first_english="$(python3 -c '
import json, sys
case = next(c for c in json.load(open(sys.argv[1]))["cases"] if c["query"] == "eat")
english = case["shown"][0]["english"]
for plain, react_escaped in (("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"), ("\"", "&quot;"), ("'"'"'", "&#x27;")):
    english = english.replace(plain, react_escaped)
print(english)
' "$examples_suite")"
eat_examples_seen=""
eat_examples_match_the_app() {
  local html shown examples_path next
  html="$(body "$eat")"
  shown="$(grep -oE 'data-example="[0-9]+"' <<<"$html" | wc -l | tr -d ' ')"
  examples_path="$(grep -oE '/dictionary/search/eat/examples\.json\?build=[0-9A-Za-z._-]+' <<<"$html" | head -n 1)"
  next=""
  [ -n "$examples_path" ] && next="$(body "$examples_path&from=25" | python3 -c '
import json, sys
try:
    print(" ".join(str(example["position"]) for example in json.load(sys.stdin)["examples"]))
except Exception:
    print("unreadable")
')"
  eat_examples_seen="$shown in the page; next positions ${next:-none} from ${examples_path:-no examples route}"
  [ "$shown" = 25 ] && grep -qF "<p class=\"text-muted-foreground\">$eat_first_english</p>" <<<"$html" &&
    [ "$next" = "$(echo {25..49})" ]
}
show_eat_examples() { echo "$eat_examples_seen (want 25, the suite's first sentence, then 25 to 49)"; }
eventually 'eat lists its example sentences on its page as the app does, 25 at a time' \
  "eat's Example Sentences differ from the app" eat_examples_match_the_app show_eat_examples

expect_redirect /dictionary/1259290/ "$word"
expect /dictionary/999999999/ 404

lists_word_sitemaps_only() {
  local locs
  locs="$(body "$index" | grep -oE '<loc>[^<]+</loc>' || true)"
  grep -qxF "<loc>$canonical/sitemap-words.xml</loc>" <<<"$locs" &&
    grep -qxF "<loc>$canonical/sitemap-pages.xml</loc>" <<<"$locs" &&
    grep -qxF "<loc>$canonical/sitemap-kana.xml</loc>" <<<"$locs" &&
    grep -qxF "<loc>$canonical/sitemap-categories.xml</loc>" <<<"$locs" &&
    grep -qxF "<loc>$canonical/sitemap-frequency-lists.xml</loc>" <<<"$locs" &&
    grep -qxF "<loc>$canonical/sitemap-kanji-lists.xml</loc>" <<<"$locs" &&
    ! grep -vqE "^<loc>${canonical//./\\.}/sitemap-(pages|kana|categories|frequency-lists|kanji-lists|words(-[0-9]+)?)\\.xml</loc>$" <<<"$locs"
}
for index in /sitemap-index.xml /sitemap.xml; do
  eventually "$index lists the pages, word, and browse sitemaps on $canonical, and no other" \
    "$index is missing the pages, word, or browse sitemaps, lists another, or names another host" \
    lists_word_sitemaps_only
done
index_lists_files() {
  local locs
  locs="$(body /sitemap-index.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  [ -n "$locs" ] && ! grep -vqE '\.xml</loc>$' <<<"$locs"
}
eventually 'sitemap index lists unslashed .xml files' 'sitemap index has a non-canonical URL' \
  index_lists_files
expect /sitemap-words.xml 200
expect /sitemap-words-2.xml 200
for browse_sitemap in /sitemap-kana.xml /sitemap-categories.xml /sitemap-frequency-lists.xml /sitemap-kanji-lists.xml; do
  browse_sitemap_is_canonical() {
    local locs
    locs="$(body "$browse_sitemap" | grep -oE '<loc>[^<]+</loc>' || true)"
    [ -n "$locs" ] &&
      ! LC_ALL=C grep -vqE "^<loc>${canonical//./\\.}/dictionary/browse/[!-~]+/</loc>$" <<<"$locs"
  }
  eventually "$browse_sitemap lists browse pages on $canonical" \
    "$browse_sitemap is empty, or lists another host or a non-canonical URL" browse_sitemap_is_canonical
done
expect /sitemap-browse.xml 404
expect_redirect /sitemaps/dictionary/2.xml /sitemap-words-2.xml
word_count=0
word_sitemap_is_canonical() {
  local locs
  locs="$(body /sitemap-words.xml | grep -oE '<loc>[^<]+</loc>' || true)"
  word_count="$(grep -c . <<<"$locs" || true)"
  [ "$word_count" -ge 1 ] && [ "$word_count" -le 50000 ] &&
    ! LC_ALL=C grep -vqE "^<loc>${canonical//./\\.}/dictionary/[!-~]+-[0-9]+/</loc>$" <<<"$locs"
}
eventually 'word sitemap lists 1 to 50,000 canonical URLs' \
  'word sitemap has no URLs, more than 50,000, or a non-canonical one' word_sitemap_is_canonical
noindex='<meta name="robots" content="noindex'
search_indexing_follows_results() {
  grep -q "$noindex" <<<"$(body /dictionary/search/qzxvkj/)" &&
    ! grep -q "$noindex" <<<"$(body "$kanji_search")"
}
eventually "a search that finds nothing is noindex, and a kanji's search is indexable" \
  'noindex is wrong on the searches for qzxvkj or 見' search_indexing_follows_results
fi

robots_tag() { curl -sI "${smoke[@]}" "$base$1" | tr -d '\r' | grep -i '^x-robots-tag:' || true; }
robots() { body /robots.txt; }
lists_index() { grep -qxF "Sitemap: $canonical/sitemap-index.xml" <<<"$(robots)"; }
eventually 'robots.txt lists the sitemap index' 'robots.txt is missing the sitemap index' lists_index

if [ "$env" = production ]; then
  for path in / "$word" "$kanji_search" "$eat" /sitemap-index.xml /sitemap-words.xml; do
    has_no_robots_tag() { [ -z "$(robots_tag "$path")" ]; }
    eventually "no X-Robots-Tag on $path" "unexpected X-Robots-Tag on $path" has_no_robots_tag
  done
  allows_crawling() { grep -q '^Allow: /$' <<<"$(robots)"; }
  eventually 'robots.txt allows crawling' 'robots.txt does not allow crawling' allows_crawling
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
