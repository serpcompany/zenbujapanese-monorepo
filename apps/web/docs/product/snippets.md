# Titles, descriptions, and sharing

What a search result and a shared link show for each page of zenbujapanese.com: its title, its
meta description, and its Open Graph and X card tags. The Ahrefs Site Audit of 2026-10-19 (#871)
found no page with an image, dictionary pages without the site's Open Graph tags, descriptions
too short or too long on most pages, and 43 titles too long.

Abbreviations: Web paths are under `apps/web/`. **Sharing spec** is `e2e/sharing.spec.ts`, a
browser test at a desktop width. Characters are counted as Ahrefs counts them, one per code point,
in English and Japanese alike.

## Sharing

**Every page shares with an image.** Every page names the site's image, `/og-image.png`, 1,200 by
630 pixels, with its size, type, and the site's name as its alt text, and the site's name
(`og:site_name`), `og:type` `website`, and its language (`og:locale`, `en_US` or `ja_JP`), under
its own title, description, and URL. Dictionary, search, and browse pages keep these too. X shows a
large image card, with the page's Open Graph title, description, and image. The image is the
brand's Open Graph card (`assets/brand/web/social/open-graph-1200x630.png`), compressed to about
41 KB.

- Source: #875; F3 in #871 (41,461 pages without a full Open Graph set, and no `og:image`).
- Check: `src/lib/metadata.test.ts`, "every page shares with the full Open Graph set and a large
  image card"; `src/lib/seo.test.ts`, "Open Graph names the language of the page"; Sharing spec,
  "… shares with an image and a large card, and its description fits search results", on a word, a
  browse page, and About in both languages, and "the Open Graph image is served".

## Titles

**A title fits in 70 characters with the site's name.** Each title is followed by
" | Zenbu Japanese", and the whole fits in 70 characters:

- A frequency band is "«list»: most used Japanese words, «ranks»", such as "Visual novels: most
  used Japanese words, 9,001–10,000", the longest, at 70.
- The kanji hub is "Kanji lists by grade, JLPT level, and stroke count".
- A word page is titled with its headword and reading, "要る (いる) meaning", unless that would
  pass 70 characters; then it has the headword alone, as
  特定独立行政法人等の労働関係に関する法律 does.
- A search results page shortens its query, at its last space and with "…", when the title would
  pass 70 characters; a query can be 200 characters long.

- Source: #877; F6 in #871 (38 frequency bands, the kanji hub, and four word pages over 70); #882's
  review (long search queries).
- Check: `src/lib/dictionary/word-snippet.test.ts`, "leaves the reading out when the title with it
  would pass 70 characters"; `src/lib/snippets.test.ts`, "a title too long for its text shortens the
  text, and marks the cut"; `src/app/[locale]/dictionary/search/[query]/page.test.ts`, "a long query
  is shortened in the title, to keep it within 70 characters";
  `src/app/[locale]/dictionary/browse/snippets.test.ts`, "every ranked list’s every band is titled
  within 70 characters, at its widest ranks" and each kind of browse page; browse-lists spec, "a
  ranked list shows its first band’s words, …"; browse spec, "the JLPT kanji lists are Waller’s,
  credited under CC BY".

## Descriptions

**A description is 110 to 160 characters.** A page's description starts from what the page says
of itself, then adds sentences written for its description only, until it reaches 110 characters;
a sentence that would take it past 160 is skipped, and the next tried. The last is the same for
every page: "Free on the web and in the iPhone app." (in Japanese, that Zenbu Japanese's
dictionary is free on the web and in the app), true of the web dictionary and of the app, which
the App Store lists as free. A description that starts past 160 is cut at its last space, comma,
or 、 in the second half of the limit (otherwise where the limit falls), with "…". The page itself shows what it did before.

- Source: #876; F4 and F5 in #871 (36,544 pages under 110 and 2,230 over 160).
- Check: `src/lib/snippets.test.ts`, "fittedDescription" and "shortened";
  `src/app/[locale]/dictionary/browse/snippets.test.ts`, "every kind of browse page fits search
  results", in both languages.

**What each kind of page adds:**

| Page | Starts from | Then adds |
| --- | --- | --- |
| Word | Its meaning and part of speech | What the page has: its reading, every meaning, pitch accent, kanji, conjugations, and how many example sentences, as the word has them |
| Search results | How many words it found | That each word opens to its pitch accent, kanji, conjugations, and examples |
| Kana list | How many words start with the kana | That they're in kana order, with furigana, meaning, and how common each is |
| Category list | How many words JMdict marks so | The category's explanation, as the page shows it |
| JLPT list | How many words Waller lists for the level | That the levels are unofficial estimates, the long or the short way |
| Frequency band | The list's source and the band's ranks | That each word has its reading, meaning, and other lists' ranks |
| Kanji list | Its first sentence | That JLPT levels are estimates, on a JLPT list; that each kanji opens its search page |
| Browse hub, kana charts, category indexes | Their description | That every list links each word to its page |
| Kanji hub, frequency hub | Their description | Only the closing sentence |

**A word's description says what the page has, as far as it fits.** When the features sentence
doesn't fit, it drops a feature at a time, in this order: every meaning, the reading, kanji, pitch
accent, and conjugations, so a word with many features names its examples last of all ("See its
100 example sentences in the Zenbu Japanese dictionary."). When the meaning alone takes the
description past 160 characters, it loses glosses from its end, never splitting one in
parentheses, before anything is cut: 路頭に迷う keeps its first three meanings.

- Source: #876.
- Check: `src/lib/dictionary/word-snippet.test.ts`, "a word page’s description", with エゴ,
  行く, 路頭に迷う, and 特定独立行政法人等の労働関係に関する法律 in both languages.

**Static pages and tools are written to fit.** Each static page's and each tool's description,
in both languages, is written from what the page says, in 110 to 160 characters.

- Source: #876.
- Check: `src/lib/pages.test.ts`, "describes every page and tool in 110 to 160 characters, in every
  language"; home, tools, and product-page specs compare each page's description with its source.

**Known exceptions.** A category list in kana order is `noindex`, and its explanation often
doesn't fit beside its count, so its description can stay under 110 characters.
