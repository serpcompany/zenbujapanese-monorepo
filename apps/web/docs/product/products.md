# Products pages

The products catalog, `/products/`, lists everything Zenbu makes or plans, and each product has a
page under `/products/<name>/`. The first is the iPhone app's,
`/products/zenbu-japanese-for-iphone/`. Both follow the #648 mockups (Products page and Product
page) and the owner's decisions on #652: the product page's address, and planned products shown
as Coming soon rather than hidden. Every claim about the app comes from the app's product docs
([`apps/ios/docs/product/`](../../../ios/docs/product/index.md)), and the screenshots are the App
Store set (`apps/ios/screenshots/app-store/en-US/iphone-63/`), shown as rounded screens without a
device frame (`src/components/app-screenshot.tsx`).

Abbreviations: Web paths are under `apps/web/`. **Products spec** and **Product page spec** are
`e2e/products.spec.ts` and `e2e/product-page.spec.ts`, the browser tests of these pages at a
desktop and a phone width, and **Claims spec** is `e2e/claims.spec.ts`. The catalog's data is in
`src/lib/products/catalog.ts`, and the iPhone app's page's in
`src/lib/products/zenbu-japanese-for-iphone.ts`.

## Products catalog

**Layout.** The page opens with a cluster of product icons around the app's icon (decorative,
hidden from screen readers), the heading Products, a line about them, a search box, and the type
filters. Below, the current filter's name and a line about it head one grid of cards: one column
on phones, two from 768 pixels. Zenbu Japanese for iPhone leads as a wide card across the grid,
with the App Store's Image Search and word screenshots, its iPhone and Works offline tags, a
two-column list of what it includes, Get the app, and Learn more.

- Source: #648 mockups (Products page); #652.
- Check: Products spec, "lists every product, the iPhone app first, with the All filter current";
  `e2e/layout.spec.ts`, "/products/ fits the window, with the site's header and footer".

**Products.** After the iPhone app, the catalog lists the Browser extension; the free tools
(Zenbu Japanese Dictionary, Kana charts, Kanji lists, Frequency lists, and Converters); the
reference guides (Kana chart PDF, Verb conjugations PDF, and JLPT N5 kanji PDF); and the course,
Japanese from real clips (#623). Each card shows its icon, name, a Free or Coming soon badge, a
line about it, and its facts and type. A free tool's card opens its page: the dictionary home,
and the kana, kanji, and frequency browse pages. A planned product is a Coming soon card that
isn't a link, so it adds no `#` link (the owner's decision on #652). The iPhone app's Get the app
is the App Store placeholder, and Learn more opens its page.

- Source: #648 mockups (Products page) and its notes; the owner's decision on #652 (show planned
  products as Coming soon).
- Check: `src/lib/products/catalog.test.ts`, "a product without a page of its own is coming
  soon, and the others link to the site"; Products spec, "a free tool’s card opens its page, and
  a coming-soon card is not a link" and "the iPhone app’s Learn more opens its page, and its Get
  the app is the App Store placeholder".

**Filters.** All, Apps, Extensions, Free tools, Reference guides, and Courses are links, each to
its own address: `/products/` for All, and `/products/?type=<type>` for the others
(`?type=free-tools`, for example). The current one is filled and marked as the current page.
Choosing one shows only that type's cards, changes the heading and its line, and moves the
address to its link without reloading, so Back returns to the filter before. Opening a filter's
link shows the catalog filtered. The server renders every product into the page whatever the
address says, and the filters only hide cards in the browser, so search engines see the whole
list; a filtered address is canonical to `/products/`.

- Source: #648 decision and mockups (Products page); #652.
- Check: `src/lib/products/catalog.test.ts`, "each filter has its own link, and All is the
  catalog itself" and "every filter shows at least one product, and All shows them all"; Products
  spec, "each filter shows only its products, under its own heading, at its own link", "the …
  filter's link opens the catalog filtered" for each filter, "going back returns to the filter
  before", and "the server renders every product whichever filter the address names"; Product
  page spec, "/products/?type=free-tools has its title, description, and canonical URL".

**Search.** The search box (Search products) narrows the cards as you type, within the current
filter: a card stays when its name, line, type, and, for the iPhone app, its tags and what it
includes, hold every word typed, in any case. When none do, the page says No products match “…”,
with Clear search, which empties the box and brings the cards back. ⌘K, or Ctrl+K, focuses the
box from anywhere on the page; the box shows ⌘K except on touch screens.

- Source: #648 mockups (Products page), after keybumps.app/plugins.
- Check: `src/lib/products/catalog.test.ts`, "matches every word of the query, in any case,
  within the filter"; Products spec, "search narrows the cards within the current filter", "a
  search that matches nothing says so, and Clear search brings the cards back", and "⌘K or Ctrl+K
  focuses the search".

## Product page

The iPhone app's page is the template for every product page: each section is a component in
`src/components/products/` that takes the product's data.

**Hero.** Centered: a breadcrumb (Products, then the product), the app icon, the name (Zenbu
Japanese), Japanese dictionary and translator for iPhone, a line about the app, and Get the app,
which is the App Store placeholder. Get the app in the header and the phone menu, and in the
prompt that the word page's app-only actions open, now opens this page instead (the mockup's
note).

- Source: #648 mockups (Product page, Hero: centered + demo) and their notes; #652.
- Check: Product page spec, "leads with the app, its Get the app button to the App Store
  placeholder, and the facts" and "the header’s Get the app opens this page";
  `src/components/site-header.test.tsx`, "from 1024 pixels Get the app and the account button
  end the header, Get the app opening the iPhone app’s page".

**Demo.** Under the hero, a panel shows one feature at a time: its icon and name, a heading, a
line, and its App Store screenshot, side by side from 768 pixels and stacked on phones. The five
are Search, Image Search, Handwriting, Conjugations, and Translate. Previous and next arrows step
through them, wrapping from the last to the first; a dot for each, named for its feature, opens
it and is marked current, each with a 24-pixel target; and a count says which it is (2 / 5), and
is announced as it changes. Only the shown feature is in the accessibility tree, under a heading,
Features, for screen readers. It is the shadcn carousel (Embla), so a swipe moves it, and so do
the arrow keys while one of its controls has focus.

- Source: #648 mockups (Product page, Hero: centered + demo).
- Check: Product page spec, "the demo shows one feature at a time, and its arrows step through
  them" and "each of the demo’s dots opens its feature and marks itself current".

**Facts.** A row under the demo: Platform (iPhone) is written on the page. After it, Requires (iOS
… or later) and Version come from Apple's App Store lookup
(`https://itunes.apple.com/lookup?bundleId=com.zenbujapanese.app`), so they match what's live on
the App Store, not TestFlight: two to a row on phones, with Version centered under them, and all
three in one row from 768 pixels. The page renders per request, and the Worker keeps Apple's
answer in its edge cache for a day (`src/lib/app-store.ts`). The row streams in after the rest of
the page, which shows Platform until Apple answers, so a slow lookup (at most 3 seconds) never
holds the page back. When Apple can't be reached, answers with an error, or lists no app, as before
the app is on the store, those two facts are left out and the row shows Platform alone, centered;
a failure logs `app_store_lookup_failed`, and is kept for 5 minutes, so the next views don't wait
on Apple again.

- Source: #648 decision; the owner's decision on #652 (cached for a day, left out when Apple can't
  be reached or returns nothing); #668 (no Account fact).
- Check: `src/lib/app-store.test.ts` ("reading the App Store lookup" and "asking Apple");
  `src/components/products/product-facts.test.tsx`, "the facts row adds the version and minimum
  iOS that Apple’s lookup gives" and "the facts row leaves out the version and minimum iOS when
  Apple can’t be reached" and "… when Apple returns nothing".

**See it in action.** A band of seven App Store screenshots, each with a caption: search, the word
page with its pitch accent, Image Search, handwriting, kanji details, conjugations, and
Translate. Previous and next arrows by the heading scroll it, each turning off at its end, and the
row fades at its right edge. It is the same shadcn carousel as the demo.

- Source: #648 mockups (Product page).
- Check: Product page spec, "the screenshot carousel scrolls with its arrows, from the first
  screenshot to the last".

**Watch it work.** The section appears once videos exist: there are none yet, so today the page
has no Watch it work section and the hero no Watch demo button, and neither leaves a link or a
heading behind. The videos are one list, `appVideos` in `src/lib/videos.ts`: each a YouTube ID,
a title, and a thumbnail hosted on this site (an App Store screenshot for now). With videos, the
section follows What's inside: a centered heading, then the video cards on the same shadcn
carousel as the screenshots, fading at its right edge, with previous and next arrows either side
of See all videos, which is the `/videos/` placeholder until that page exists; the hero's Watch demo, beside Get the app, leads to the section. A card shows
only its thumbnail and title, and nothing from YouTube loads (no player, thumbnail, or script)
until it's clicked; the click puts YouTube's privacy-enhanced player
(`https://www.youtube-nocookie.com/embed/<id>`) in the card's place, playing.

- Source: #648 mockups (Product page, Watch it work, after Raycast's video row); the owner's
  decision on #652 (the section appears only when there are videos, with none yet).
- Check: `src/components/products/product-videos.test.tsx`, "there are no videos yet, so the page
  has no video section and no Watch demo" and "with videos, Watch it work lists them and links to
  all videos, and Watch demo leads there"; `src/components/products/product-videos.interaction.test.tsx`,
  with a sample video, "a video shows our own thumbnail and asks YouTube for nothing until it is
  played" and "playing a video loads the privacy-enhanced YouTube player in its place"; Product
  page spec, "with no videos yet, the page has no Watch it work and no Watch demo, and asks
  YouTube for nothing".

**What's inside, Questions, and More from Zenbu.** What's inside lists eight features (Offline
dictionary, Image Search, Handwriting, Translate, Player, Lists and Known Words, Frequency
dictionaries, and Furigana kanji highlight), four to a row from 1024 pixels. Questions is
centered: three questions that open and close (Does it work offline?, Which frequency lists does
it use?, and Is the web dictionary the same?), the first open, with every answer in the page's
HTML while closed; the last says the web dictionary has the app's entries, and which features are
only in the app, and links to the dictionary. The offline dictionary's "more than
200,000 words" is the app's own dictionary, which the site's word pages are built from (218,382
words, [`docs/agents/web.md`](../../../../docs/agents/web.md), Sitemaps). More from Zenbu shows the
dictionary, the browser extension, and kana charts as catalog cards, with All products.

- Source: #648 mockups (Product page); the app's product docs for every claim.
- Check: Product page spec, "lists what’s inside and the questions, the first one open" and "More
  from Zenbu leads to the other products and the catalog".

**Claims.** The page doesn't say the app needs no account, that anything stays on the iPhone, or
that it's built on open data, since accounts and sync are coming (#468, #574), and neither does
its description.

- Source: #668.
- Check: Claims spec, "/products/zenbu-japanese-for-iphone/ makes none".

## Site-wide

**Titles, descriptions, and canonical URLs.** `/products/` is "Products | Zenbu Japanese" and the
iPhone app's page "Zenbu Japanese for iPhone: Japanese Dictionary & Translator", each with its
description from `src/lib/pages.ts` and its own canonical URL. Their Open Graph tags carry the
same title and description, with the site's name, type, and locale (`siteOpenGraph` in
`src/lib/metadata.ts`, which `pageMetadata` adds to every page it describes). Both are in `src/lib/pages.ts`, so
`/sitemap-pages.xml` lists them, and the HTML sitemap lists them under Home
(`homeTree` in `src/lib/dictionary/browse/site-tree.ts`).

- Source: #652.
- Check: Product page spec, "… has its title, description, and canonical URL" for each page;
  `src/app/routes.test.ts`.

**Layout.** Neither page scrolls sideways at a desktop or a phone width.

- Check: `e2e/layout.spec.ts`, for `/products/` and `/products/zenbu-japanese-for-iphone/`.
