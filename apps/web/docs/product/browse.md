# Browse pages

The browse pages list the dictionary's words and kanji, and link to their word and search pages,
so every word is a few links from the dictionary home (ADR 0010, amended for #614). The app has no
browse screens: these pages follow the #614 mockups and the decisions on #614. The words they list
show as the search results' rows do: the headword with furigana, the first meaning, and the JLPT
and YouTube chips ([Dictionary](dictionary.md#search-results), Rows).

Abbreviations: Web paths are under `apps/web/`; paths that start with `packages/` or `apps/` are
from the repository root. **Browse spec** is `e2e/browse.spec.ts`, the browser tests of these
pages on the dictionary fixtures, at a desktop and a phone width. **Browse service** is
`apps/dictionary-api/src/conformance/browse.test.ts` ("browsing the dictionary on the app’s
data"), which checks what the dictionary service answers on the app's own data. The counts quoted
below are today's and change with the data.

## Dictionary home

**Browse sections.** Below the search box, `/dictionary/` leads into the browse pages:

- **Browse by kana:** the 46 hiragana and their 25 voiced forms, each that starts a word opening
  its kana's page, with links to Hiragana and Katakana.
- **Kanji by school grade:** a card for each grade, secondary school, and jinmeiyō with its count,
  linking to its list; grade 1's 80 kanji, each opening its search; and a link to every list.
- **Browse by category:** parts of speech, usage, and subjects, seven of each, and a link to all of
  each.
- **Common words:** the 24 common words most used on YouTube, each opening its word page, and a
  link to all common words.

When the dictionary service can't answer, the home shows its search box without these sections,
as it did before them, rather than failing.

- Source: #614 mockup "/dictionary/ — home (changed)".
- Check: Browse spec, "the dictionary home leads into the browse pages";
  `src/lib/dictionary/browse/data.test.ts`, "the home leaves its browse sections out, and logs
  why, when the service can’t answer".

## The hub

**Browse.** `/dictionary/browse/` is titled "Browse the Japanese dictionary" and says how many
entries the dictionary has. It has a card for hiragana and one for katakana, each with its kana
and how many words it lists; one for the kanji lists, with the first grades, JLPT N5 and N4, and
stroke counts; one for the frequency dictionaries, with the JLPT levels' word counts and the
YouTube list's first 10,000 ranks in bands of 1,000; one for each kind of category; and one for
common words.

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
かが" and lists its words in kana order, 200 to a page, with the groups beside it. Later pages
are `/dictionary/browse/hiragana/かが/2/` and on.

- Source: #614 mockup "/dictionary/browse/hiragana/かが/".
- Check: Browse spec, "a kana’s page lists its two-kana groups and leads to their words"; Browse
  service, "a two-kana group lists its words in kana order, a page at a time".

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
levels on a JLPT list.

- Source: #614 mockup "/dictionary/browse/kanji/grade-2/".
- Check: Browse spec, "the kanji lists open each kanji’s search page" and "the JLPT kanji lists
  are Waller’s, credited under CC BY".

## Frequency dictionaries

**Frequency dictionaries.** `/dictionary/browse/frequency-dictionaries/` shows the JLPT vocabulary
levels, N5 to N1, with their first words and counts, then the app's eight ranked dictionaries:
YouTube, Wikipedia, TV and movies, anime, manga, novels, visual novels, and video games. Each
shows its top words, its source and licence, and its first 10,000 ranks in bands of 1,000, each
band's dot in the tier the app's chips give its first rank.

- Source: #614 mockup "/dictionary/browse/frequency-dictionaries/"; the decision on #614 that the
  site has all eight lists, ranked as the app ranks them.
- Check: Browse spec, "the frequency dictionaries lead to each list, and credit Jiten under CC
  BY-SA"; Browse service, "the %s list ranks words from 1".

**A ranked list.** `/dictionary/browse/frequency-dictionaries/anime/` lists the words ranked 1 to
200, each with its rank, then `…/anime/2/` ranks 201 to 400, and so on to rank 10,000. A rank no
word holds is skipped. A JLPT level's page, such as `…/jlpt-n5/`, lists its words in kana order.

- Source: #614 mockup's bands; the decision on #614.
- Check: Browse spec, "the frequency dictionaries lead to each list, and credit Jiten under CC
  BY-SA"; Browse service, "the JLPT lists hold Waller’s words by level, in kana order".

**Licences.** A page that shows Jiten's rankings credits Jiten under CC BY-SA 4.0 and says its
rankings are shared under the same licence. Wikipedia's and TUBELEX's lists are credited under
BSD-3-Clause, and the JLPT lists as the word pages credit them.

- Source: the decision on #614.
- Check: Browse spec, "the frequency dictionaries lead to each list, and credit Jiten under CC
  BY-SA"; `src/lib/dictionary/browse/copy.test.ts`, "each ranked list credits its source".

## Categories

**Category lists.** `/dictionary/browse/parts-of-speech/`, `/dictionary/browse/usage/` (with the
dialects), and `/dictionary/browse/subjects/` list their categories with how many words each has.

- Source: #614 mockups' "All parts of speech", "All usage labels", and "All subjects" links.
- Check: Browse spec, "a category lists its words most used first, a page at a time".

**A category.** A category's page, such as `/dictionary/browse/onomatopoeia/`, says how many words
JMdict marks with it and lists them most used on YouTube first, words YouTube doesn't rank last,
200 to a page (`…/onomatopoeia/2/`). A tab lists them in kana order instead
(`…/onomatopoeia/kana-order/`). Below are links to other categories. The categories are JMdict's
parts of speech, usage labels, subject fields, and dialects, and its common words
(`/dictionary/browse/common-words/`); names and vulgar, derogatory, or sensitive words have none.

- Source: #614 mockup "/dictionary/browse/onomatopoeia/"; the decision on #614 that the importer
  keeps the labels.
- Check: Browse spec, "a category lists its words most used first, a page at a time"; Browse
  service, "a category lists the words JMdict labels with it, most used first".

## Site-wide

**Breadcrumbs.** Each browse page's trail starts Home › Dictionary › Browse, then its parents, as
"Hiragana › か › かが". A trail of more than three crumbs wraps onto another line where it doesn't
fit, rather than overlapping; a shorter one stays on one line and truncates its last crumb.

- Source: #614 mockups.
- Check: Browse spec, "a kana’s page lists its two-kana groups and leads to their words" and "a
  long breadcrumb trail wraps rather than overlapping".

**Footer.** The footer links Browse by kana and Kanji by grade after Dictionary.

- Source: #614 mockup "Footer + /sitemap/ (changed)".
- Check: `src/components/site-footer.test.tsx`, "the footer links the browse pages after
  Dictionary".

**HTML sitemap.** `/sitemap/` lists the site's pages, then the dictionary and its browse pages: the
kana pages, each kanji list, each frequency dictionary, and the category lists.

- Source: #614 mockup "Footer + /sitemap/ (changed)".
- Check: Browse spec, "the sitemap page lists the browse pages".

**URLs and indexing.** Every browse page is indexable and its own canonical URL. A page's first
page has no number: `…/2/` is its second, `…/1/` redirects (308) to the list's URL, and a page past
the last, or a list, kana, or category the dictionary doesn't have, is 404.

- Source: ADR 0010 (amended).
- Check: Browse spec, "a list’s first page has no number, and a page past its last is 404";
  `src/lib/dictionary/browse/paths.test.ts`; that each browse page without parameters is read
  when it's asked for, never at build time: `src/app/dictionary/browse/dynamic.test.ts`.

**Browse sitemap.** `/sitemaps/browse.xml` lists every browse page, and the sitemap index lists it
wherever the site has a dictionary service.

- Source: #614 mockup "Footer + /sitemap/ (changed)" (`/sitemaps/browse.xml` in
  `/sitemap-index.xml`).
- Check: `src/lib/dictionary/sitemaps.test.ts`, "the browse sitemap lists every browse page";
  Browse service, "the browse sitemap fits in one file".

