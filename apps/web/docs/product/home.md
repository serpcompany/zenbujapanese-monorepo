# Homepage

The homepage, `/`, leads with the iPhone app and puts the free web dictionary right under it. It
follows the #648 mockups' Home page (hero A, app first, chosen on 2026-10-08) in the site's stock
shadcn styles, and #651. Each behavior below says what the page does, where it comes from, and the
automated check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

Abbreviations: **Home spec** is `apps/web/e2e/home.spec.ts`, the homepage's browser tests at a
desktop and a phone width, and **Claims spec** is `apps/web/e2e/claims.spec.ts`. **App docs** is
[`apps/ios/docs/product/`](../../../ios/docs/product/index.md). Web paths are under `apps/web/`.
The page's sections, with their headings and lines, are in `src/components/home/`; the features,
the app's extras, the example searches, and the data the previews draw are in `src/lib/home.ts`
and `src/lib/home-previews.ts`.

## Sections

**Hero.** A badge, "For iPhone · Offline dictionary", the heading "Understand the Japanese you
meet", a line on what the app does, then two buttons: **Get the app** and **Search the
dictionary**, which opens `/dictionary/`. Under them, the fine print reads only Works offline.
Beside the text (below it on phones) are two App Store screenshots, overlapped: the search results
for taberu and the word page for 大丈夫. Get the app is the header's button (`GetAppButton`), so it
opens the same link target in `linkTargets` (`src/lib/site.ts`): the iPhone app's page,
`/products/zenbu-japanese-for-iphone/` ([Products pages](products.md)).

- Source: #651; #648 decision and mockups (Home, hero A); #668 (Works offline only).
- Check: Home spec, "the hero leads with the app, with Get the app and Search the dictionary".

**Try the dictionary.** A card with the dictionary's search box, the same form as `/dictionary/`'s
(`src/components/dictionary/search-form.tsx`), which opens the query's search page, and four
example searches, each linking to its search page: 大丈夫, taberu, 峠, and to persevere.

- Source: #651; #648 mockups.
- Check: Home spec, "the Try the dictionary box opens the search page" and "each example search
  opens its search page".

**Features.** "One app for reading, writing, and talking": Image Search, Handwriting, Dictionary,
and Translate, each a small label, a heading, a paragraph, and an App Store screenshot without a
device frame, cropped to the part that shows the feature. From 768 pixels the text and the
screenshot sit side by side, the screenshot's side alternating; on phones the text comes first.

- Source: #651; #648 mockups (Feature details: none).
- Check: Home spec, "shows the four features, then the four more things in the app". The
  alternating layout: No automated check yet.

**Also in the app.** Four cards, each a heading and a line under a preview drawn in HTML from real
app data: Watch YouTube in Japanese (the Tatoeba sentence 今日は天気がいいですね。 as the caption
being spoken, each word underlined as the app splits it, and 天気's word sheet open), Lists and
Known Words (the Favorites list from the App Store screenshot, with
美味しい and 大丈夫 known), Frequency dictionaries (the app's packs, JLPT Levels and YouTube first,
and 食べる's JLPT N5 and YouTube 165 chips), and Tap a kanji to split its reading (弱肉強食, as the
app splits it). The last is live: 肉 starts highlighted, and tapping another kanji moves the
highlight to it and its part of the reading, as on a word page
([Dictionary](dictionary.md#word-page)). From 1,024 pixels the cards are three columns, with the
list card two rows tall.

- Source: #651; #648 mockups; App docs index (Furigana kanji highlight, Lists, Known Words,
  Frequency Dictionaries), `player.md`.
- Check: Home spec, "shows the four features, then the four more things in the app" and "tapping a
  kanji in 弱肉強食 moves the highlight to its part of the reading"; `src/lib/home-previews.test.ts`,
  "the homepage draws 食べる as the dictionary has it", against the dictionary fixtures. The other
  words, and the previews' look: No automated check yet.

**Free on the web.** A line: no download, and every word has its own page. Then the web tools
that exist today, each opening its page: the Tools menu's links that aren't placeholders, with
the menu's descriptions and marks (`src/lib/site-menus.ts`), so a converter joins the list when
its page ships. Today they are Dictionary (`/dictionary/`), Kana charts, Kanji lists, and
Frequency lists (under `/dictionary/browse/`). Then All free tools, the tools index's
placeholder. Beside them is a browser drawn around the search page for taberu, with 食べる's word
card in front of it.

- Source: #651; #648 mockups and their notes (only pages that exist today); #668 (the line
  drops "and no account").
- Check: Home spec, "the free web tools link to pages the site has, with no redirect".

**Page end.** The page ends with one card, then the footer, after shadcnstudio's CTA 16, on a
light band (a slightly darker band in dark mode) with a rule above it. The card is white (the card
colour in dark mode) with rounded corners. On the left: the heading "Everything you need to read
Japanese, in one app.", the line "Dictionary, Image Search, Translate, and Player on your iPhone.",
and Get the app, the site's button with its phone icon, which opens the iPhone app's page
(`/products/zenbu-japanese-for-iphone/`) through the `iphone-app` entry in `linkTargets`, as the
header's does. On the right, a tilted two-column collage of cards, one per part of the app
(Dictionary, Image Search, Translate, Conjugations, Kanji, and Pitch accent, from
`src/lib/app-parts.ts`), each an App Store screenshot crop, a name, a line, and Learn more; it
bleeds off the card's top and bottom edges, is drawn for the eye only (hidden from screen readers,
and nothing in it is a link), and the card is at most 20rem tall. On phones the collage is a band
about 9rem tall across the top of the card, with the copy below it. Under the card, a Sources
disclosure credits the open data the page's previews show (`pageSources.home` in
`src/lib/dictionary/sources.ts`: JMdict, KANJIDIC2, Tatoeba, KanjiVG, JLPT levels, and TUBELEX), as
the dictionary pages credit theirs. The dark "Your Japanese stays yours" block, with its offline,
no-account, and open-data promises, is gone.

- Source: #664 and its mockups (v50, Page end 16); the owner's choice of the site's Get the app
  button over Apple's App Store badge.
- Check: Home spec, "the page ends with one card: its heading, a line, and Get the app, then the
  footer" (the card's height from 1024 pixels, the collage's place at both widths, the Sources
  credits, and Get the app's page).

**Placeholders.** All free tools links to `#` through `linkTargets`, like the header's
([Dictionary](dictionary.md#header-footer-and-site-wide), Placeholder links). Get the app links to
its page through the same entries.

- Source: the owner's decision on #650 (show planned items as placeholders); #652 (the products
  pages).
- Check: `e2e/placeholders.spec.ts`, which visits `/` at both widths.

## Claims

Every claim on the page is one the app's product docs make:

| Claim | App docs |
| --- | --- |
| Works offline; look up any word offline; the dictionary is on your iPhone | `dictionary.md`, opening (bundled data) |
| Image Search: camera or photos, text across or down the page, tap a word, Translate view | `dictionary.md`, Image Search |
| Handwriting reads the finished shape in any stroke order; radicals | `dictionary.md`, Search |
| Furigana, pitch accent, frequency, conjugations with meanings, kanji readings and stroke order, examples | `dictionary.md`, Dictionary and kanji details |
| Translate: two people, either language in any order, spoken aloud after a pause, on the iPhone after a one-time download | `translate.md` |
| Player: captions under the video, words open the dictionary, paste a link or search YouTube | `player.md` |
| Lists, Known Words, and hiding furigana on known words | `index.md`, Account |
| Frequency packs order equally good matches, in the order the learner chooses | `dictionary.md`, Search; `index.md`, Account (Frequency Dictionaries) |
| Tap a kanji to split its reading | `index.md`, Furigana kanji highlight |
| Pitch accent: hear how a word is said (the page end's collage) | `dictionary.md`, Dictionary and kanji details (the pitch capsule's speaker) |

The page doesn't say the app needs no account, that anything stays on the iPhone, or that it's
built on open data, since accounts and sync are coming (#468, #574), and neither does its
description.

- Source: #668; #664 (the closing block, which made those claims, is gone).
- Check: Claims spec, "/ makes none".

## Page

**Title, description, and canonical.** The page is titled "Zenbu Japanese: Japanese Dictionary
and Translator for iPhone", described by `/`'s entry in `src/lib/pages.ts`, and its own canonical
URL, written as the origin with no slash (`https://zenbujapanese.com`, and
`https://staging.zenbujapanese.com` on staging), as its `og:url` and the pages sitemap write it.
Its Open Graph tags carry the same title and description, with the site's name, type, and
locale (`siteOpenGraph` in `src/lib/metadata.ts`). It is indexed, as every page is in production.

- Source: #651; #663 (the SERP URL trailing-slash standard's homepage rule).
- Check: Home spec, "is titled, described, shared as the site, and its own canonical URL";
  `src/components/origin-canonical.test.tsx` (each environment's origin); smoke "canonical tags
  name …, the homepage with no slash".

**Width.** The page's sections are at most 1,024 pixels wide (`max-w-5xl`), as the header is, with
the Free on the web band and the page end's band running the window's full width. No width scrolls
sideways.

- Source: #648 mockups (Width switch).
- Check: `e2e/layout.spec.ts`, "/ fits the window, with the site's header and footer". Desktop,
  tablet, and phone layouts: checked by hand with `verify-web`.
