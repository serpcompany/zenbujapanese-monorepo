# Homepage

The homepage, `/`, leads with the iPhone app and puts the free web dictionary right under it. It
follows the #648 mockups' Home page (hero A, app first, chosen on 2026-10-08) in the site's stock
shadcn styles, and #651. Each behavior below says what the page does, where it comes from, and the
automated check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

Abbreviations: **Home spec** is `apps/web/e2e/home.spec.ts`, the homepage's browser tests at a
desktop and a phone width. **App docs** is [`apps/ios/docs/product/`](../../../ios/docs/product/index.md).
Web paths are under `apps/web/`. The page's sections, with their headings and lines, are in
`src/components/home/`; the features, the app's extras, the example searches, and the data the
previews draw are in `src/lib/home.ts` and `src/lib/home-previews.ts`.

## Sections

**Hero.** A badge, "For iPhone · Offline dictionary", the heading "Understand the Japanese you
meet", a line on what the app does, then two buttons: **Get the app** and **Search the
dictionary**, which opens `/dictionary/`. Under them: No account, No ads, and Your words stay on
your iPhone. Beside the text (below it on phones) are two App Store screenshots, overlapped: the
search results for taberu and the word page for 大丈夫. Get the app is the header's button
(`GetAppButton`), so it opens the same link target, the App Store's placeholder in `linkTargets`
(`src/lib/site.ts`), until that address is known.

- Source: #651; #648 decision and mockups (Home, hero A).
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

**Also in the app.** Four cards, each with a preview drawn in HTML from real app data: Watch
YouTube in Japanese (two caption lines from Tatoeba, おはようございます。 and 今日は天気がいいですね。,
with 天気 open), Lists and Known Words (the Favorites list from the App Store screenshot, with
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

**Free on the web.** The web tools that exist today, each opening its page: the Tools menu's
links that aren't placeholders, with the menu's descriptions and marks
(`src/lib/site-menus.ts`), so a converter joins the list when its page ships. Today they are
Dictionary (`/dictionary/`), Kana charts, Kanji lists, and Frequency lists (under
`/dictionary/browse/`). Then All free tools, the tools index's placeholder. Beside them is a
browser drawn around the search page for taberu, with 食べる's word card in front of it.

- Source: #651; #648 mockups and their notes (only pages that exist today).
- Check: Home spec, "the free web tools link to pages the site has, with no redirect".

**Closing.** A dark block: "Your Japanese stays yours." and three promises, each with a small
preview: Works offline (峠 looked up in airplane mode), No account, no ads (lists, notes, known
words, and saved conversations stay on the iPhone), and Built on open data (JMdict, KANJIDIC2,
Tatoeba, and KanjiVG with their licences, from `pageSources.home` in
`src/lib/dictionary/sources.ts`, the list the Sources page credits, and a link to `/sources/`).
Then the app, Zenbu Japanese for iPhone, with Get the app and All products, the products index's
placeholder.

- Source: #651; #648 mockups; the Privacy Policy (no account and no advertising).
- Check: Home spec, "the closing block credits the open data, then offers the app".

**Placeholders.** Get the app, All free tools, and All products link to `#` through `linkTargets`,
like the header's ([Dictionary](dictionary.md#header-footer-and-site-wide), Placeholder links).

- Source: the owner's decision on #650 (show planned items as placeholders).
- Check: `e2e/placeholders.spec.ts`, which visits `/` at both widths.

## Claims

Every claim on the page is one the app's product docs make:

| Claim | App docs |
| --- | --- |
| Look up any word offline; the dictionary is on your iPhone | `dictionary.md`, opening (bundled data) |
| Image Search: camera or photos, text across or down the page, tap a word, Translate view | `dictionary.md`, Image Search |
| Handwriting reads the finished shape in any stroke order; radicals | `dictionary.md`, Search |
| Furigana, pitch accent, frequency, conjugations with meanings, kanji readings and stroke order, examples | `dictionary.md`, Dictionary and kanji details |
| Translate: two people, either language in any order, spoken aloud after a pause, on the iPhone after a one-time download | `translate.md` |
| Player: captions under the video, words open the dictionary, paste a link or search YouTube | `player.md` |
| Lists, Known Words, and hiding furigana on known words | `index.md`, Account |
| Frequency packs order equally good matches, in the order the learner chooses | `dictionary.md`, Search; `index.md`, Account (Frequency Dictionaries) |
| Tap a kanji to split its reading | `index.md`, Furigana kanji highlight |
| No account, no ads; lists, notes, known words, and saved conversations stay on the device | `index.md`, Account (Lists, Known Words); `dictionary.md`, Dictionary and kanji details (notes); `translate.md`, Translations; the Privacy Policy |

## Page

**Title, description, and canonical.** The page is titled "Zenbu Japanese: Japanese Dictionary
and Translator for iPhone", described by `/`'s entry in `src/lib/pages.ts`, and its own canonical
URL. Its Open Graph tags carry the same title and description, with the site's name, type, and
locale (`siteOpenGraph` in `src/lib/metadata.ts`). It is indexed, as every page is in production.

- Source: #651.
- Check: Home spec, "is titled, described, shared as the site, and its own canonical URL".

**Width.** The page's sections are at most 1,024 pixels wide (`max-w-5xl`), as the header is, with
the Free on the web band and the closing block running the window's full width. No width scrolls
sideways.

- Source: #648 mockups (Width switch).
- Check: `e2e/layout.spec.ts`, "/ fits the window, with the site's header and footer". Desktop,
  tablet, and phone layouts: checked by hand with `verify-web`.
