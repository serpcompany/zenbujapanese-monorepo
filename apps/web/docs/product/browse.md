# Browse pages

The browse pages list the dictionary's words and kanji, and link to their word and search pages,
so every word is a few links from the dictionary home (ADR 0010, amended for #614). The app has no
browse screens: these pages follow the #614 mockups and the decisions on #614. The words they list
show as the search results' rows do: the headword with furigana, the first meaning, and the JLPT
and YouTube chips ([Dictionary](dictionary.md#search-results), Rows).

Abbreviations: Web paths are under `apps/web/`; paths that start with `packages/` or `apps/` are
from the repository root. **Browse spec**, **Browse lists spec**, and **Browse links spec** are
`e2e/browse.spec.ts`, `e2e/browse-lists.spec.ts`, and `e2e/browse-links.spec.ts`, the browser
tests of these pages on the dictionary fixtures, at a desktop and a phone width. **Browse
service** is `apps/dictionary-api/src/conformance/browse.test.ts` ("browsing the dictionary on the
app’s data") and **Browse categories service** is
`apps/dictionary-api/src/conformance/browse-categories.test.ts` ("browsing a category on the app’s
data"), which check what the dictionary service answers on the app's own data. The counts quoted
below are today's and change with the data.

## Dictionary home

**Browse sections.** Below the search box, `/dictionary/` leads into the browse pages:

- **Browse by kana:** the 46 hiragana and their 25 voiced forms, each that starts a word opening
  its kana's page, with links to Hiragana and Katakana.
- **Kanji by school grade:** a card for each grade, secondary school, and jinmeiyō with its count,
  linking to its list; grade 1's 80 kanji, each opening its search; and a link to every list.
- **Browse by category:** parts of speech, usage, and subjects, seven of each, and a link to all of
  each.
- **Common words:** the 24 content words most used on YouTube among the common words, each
  opening its word page, and a link to all common words. Content words leave out particles,
  auxiliaries, conjunctions, and copulas (by their first meaning), and words that are only a
  prefix or suffix, so the section opens with する, 言う, and 有る, as the mockup shows content
  words, not の, と, and に. The common words category itself lists every common word.

When the dictionary service can't answer, the home shows its search box without these sections,
as it did before them, rather than failing.

- Source: #614 mockup "/dictionary/ — home (changed)".
- Check: Browse spec, "the dictionary home leads into the browse pages";
  `src/lib/dictionary/browse/data.test.ts`, "the home leaves its browse sections out, and logs
  why, when the service can’t answer"; Browse categories service, "the home’s common words are
  content words, most used first"; `packages/dictionary-core/src/browse/content-words.test.ts`.

## The hub

**Browse.** `/dictionary/browse/` is titled "Browse the Japanese dictionary" and says how many
entries the dictionary has. It has a card for hiragana and one for katakana, each with its kana
and how many words it lists; one for the kanji lists, with the first grades, JLPT N5 and N4, and
stroke counts; one for the frequency dictionaries, with the JLPT levels' word counts and the
YouTube list's first 10,000 ranks in bands of 1,000, each opening its band's page; one for each
kind of category; and one for common words.

- Source: #614 mockup "/dictionary/browse/".
- Check: Browse spec, "the browse hub leads to each kind of list".

## Kana

**Charts.** `/dictionary/browse/kana/` shows the hiragana and katakana charts, gojūon then dakuon
and handakuon, each kana with its Hepburn romaji. Each kana that starts a word opens its page;
one that starts none (ぢ, ヂ) is drawn dashed, without a link, as on the hub and the dictionary
home. Each chart links to its script's page with how many words it lists.

- Source: #614 mockup "/dictionary/browse/kana/".
- Check: Browse spec, "the kana charts show each kana’s romaji and open its page".

**A script's kana.** `/dictionary/browse/hiragana/` and `/dictionary/browse/katakana/` show the
same charts with how many words start with each kana, and tabs for the two scripts. A kana no
word starts with is left blank. The kana a reading can start with that the charts don't hold
(small っ, ゐ, ゑ, ゔ, ヴ, the long-vowel mark, and others) follow under "Other", so every word is
under one kana. A reading that starts with hiragana is under hiragana, and any other under
katakana.

- Source: #614 mockups "/dictionary/browse/hiragana/" and "/katakana/"; the owner's note on the
  mockups that the kana word lists cover every entry.
- Check: Browse spec, "a script’s page counts each kana’s words and lists the other kana";
  Browse service, "hiragana and katakana together hold every entry".

**A kana's page.** `/dictionary/browse/hiragana/か/` is titled "Japanese words starting with か".
It shows the script's kana, the current one marked, then each two-kana group (かあ, かい, … かん)
with its count and, past 200 words, how many pages it has. The words read as the kana alone are
listed below the groups. Links lead to the kanas before and after it, in Unicode order (お, が),
and a hiragana's page links to its katakana's when words start with it (か to カ, but not っ,
since no word starts with ッ).

- Source: #614 mockup "/dictionary/browse/hiragana/か/".
- Check: Browse spec, "a kana’s page lists its two-kana groups and leads to their words"; Browse
  service, "a kana’s two-kana groups and its own words add up to its count".

**A two-kana group.** `/dictionary/browse/hiragana/かが/` is titled "Japanese words starting with
かが" and lists its words in kana order, 200 to a page. Above them, the groups beside it lead to
their pages, between arrows to the group before and after it ("← かか" and "かき →"); the first
group's arrow back, and the last one's forward, lead to the kana before or after instead. Later
pages are `/dictionary/browse/hiragana/かが/2/` and on.

- Source: #614 mockup "/dictionary/browse/hiragana/かが/".
- Check: Browse spec, "a kana’s page lists its two-kana groups and leads to their words" and "a
  two-kana group leads to the groups before and after it"; Browse service, "a two-kana group
  lists its words in kana order, a page at a time".

## Kanji lists

**Kanji lists.** `/dictionary/browse/kanji/` lists the 2,136 jōyō kanji by school grade, each
grade's kanji most frequent first and each opening its search page, with links to jump to a
grade (a menu on phones). Secondary school's 1,110 open from a collapsed section, and jinmeiyō's
863 have a page of their own. Then come the JLPT levels, N5 to N1, a card each with its five most
frequent kanji and how many it lists: 79, 166, 367, 367, and 1,232. Last come the stroke counts,
each with how many jōyō kanji have it.

- Source: #614 mockups "/dictionary/browse/kanji/" (desktop and phone).
- Check: Browse spec, "the kanji lists open each kanji’s search page"; Browse service, "the
  kanji lists follow KANJIDIC2’s grades, most frequent first".

**JLPT levels.** The kanji's JLPT levels are Jonathan Waller's lists, the same author as the JLPT
vocabulary lists, rather than the levels KANJIDIC2 records, as the mockups have it: the owner
chose his lists. The JLPT has published no kanji list since 2010, and the kanji lists page and each
JLPT list say the levels are estimates. Both credit his lists under CC BY, linking to them as the
Internet Archive keeps them, since his site no longer resolves. N1 includes 247 jinmeiyō kanji, and
his lists leave out 172 jōyō kanji, such as 分 and 可, that no modern list gives a level. A
kanji's details show the same level as these lists, or none
([Dictionary](dictionary.md#kanji-details)).

- Source: the owner's answers on #614.
- Check: Browse spec, "the JLPT kanji lists are Waller’s, credited under CC BY"; Browse service,
  "the JLPT kanji lists are Waller’s, most frequent first".

**A kanji list.** `/dictionary/browse/kanji/grade-2/` and the others (`grade-1` to `grade-6`,
`secondary-school`, `jinmeiyo`, `jlpt-n5` to `jlpt-n1`, `strokes-1` to `strokes-29`) show each
kanji with its first meaning, most frequent first, with tabs for the grades, or for the JLPT
levels on a JLPT list. Jinmeiyō holds 57 CJK compatibility characters, such as U+FA45, a variant of
海. Each shows its own glyph and links straight to its base kanji's search page
(`/dictionary/search/海/`), never to the compatibility character's URL, which redirects there. The
25 that KANJIDIC2 gives no meaning show their base kanji's.

- Source: #614 mockup "/dictionary/browse/kanji/grade-2/".
- Check: Browse spec, "the kanji lists open each kanji’s search page", "the JLPT kanji lists are
  Waller’s, credited under CC BY", and "a compatibility kanji keeps its glyph, with its base
  kanji’s meaning and search"; Browse service, "every kanji a list shows has a meaning, a
  compatibility kanji its base kanji’s".

## Frequency dictionaries

**Frequency dictionaries.** `/dictionary/browse/frequency-dictionaries/` shows the JLPT vocabulary
levels, N5 to N1, with their first words and counts, then the app's eight ranked dictionaries:
YouTube, Wikipedia, TV and movies, anime, manga, novels, visual novels, and video games. Each
shows its top words, its source and licence, and its first 10,000 ranks in bands of 1,000
(1–1k, 1k–2k, … 9k–10k), each band's dot in the tier the app's chips give its first rank. A legend
names the mockup's four tiers, Very common, Common, Less common, and Uncommon, which are the
app's chip tiers (its "moderately common" is the mockup's Less common), and says where each ends:
ranks 1,500, 5,000, 15,000, and 30,000. So within the first 10,000 ranks the bands are green to
2,000, yellow to 5,000, and orange after, where the mockup's sample colours turn red at 8,001;
the chips beside each word use the same tiers.

- Source: #614 mockup "/dictionary/browse/frequency-dictionaries/" ("[Tier cut-offs as the app's
  chips use them]"); the decision on #614 that the site has all eight lists, ranked as the app
  ranks them.
- Check: Browse lists spec, "lead to each list’s first band and each JLPT level, with the app’s
  four tiers"; `src/lib/dictionary/browse/copy.test.ts`, "the tier legend gives the cut-offs the
  app’s chips use"; Browse service, "the %s list ranks words from 1, a band of 1,000 ranks at a
  time".

**A ranked list.** A band of 1,000 ranks is a page: `/dictionary/browse/frequency-dictionaries/anime/1-1000/`
lists the words ranked 1 to 1,000, each with its rank, then `…/anime/1001-2000/` and so on to
`…/anime/9001-10000/`, as the mockup names them. The list's name links to its first band, and
the bands link to each other. A rank no word holds is skipped. Wikipedia's and Jiten's pages say
which words that leaves out and why: the lists count spellings (Jiten's with their readings), and
the app ranks one only when it names a single dictionary word, so ones several words share, such
as に, は, and が, aren't ranked. The app's mapping does this on purpose
(`apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackMappingV2.sql`, which every
installed pack pins), and the site keeps it, so it ranks words as the app does.

- Source: #614 mockup's bands and their URLs; the decision on #614.
- Check: Browse lists spec, "a ranked list shows a band of 1,000 ranks, says which words it
  skips, and credits Jiten"; `src/lib/dictionary/browse/paths.test.ts`;
  `src/lib/dictionary/browse/copy.test.ts`, "the Wikipedia and Jiten lists say which words aren’t
  ranked, and why".

**A JLPT level.** `/dictionary/browse/frequency-dictionaries/jlpt/n5/`, to `…/jlpt/n1/`, lists
the level's words in kana order, 200 to a page (`…/jlpt/n1/2/`).

- Source: #614 mockup "/dictionary/browse/frequency-dictionaries/" (`/jlpt/n5/ … /n1/`).
- Check: Browse lists spec, "a JLPT level lists its words in kana order"; Browse service, "the
  JLPT lists hold Waller’s words by level, in kana order".

**Licences.** A page that shows Jiten's rankings credits Jiten under CC BY-SA 4.0 and says its
rankings are shared under the same licence. Wikipedia's and TUBELEX's lists are credited under
BSD-3-Clause, and the JLPT lists as the word pages credit them.

- Source: the decision on #614.
- Check: Browse lists spec, "a ranked list shows a band of 1,000 ranks, says which words it
  skips, and credits Jiten"; `src/lib/dictionary/browse/copy.test.ts`, "each ranked list credits
  its source".

## Categories

**Category lists.** `/dictionary/browse/parts-of-speech/`, `/dictionary/browse/usage/` (with the
dialects), and `/dictionary/browse/subjects/` list their categories with how many words each has.

- Source: #614 mockups' "All parts of speech", "All usage labels", and "All subjects" links.
- Check: Browse lists spec, "a category lists its words most used first, a page at a time, with a
  tab for kana order".

**A category.** A category's page, such as `/dictionary/browse/onomatopoeia/`, says how many words
JMdict marks with it and in what order, then what the category is, in a sentence or two of its
own, as the mockup's intro does for onomatopoeia. Two tabs, as in the mockup, list its words
"Most used" (`…/onomatopoeia/`) or in "Kana order" (`…/onomatopoeia/kana-order/`), 200 to a page
(`…/onomatopoeia/2/`, `…/onomatopoeia/kana-order/2/`). Below are links to other categories. The
categories are JMdict's parts of speech, usage labels, subject fields, and dialects, and its
common words (`/dictionary/browse/common-words/`); names and vulgar, derogatory, or sensitive
words have none.

- Each row shows the first meaning that has the category's label, so 行く under Slang reads "to
  trip, to get high", and と under Nouns "promoted pawn".
- Most used first lists the words whose first meaning has the label, then the words that have it
  only on a later meaning, each most used on YouTube first, then the words YouTube doesn't rank.
  YouTube's rank counts every use of a word, so a word whose label is on a later meaning would
  otherwise lead its list with the count of its other meanings: と (a particle, 4th on YouTube)
  led Nouns, 行く led Slang, and な led Kansai dialect. Now Nouns starts with 事, 様, and 方,
  Slang with コス and キモイ, and Kansai dialect with ねん, ほんま, and はる.
- Kana order is for browsing, so it isn't indexed (`noindex, follow`) and the categories sitemap
  leaves it out: search engines see each category once.

- Source: #614 mockup "/dictionary/browse/onomatopoeia/" (its intro, and its "Most used" and
  "Kana order" tabs); the decision on #614 that the importer keeps the labels.
- Check: Browse lists spec, "a category lists its words most used first, a page at a time, with a
  tab for kana order"; Browse categories service, "each row shows the first meaning that carries
  the category’s label", "a category leads with the words it labels in their first meaning, each
  part most used first", "a word labelled only in a later meaning follows, showing that meaning",
  "kana order lists the same words by reading", and "the index lists a category as its own query
  would"; `src/lib/dictionary/browse/copy.test.ts`, "every category has its own one- or
  two-sentence intro".

## Site-wide

**Breadcrumbs.** Each browse page's trail starts Home › Dictionary › Browse, then its parents, as
"Hiragana › か › かが". A trail of more than three crumbs wraps onto another line where it doesn't
fit, rather than overlapping; a shorter one stays on one line and truncates its last crumb.

- Source: #614 mockups.
- Check: Browse spec, "a kana’s page lists its two-kana groups and leads to their words" and "a
  long breadcrumb trail wraps rather than overlapping".

**Footer.** The footer's Tools column links Kana charts, Kanji lists, and Frequency lists, and the
header's Dictionary and Tools menus lead to the kana, kanji, frequency, and category pages
([Dictionary](dictionary.md#header-footer-and-site-wide), Menus and Footer).

- Source: #614 mockup "Footer + /sitemap/ (changed)"; #648 decision and mockups (the footer's
  columns).
- Check: `src/components/site-footer.test.tsx`, "the footer groups its links under Products, Tools,
  Company, and Legal"; `src/components/site-header.test.tsx`, "the Dictionary menu leads to the
  dictionary and its browse pages" and "the Tools menu leads to the reference pages, and its planned
  pages are placeholders"; `e2e/site.spec.ts`, "the footer groups its links under Products, Tools,
  Company, and Legal, then ends with the copyright and Sitemap" and "every link in the header menus
  opens a page the site has, with no redirect".

**Width.** A browse page is one column, at most 1,024 pixels wide (`max-w-5xl`), as the mockups
are, so the kana charts and the kanji grids fit a row; on a phone it fills the screen's width.

- Source: #614 mockups.
- Check: Browse spec, "a browse page is one column, at most 1,024 pixels wide".

**HTML sitemap.** `/sitemap/` lists the site's pages, then the dictionary and its browse pages: the
kana pages, each kanji list, each frequency dictionary, and the category lists.

- Source: #614 mockup "Footer + /sitemap/ (changed)".
- Check: Browse spec, "the sitemap page lists the browse pages".

**URLs and indexing.** Every browse page is its own canonical URL. A list's first page has no
number: `…/2/` is its second, `…/1/` redirects (308) to the list's URL, and a page past the last,
or a list, band, kana, or category the dictionary doesn't have, is 404. A list of fewer than 10
words (or kanji) isn't indexed (`noindex, follow`), and neither is a category in kana order; the
rest are. The thin lists today are 11 categories (audiovisual and paleontology with 1 word, manga,
Nagano dialect, and pathology with 2, and Tsugaru dialect, mechanical engineering, Tosa dialect,
motorsport, gardening, and mining with 5 to 9), 3,924 of the 6,516 two-kana groups (such as
かカ), 14 kana with fewer than 10 words (such as ﾀ, 〜, and ヲ), and five stroke counts (1, 21, 22,
23, and 29 strokes). They stay linked from their kana, category list, or kanji lists, so every
word stays a few links from the dictionary home.

- Source: ADR 0010 (amended); #614 (the thin lists).
- Check: Browse spec, "a list’s first page has no number, and a page or list the dictionary lacks
  is 404"; Browse lists spec, "a list of under 10 words isn’t indexed, but stays linked";
  `src/lib/dictionary/browse/paths.test.ts`; that each browse page without parameters is read
  when it's asked for, never at build time: `src/app/dictionary/browse/dynamic.test.ts`.

**No link is a redirect.** Every link on a browse page goes straight to its page, never to a URL
that redirects, which a site audit (Ahrefs, for #614) reports. So a kanji links to the search
page of its normalized form, a list's name to its first band, and a first page to the list's own
URL.

- Source: #614 (the Ahrefs site audit).
- Check: Browse links spec, "no link on a browse page leads to a redirect, as a site audit would
  flag", which follows every link on the browse pages the fixtures hold;
  `src/lib/dictionary/urls.test.ts`, "a kanji links to the search page of its normalized form".

**Browse sitemaps.** Every indexed browse page is in exactly one sitemap, by kind:
`/sitemap-kana.xml` (the hiragana and katakana lists), `/sitemap-categories.xml`,
`/sitemap-frequency-lists.xml` (ranked bands and JLPT vocabulary), and `/sitemap-kanji-lists.xml`.
Each hub leads its kind's sitemap: the kana charts and both scripts lead the kana sitemap, the
three category indexes the categories sitemap, the frequency dictionaries the frequency lists
sitemap, and the kanji lists the kanji lists sitemap. The browse home is in `/sitemap-pages.xml`,
beside `/dictionary/`. The sitemap index lists the four wherever the site has a dictionary
service.

- Source: #614 mockup "Footer + /sitemap/ (changed)" (one `/sitemaps/browse.xml` in
  `/sitemap-index.xml`); #663 moved the sitemaps to the root and split this one by kind, as the
  SERP XML sitemaps standard asks.
- Check: `src/lib/dictionary/sitemaps.test.ts`, "the browse sitemaps list every browse page with
  10 words or more, each once" and "the … sitemap lists only its own kind of browse page";
  `src/lib/sitemap.test.ts`, "the … browse sitemap is …"; `apps/web/e2e/sitemaps.spec.ts`, the
  pages sitemap's browse home; Browse service, "the browse sitemap fits in one file" (all four
  together stay under one file's 50,000 URLs, so each does); Browse categories service, "the
  categories under 10 words are the thin ones the sitemap leaves out".

