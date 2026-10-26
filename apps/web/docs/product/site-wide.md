# Header, footer, and site-wide

What every page of the website shares: the header and its menus, the footer, the theme, the
Reading Aids, and the phone layout. Each behavior names its check, as in
[Dictionary](dictionary.md), whose abbreviations it uses (see [How behavior is
verified](index.md#how-behavior-is-verified)).


**Header.** The logo and the site name link home. From 1024 pixels the header shows the logo and
name, the Dictionary, Tools, Products, and Company menus, then Get the app and the round account
button (Account menu, below); the languages are in the footer ([Languages](languages.md)). Below
1024 pixels it shows the logo, the name left to screen readers, and a menu button (lucide `Menu`).
The header has no search and no email address: the Dictionary menu leads to the dictionary home,
whose box searches (#561). It stays pinned to the top of the window while the page scrolls, on the
page's background with its bottom rule, and a link to a heading on the page (such as a word's
`#conjugations`) stops below it.

- Source: #844 decision and mockups (Header switch); #650; #561 (no search in the header); #664
  and its mockups (v50, Header actions A: pinned, two items).
- Check: `src/components/site-header.test.tsx`, "below 1024 pixels the header has a menu button,
  and from 1024 the menus", "the header on %s has no search and no email address", and "the header
  stays pinned to the top as the page scrolls"; `apps/web/e2e/site.spec.ts`, "the header has the
  name, four menus, Get the app, and the account button, and no search" and "the header shows only
  the logo and the menu button, and fits a 320-pixel phone"; `apps/web/e2e/header.spec.ts`, "stays
  pinned to the top while the page scrolls"; smoke "the header links to the dictionary and has no
  search"; `apps/web/e2e/layout.spec.ts`, which checks that no page scrolls sideways at either
  width.

**Logo and icons.** The header, the phone menu, and the footer show the Zenbu mark,
`assets/brand/vector/zenbu-icon-flat-vector.svg` (served as `/zenbu-icon-flat-vector.svg`), in its
own colours in both themes, beside the site name. The favicon (`favicon.ico`, the SVG mark, and 16
and 32 pixel PNGs), the Apple touch icon, and the web app manifest (`site.webmanifest`, with its
192 and 512 pixel icons, plain and maskable, under `/icons/`) are copies of the files in
`assets/brand/web/`, named in every page's head (`siteIcons` and `siteManifest` in
`src/lib/metadata.ts`).

- Source: #664.
- Check: No automated check yet; checked by hand with `verify-web`.

**Account menu.** From 1024 pixels the round account button ends the header. Signed out it shows a
person (lucide `UserRound`) and is named "Account"; in a browser that signed in on the site, it
shows the learner's initials (from their name, or their email's first letter) and is named "Account,
signed in". The button keeps its size, so Get the app and the button stay in the same places either
way. Its menu, signed out, holds Log in and Create an account (the `login` and `register` entries in
`linkTargets`: `/login/` and `/register/` where the account pages are open, `#` placeholders where
they're closed); signed in, Your account (`/account/`), then Sign out, which signs this browser out
through the account service; an account page open in the browser, in this tab or another, then shows
signed out ([Account pages](account.md#your-account)). A sign-out the service refuses, or can't be
reached for, shows a toast with the reason and stays signed in. Both then hold the Reading Aids
(below) and end with the Theme row (Theme, below). It opens with a click, Enter, Space, or the Up
and Down keys; Up, Down, Home, and End move through its items, the Theme row's three icons among
them, Enter follows one, and Escape closes it and returns focus to the button. The server draws it
signed out, as it draws the footer's Sign in; the browser then reads the note it keeps when signed
in ([Account pages](account.md#pages)).

- Source: #664 and its mockups (v50, Header actions A); #468 (the account pages).
- Check: `src/components/site-header.test.tsx`, "from 1024 pixels Get the app and the account
  button end the header, Get the app opening the iPhone app’s page"; `apps/web/e2e/header.spec.ts`,
  "Get the app and the account button keep their places signed out and signed in", "signed out,
  the menu offers Log in and Create an account, then the theme, by keyboard", and "signed in, the
  menu leads to the account, then the theme, then Sign out, by keyboard", "signing out from the
  menu on the account page shows it signed out, with no reload", and "says so, and stays signed
  in" (when the service can't sign the browser out); `apps/web/e2e/account.spec.ts`, "the footer leads to signing in, and to the account once signed
  in, as the header shows the initials"; `src/lib/account/flows.test.ts`, "signing out of this
  browser counts a session already gone as signed out, and keeps any other failure";
  `src/lib/account/signed-in.test.ts`.

**Theme.** Light, Dark, and System, with System the default: the site follows the operating
system's setting, as it changes, until the learner chooses. The choice is kept in the browser's
local storage (`theme`), so it holds across pages and visits on that device. From 1024 pixels the
choice is the account menu's Theme row, three icons (lucide `Sun`, `Moon`, `Monitor`) whose
current one is marked, which stays open as the theme changes; below 1024 pixels it is the phone
menu's Theme button beside Close (shadcn's mode toggle: a sun that turns into a moon), whose menu
lists the three with the current one ticked and closes on a choice. A script in the page's HTML
applies the saved choice before anything is drawn, so a page never shows the other theme first
(next-themes, which the site's toasts already read). Every page uses the stock shadcn tokens in both
themes; text on the muted grey (the footer, the product page's demo, the homepage's previews) uses
`muted-surface` (`src/app/globals.css`), a slightly darker grey in light mode, so it keeps 4.5:1.

- Source: #664 and its mockups (v50, Theme switch).
- Check: `apps/web/e2e/theme.spec.ts`, "System is the default, and follows the operating system as
  it changes", "the choice survives a reload, whatever the operating system says", "the choice
  changes by keyboard, in the account menu or, on phones, the drawer", and "a saved choice is
  already applied, so the page never shows the other theme first"; `apps/web/e2e/contrast.spec.ts`,
  which runs axe's colour-contrast rule on every page type in `apps/web/e2e/page-types.ts` (every
  page in `src/lib/pages.ts`, the account pages, the tools pages, search, a word with its
  conjugation form and kanji open, kanji details, every kind of browse page, and a missing page), in
  both themes, at both widths, and on phones on the phone menu and each of its groups.

**Menus.** Dictionary, Tools, and Products are mega menus: a featured card, three columns, and a
footer line with a link. Company is a plain dropdown.

- **Dictionary:** a card with the App Store search screenshot that opens the dictionary home; Kana
  (Hiragana, Katakana), Word lists (JLPT vocabulary, which opens N5, and Frequency lists), and Kanji
  and grammar (Kanji by grade, Parts of speech); then Browse everything (`/dictionary/browse/`).
- **Tools:** a card drawn with kana that leads to all tools (`/tools/`); Reference (Dictionary, Kana
  charts), Lists (Kanji lists, Frequency lists), and Converters (Hiragana to Katakana, Romaji to
  Kana, and Kanji to Furigana, which open their pages); then All free tools
  ([Tools pages](tools.md)).
- **Products:** a card with the App Store word screenshot for Zenbu Japanese for iPhone, with Get
  the app; Apps (Zenbu Japanese for iPhone, Browser extension), Free (Zenbu Japanese Dictionary,
  Free tools), and Learn (Reference guides, Courses); then All products.
- **Company:** About, Sources, Support, Contact, and Legal.

A menu opens on click, hover, Enter, or Space, and closes on a second click, a click outside it,
Escape (focus goes back to its button), or following one of its links. Tab moves into the open menu.
Every menu link is in the page's HTML while the menu is closed, so search engines see them. The
menus sit under their buttons, as shadcn's navigation menu places them, and slide to stay inside the
window.

- Source: #844 decision and mockups (Header switch); #650.
- Check: `src/components/site-header.test.tsx`, "the Dictionary menu leads to the dictionary and its
  browse pages", "the Tools menu leads to the tools, the reference pages, and the converters,
  Kanji to Furigana among them", "the Products menu leads to the products pages and the web
  dictionary, and its planned pages are placeholders", and "the Company menu leads to About,
  Sources, Support, Contact, and Legal"; `apps/web/e2e/site.spec.ts`, for each menu, "the … menu
  opens and closes with a click", "the … menu opens with the keyboard and Escape closes it", and "a
  link in the … menu opens its page and closes the menu", and "every link in the header menus opens
  a page the site has, with no redirect" and "the Dictionary menu leads to the search box".

**Placeholder links.** The pages the menus, footer, and [homepage](home.md) name that don't exist
yet, and the outside addresses that aren't known yet, link to `#` for now: Browser extension,
Reference guides, Courses, Log in (`/login/`) and Create an account (`/register/`) in a build whose
account pages are closed, and See all videos (`/videos/`), which shows only once the product page
has videos. Zenbu Japanese for iPhone and All products now open their pages,
`/products/zenbu-japanese-app/` and `/products/` ([Products pages](products.md)), from the same
entries, as do All free tools, Free tools, and All tools (`/tools/`) and the Hiragana to Katakana,
Romaji to Kana, and Kanji to Furigana converters ([Tools pages](tools.md)); so do Log in and
Create an account where the account pages are open, as on staging and in production ([Account
pages](account.md#pages)), the build choosing their addresses as it does the footer's Sign in. #650
asked for menu items to appear only once their page exists; the owner chose to show them now as `#`
placeholders instead (#844). Every one is in one list, `linkTargets` in `src/lib/site.ts`, named for
what it stands for, and its links carry `data-link-target` with its id. A browser test lists every
`#` link the site renders and fails on one that isn't in that list, so none reaches production
unnoticed; replacing a placeholder means giving its entry the real address, or linking the page
directly once it exists.

- Source: #844 decision (placeholder links), and the owner's decision on #650 (show planned items
  as placeholders).
- Check: `apps/web/e2e/placeholders.spec.ts`, "every # link the site renders is a placeholder listed
  in src/lib/site.ts", which visits every page in `src/lib/pages.ts`, the tools index, a converter,
  and a search, word, and browse page at both widths, with the account menu open from 1024 pixels
  and the phone menu open below, and prints the placeholders it found; `apps/web/e2e/site.spec.ts`,
  "the Tools menu opens the tools and three converters, the Products menu’s planned pages are #
  placeholders, and All products opens the catalog"; `src/lib/site.test.ts`, "%s
  opens its page in a build whose account pages are open, and isn't a placeholder" and "%s stays a #
  placeholder in a build whose account pages are closed", for Log in and Create an account.

**Current section.** The menu button of the section the page is in is in the foreground color on a
muted background, where the others are muted text, and screen readers hear it as current
(`aria-current="true"`): every page under `/dictionary/` is in Dictionary, every page under
`/tools/` in Tools, and About, Sources, Support, Contact, and the legal pages are in Company. Home
and the sitemap are in none. In the open menu and in the phone menu, the link to the page itself is
marked as the current page (`aria-current="page"`).

- Source: #462 design; #650.
- Check: `src/components/site-header.test.tsx`, "the header marks the section the page is in";
  `apps/web/e2e/site.spec.ts`, "the header marks the section the page is in, and the page in its
  menu" and "the drawer marks the current page, and closes with its close button"; smoke "the
  header marks Dictionary current on the dictionary home".

**Phone menu.** Below 1024 pixels the menu button opens a sheet from the right, nine-tenths of the
screen's width and at most 384 pixels (#682: at three-quarters, a 360-pixel phone left its items'
lines a word or two long), titled with the logo and the site name, with the Reading Aids and Theme
buttons beside its close button (Reading Aids and Theme, in this doc). It holds the four menus as
groups that open and close (one at a time), the current section's group open, then Log in, or Your
account in a browser that signed in, and Get the app. A mega menu's group lists its columns' links,
with the Dictionary group led by Search. A group opens and closes with a click, Enter, or Space.
Following a link, its close button (lucide `X`), Escape, going back or forward, or widening the
window to 1024 pixels closes the sheet; choosing a theme keeps it open.

- Source: #844 decision and mockups (Phone width); #650; #561 (the phone menu); #664 (the theme
  beside Close, and the profile in Log in's place).
- Check: `apps/web/e2e/site.spec.ts`, "the drawer has the theme beside Close, then the menus as
  groups, then Log in and Get the app", "a drawer group opens and closes with a click, and its link
  opens the page", "the drawer
  opens and its groups toggle with the keyboard, and Escape closes it", "following Log in or Get the
  app in the drawer closes it, and opens its page", "the drawer closes when the
  browser goes back, and stays closed going forward", and "the drawer closes when the window reaches
  1024 pixels, and stays closed when it narrows"; `apps/web/e2e/phone-layout.spec.ts`, "About,
  /about/, fits a 360px phone" (the open menu and each group, Phone layout below); its width:
  `apps/web/e2e/site.spec.ts`, "at 360 pixels the drawer is 324 wide" and "at 768 pixels the drawer
  is 384 wide".

**Get the app and Log in.** Get the app leads with a phone icon (lucide `Smartphone`); it opens the
iPhone app's page (`/products/zenbu-japanese-app/`), whose own Get the app opens the app's App
Store listing. It is the same button in the header, the
phone menu, and the prompt that actions needing the app open; following it closes the phone menu
or the prompt. Log in, in the account menu from 1024 pixels and in the phone menu below, opens the
login page, `/login/`, where the account pages are open, as on staging and in production, and is
a `#` placeholder in a build where they're closed ([Account pages](account.md#pages)).

- Source: #844 decision and the Product page mockup's note (Get the app opens the product page);
  #650; #652; #831 (the phone icon); #468 (the login page); #664 (Log in moves into the account
  menu); #798 (production's account pages open).
- Check: `src/components/site-header.test.tsx`, "from 1024 pixels Get the app and the account
  button end the header, Get the app opening the iPhone app’s page" and "the Get the app button
  leads with a phone icon"; `src/lib/site.test.ts`, "%s opens its page in a build whose account
  pages are open, and isn't a placeholder" and "%s stays a # placeholder in a build whose account
  pages are closed"; `apps/web/e2e/account.spec.ts`, "the account menu's Log in, or the drawer's on phones, opens
  the login page"; `apps/web/e2e/product-page.spec.ts`, "the header’s Get the app
  opens this page"; `apps/web/e2e/word.spec.ts`, "opens the More actions menu with the app's
  actions".

**Footer.** The footer sits on the muted grey in light mode (`bg-muted`) and a slightly lighter grey
than the page in dark mode, after a rule, so the page, the homepage's closing card, and the footer
read as three areas; its secondary text is the `muted-surface` grey, at 4.5:1 or more in both themes
(Theme, above). It has no theme toggle. It starts with the logo and the site name, linking home, and
the site's one-line description. Four labelled columns follow: Products (Zenbu Japanese for iPhone,
Dictionary, and, where the account pages are open, Sign in, or Account once signed in:
[Account pages](account.md#pages)), Tools (Kana charts, Kanji lists, Frequency lists, All tools),
Company (About, Support, Contact, Sources), and Legal (Privacy Policy, Terms of Use, DMCA, Affiliate
Disclosure). From 768 pixels the brand and the columns sit side by side; on phones they stack into
one column. After a rule comes the bottom row: the copyright, the social accounts, the language
menu, and Sitemap, on one line from 768 pixels; at 320 and 375 pixels the copyright fills a line and
the rest wrap below it. The accounts (YouTube, GitHub, X, Facebook, Reddit, Instagram, TikTok,
LinkedIn, Medium) are a group named "Zenbu Japanese elsewhere", each the brand's 16-pixel mark in
the text color: Simple Icons' paths (CC0), and for LinkedIn a trace of the In bug from LinkedIn's
brand downloads (`components/social-links.tsx`). From 768 pixels they are 28-pixel ghost targets 4
pixels apart, each named "Zenbu Japanese on" its network, then a decorative divider screen readers
skip. Below 768 the row is hidden (out of the Tab order and the accessibility tree) and a Socials
menu ("SNS" in Japanese), built as the language menu is, opens upward with each network's mark and
name. Nothing scrolls sideways at 320 pixels, and every target is at least 24 pixels (WCAG 2.5.8).
The legal index (`/legal/`) is in the Company menu, not the footer.

- Source: #844 decision and mockups (footer); #650; #614 (the browse links); #664 (the background
  and the text's contrast); #902 (round 2's option D: the Socials menu and 16-pixel marks), which
  replaces the owner's call on #679 for one row of icons on phones.
- Check: `apps/web/e2e/contrast.spec.ts` (the footer's contrast, every page, both themes);
  `src/components/site-footer.test.tsx`, "the footer groups its links…", "the footer stacks its
  columns…", "the footer leads with the brand…", "from 768 pixels the bottom row shows the nine
  brand marks…", "from 768 pixels a divider sits between the icons…", "below 768 pixels a Socials
  menu takes…", and "the footer ends with the copyright…"; `apps/web/e2e/footer.spec.ts`, "the
  footer groups its links…", "the footer lays its columns…", "from 768 pixels the nine social
  icons…" (768 and 1280, with the divider), "below 768 pixels the icons fold…" (opened at 320 and
  375), and "Tab reaches the Socials menu…" (Enter, Space, Down Arrow); smoke "the footer links the
  Privacy Policy".

**Reading Aids.** The app's Reading Aids, named as the app names them: Show Furigana, Show Romaji,
Show Word Meanings, and Show Sentence Translations, with the app's defaults, Furigana and Sentence
Translations on and Romaji and Word Meanings off. From 1024 pixels they are a group of four checkbox
items in the account menu, before the Theme row, which stays open as each changes; below 1024 pixels
the phone menu's Reading Aids button (lucide `BookA`), beside Theme, opens the same four. Each is
kept in the browser's local storage under the id the app syncs it by (`readingAids.furigana`,
`readingAids.romaji`, `readingAids.wordMeanings`, `readingAids.translations`), so it holds across
pages, visits, and tabs on the device. Every dictionary page holds every aid in its HTML; a script
at the top of the page sets an attribute on `<html>` for each kept setting before anything is
drawn, and the stylesheet shows or hides each aid from it, so the server's HTML and the browser's
first render are the same, and nothing moves after the first paint, as a page loads or a link opens
the next. Where each applies is under each page in [Dictionary](dictionary.md). Hide Furigana on
Known Words waits for the learner's known words ([Required, not built yet](not-built-yet.md)), and
Kanji Meanings for Look Up's Grade panel, which the website doesn't have.

- Source: App docs index, Account (Reading Aids); `ReadingAidPreferences.swift` (the defaults),
  `AccountAndMediaLibraryView.swift` (the names), `SyncedSettings.swift` (the ids); #831.
- Check: `src/lib/reading-aids.test.ts` (the defaults and ids, held to the Swift sources, a kept
  value, and the script); `src/hooks/use-reading-aid.interaction.test.tsx`;
  `apps/web/e2e/reading-aids.spec.ts`, "are the app’s by default…", "a setting survives a
  reload…", "the Japanese pages name the settings in Japanese", "with the defaults…" and "with
  every one flipped, no page moves as it loads or as a link opens the next", and "they are already
  applied, so the page never shows the defaults first"; `apps/web/e2e/header.spec.ts`, "signed
  out, the menu offers Log in and Create an account, then the Reading Aids and the theme, by
  keyboard".

**Phone layout.** Every page fits a 360-pixel phone. No text is smaller than 12 pixels: furigana
is 0.45 of its word's size, as in the app, but never under 12 pixels, so it spreads a short word
a little rather than shrink. The homepage's drawings of the app are pictures, like its
screenshots, and keep their drawn size, and may crop their text, as the page end's collage does.
Nothing is wider than the screen, no text is cut off by its box (a line clamped with an ellipsis,
and a carousel's screens beyond its edge, are meant to be), and a grid of kana, kanji, or links
keeps each cell with text at least 44 pixels wide. Tap targets meet WCAG 2.2's 2.5.8: 24 by 24
pixels, or spaced so a 24-pixel circle around each touches no other; the homepage showcase's dots
are 24 by 24. The same holds in the phone menu, with each of its groups open.

- Source: #682 (the owner's review on a phone).
- Check: `apps/web/e2e/phone-layout.spec.ts`, "… fits a 360px phone", on every page type in
  `apps/web/e2e/page-types.ts` (the account and tools pages among them), each homepage area, the
  phone menu and each of its groups, and a missing page, with axe's `target-size` rule for the tap
  targets.

**App links.** The shipped iOS app, Tomodachi, and their App Store metadata link to `/privacy` and
`/support`, so both keep working. `/privacy` redirects (308) to `/legal/privacy/` in one hop, with its query, as
does `/privacy/`; `/support` redirects to `/support/`, as every page without its slash does.

- Source: the shipped apps' links (Tomodachi's in
  [tomodachi-app#105](https://github.com/serpcompany/tomodachi-app/issues/105)); the one hop found
  by the browser tests.
- Check: `src/lib/moved-pages.test.ts`; `apps/web/e2e/urls.spec.ts`, "/privacy redirects to the
  privacy policy in one hop" (on the production build) and "/support redirects to /support/ in one
  hop"; smoke `308 /privacy -> /legal/privacy/`.
