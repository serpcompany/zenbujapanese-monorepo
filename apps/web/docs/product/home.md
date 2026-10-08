# Homepage

The homepage, `/`, leads with the iPhone app and puts the free web dictionary right under it. It
follows the #648 mockups' Home page (hero A, app first, chosen on 2026-10-08) in the site's stock
shadcn styles, and #651. Each behavior below says what the page does, where it comes from, and the
automated check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

Abbreviations: **Home spec** is `apps/web/e2e/home.spec.ts`, the homepage's browser tests at a
desktop and a phone width, and **Claims spec** is `apps/web/e2e/claims.spec.ts`. **App docs** is
[`apps/ios/docs/product/`](../../../ios/docs/product/index.md). Web paths are under `apps/web/`.
The page's sections, with their headings and lines, are in `src/components/home/`; the example
searches are in `src/lib/home.ts`, the app's areas in `src/lib/app-areas.ts`, and the data the
drawn previews use in `src/lib/home-previews.ts`.

## Sections

**Hero.** A badge, "For iPhone · Offline dictionary", the heading "Understand the Japanese you
meet", a line on what the app does, then two buttons: **Get the app** and **Search the
dictionary**, which opens `/dictionary/`. Under them, the fine print reads only Works offline.
Beside the text (below it on phones) are two App Store screenshots, overlapped: the search results
for taberu and the word page for 大丈夫. Get the app is the header's button (`GetAppButton`), so it
opens the same link target in `linkTargets` (`src/lib/site.ts`): the iPhone app's page,
`/products/zenbu-japanese-app/` ([Products pages](products.md)).

- Source: #651; #648 decision and mockups (Home, hero A); #668 (Works offline only).
- Check: Home spec, "the hero leads with the app, with Get the app and Search the dictionary".

**Try the dictionary.** A card with the dictionary's search box, the same form as `/dictionary/`'s
(`src/components/dictionary/search-form.tsx`), which opens the query's search page, and four
example searches, each linking to its search page: 大丈夫, taberu, 峠, and to persevere.

- Source: #651; #648 mockups.
- Check: Home spec, "the Try the dictionary box opens the search page" and "each example search
  opens its search page".

**Area showcase.** "One app for reading, watching, and talking" ("Five areas, and one dictionary
behind all of them"), as on github.com: one wide stage, a tab bar under it, and under the bar the
chosen area's one-line pitch and four points, in two columns from 768 pixels. The five tabs are
the app's big areas: Dictionary, Image Search, Translate, Player, and Lists. Each area has its own
list of screens on the stage:

- Dictionary: the App Store screenshots of search results for taberu, 大丈夫's word page, 頑張る's
  conjugations, 峠's kanji page, and handwriting.
- Image Search: a shop's note with every word marked, a ramen menu with 醤油 open, and the note
  translated.
- Translate: a conversation.
- Player: a drawing of the Player from real app data (the Tatoeba sentences おはようございます。 and
  今日は天気がいいですね。 as caption cards with their times, the second being spoken with 天気
  tapped, its word sheet open, and the known-words line from the app docs' example, 73% 38 of 52
  words known), then each video in `appVideos` (`src/lib/videos.ts`), as the product page's click-to-load card:
  nothing from YouTube loads before it's played. There are no videos yet, so the drawing is alone.
- Lists: the Favorites list from the App Store screenshot, with 美味しい and 大丈夫 known; the
  frequency packs, JLPT Levels and YouTube first, and 食べる's JLPT N5 and YouTube 165 chips; and
  弱肉強食, live: 肉 starts highlighted, and tapping another kanji moves the highlight to it and its
  part of the reading, as on a word page ([Dictionary](dictionary.md#word-page)).

When an area's screens don't all fit, the next one peeks in at the right edge, faded, and arrows at
the stage's edges and one dot per screen page through them, a screen at a time; on a touch screen
they also swipe. From 1,024 pixels three screenshots fit at a time, cropped at the stage's foot as
in the mockups. Narrower, each is sized to show whole, which is two at a time on a phone and three
or four on a tablet; a phone shows one Lists preview at a time. The dots of the screens in view are
current. Each dot is a 24-pixel tap target, though it draws smaller (#682). The arrows are in
the keyboard's tab order and the dots aren't; anything inside a screen that takes focus, such as the 弱肉強食 kanji or a video's Play button, is too. Nothing moves on its
own, and a video playing in an area stops when another area is chosen. The tabs are stock shadcn
tabs: arrow keys, Home, and End move between them and choose the area. Below 640 pixels the tabs fill the bar, each an icon
above its name, so all five fit a phone; from 640 pixels they are a pill bar, each an icon beside
its name. The server renders every area's tab, text, and screens; a tab only shows its area and
hides the others, which keep their place, so the page doesn't move when the area changes. The
showcase is one component, `src/components/area-showcase.tsx`, that takes a list of areas; the
homepage's are in `src/lib/app-areas.ts`.

- Source: #665; the owner's Clipy recording (1:47–4:12); #648 mockups v50, Showcase A; App docs
  (`dictionary.md`, `translate.md`, `player.md`, and `index.md`: Lists, Known Words, Frequency
  Dictionaries, Furigana kanji highlight).
- Check: Showcase spec (`e2e/showcase.spec.ts`), "each tab shows its own area", "the tabs work by
  keyboard", "the arrows and dots page through the Dictionary screens, and the next one peeks in",
  "nothing advances on its own", "every area fits the window, with all five tabs in view",
  "choosing an area doesn’t move the page below the showcase", "at 412, 700, and 900 pixels each
  Dictionary screen in view shows whole", "tapping a kanji in 弱肉強食 moves the highlight to its
  part of the reading", and, without JavaScript,
  "every area's text and screens are in the server HTML"; `src/components/home/home-areas.test.tsx`
  (the Player's video card only with videos, and nothing from YouTube before a click);
  `src/components/area-showcase.interaction.test.tsx`, "a video playing in an area stops when
  another area is chosen";
  `src/lib/home-previews.test.ts`, "the homepage draws 食べる as the dictionary has it", against the
  dictionary fixtures. The other words, the drawings' look, and the dots' size: No automated check
  yet.

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

**Closing.** A dark block: "Your Japanese stays yours." and three promises, each with a small
preview: Works offline (峠 looked up in airplane mode), No account, no ads (lists, notes, known
words, and saved conversations stay on the iPhone), and Built on open data: JMdict, KANJIDIC2,
Tatoeba, KanjiVG, JLPT levels, and TUBELEX, each linking to its project and its licence, from
`pageSources.home` in `src/lib/dictionary/sources.ts`, so the page credits the JMdict and
frequency data its previews show, and a link to `/sources/`. In each promise the heading
comes first in the page, and the preview is drawn above it.
Then the app, Zenbu Japanese for iPhone, with Get the app, which opens the iPhone app's page, and
All products, which opens `/products/`.

- Source: #651; #648 mockups; the Privacy Policy (no account and no advertising).
- Check: Home spec, "the closing block credits the open data, then offers the app".

**Placeholders.** All free tools links to `#` through `linkTargets`, like the header's
([Dictionary](dictionary.md#header-footer-and-site-wide), Placeholder links). Get the app and All
products link to their pages through the same entries.

- Source: the owner's decision on #650 (show planned items as placeholders); #652 (the products
  pages).
- Check: `e2e/placeholders.spec.ts`, which visits `/` at both widths.

## Claims

Every claim on the page is one the app's product docs make:

| Claim | App docs |
| --- | --- |
| Works offline; look up any word offline; the dictionary is on your iPhone | `dictionary.md`, opening (bundled data) |
| Image Search: a photo, the library, or a file; text across or down the page, even with English around it; tap a word and the photo stays in view; Translate for the whole passage | `dictionary.md`, Search and Image Search |
| Handwriting reads the finished shape in any stroke order; radicals | `dictionary.md`, Search |
| Search in Japanese, romaji, or English, conjugated forms included | `dictionary.md`, Search |
| Furigana, pitch accent, conjugations with meanings, kanji readings and stroke order, example sentences | `dictionary.md`, Dictionary and kanji details |
| Translate: two people, either language in any order, shown as it's spoken, read aloud after a pause; Listening for a TV, a guide, or announcements; on the iPhone after a one-time download | `translate.md` |
| Player: paste a link or search YouTube, captions under the video that follow it, tap a word to pause and open it, repeat a line, step line by line, 0.5× | `player.md` |
| Lists, Known Words, and hiding furigana on known words in example sentences and captions | `index.md`, Account; `dictionary.md`, Dictionary and kanji details; `player.md`, Watching |
| Frequency packs order equally good matches, in the order the learner chooses | `dictionary.md`, Search; `index.md`, Account (Frequency Dictionaries) |
| Tap a kanji to see which part of the reading belongs to it | `index.md`, Furigana kanji highlight |
| Lists: keep the words you meet, saving words and kanji to your own lists, and mark the ones you know | `index.md`, Account (Lists, Known Words); `dictionary.md`, Dictionary and kanji details (Mark as Known, Add to List) |
| No account, no ads; lists, notes, known words, and saved conversations stay on the device | `index.md`, Account (Lists, Known Words); `dictionary.md`, Dictionary and kanji details (notes); `translate.md`, Translations; the Privacy Policy |

Outside the closing block, the page doesn't say the app needs no account, that anything stays on
the iPhone, or that it's built on open data, since accounts and sync are coming (#468, #574), and
neither does its description.

- Source: #668.
- Check: Claims spec, "the homepage makes none above its closing block".

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
the Free on the web band and the closing block running the window's full width. No width scrolls
sideways.

- Source: #648 mockups (Width switch).
- Check: `e2e/layout.spec.ts`, "/ fits the window, with the site's header and footer". Desktop,
  tablet, and phone layouts: checked by hand with `verify-web`.
