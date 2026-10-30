# The extension's browser tests

The Playwright tests that load the extension's test build in Chromium, in `apps/extension/e2e/`.
Run them with `pnpm test:browser` from `apps/extension`; the rest of the extension's checks are in
[`extension.md`](extension.md) (Checks).

`playwright.config.ts` runs `e2e/*.spec.ts` against `dist-test/` (`pnpm test:browser` builds it
first). One persistent Chromium context per run loads the build with `--load-extension`, since
Playwright can't open the browser-level CDP session `Extensions.loadUnpacked` needs, and
Playwright's Chromium, unlike branded Chrome 137 and later, still honors the switch.

- **Pages:** each page the manifest names (`side_panel.default_path` and `options_ui.page`; there
  is no toolbar popup) is in the build, opens, and shows its title and text, so a build missing a
  page fails. The side panel shows its header and Translate's Use Selection.
- **The side panel's tabs:** the app's Translate, Player, and Account, Translate first and chosen
  on a first open; Translate's box and its Image row opening Image Search; Player's empty state
  and Recent; Account's signed-out account and its Words'; and a last tab kept from the five tabs before them opening
  on the tab that took it over, and one kept as `lookUp` on Translate (`side-panel-tabs.spec.ts`).
- **Content script:** on `hostile.html`, the test content script's surface shows `食べる` and
  "The dictionary is ready.", and answers again after `chrome.offscreen.closeDocument()`.
- **Language data:** an extension page downloads `releases.json`, the fixture release's manifest,
  and `JLPTLevelPack.sqlite3` from the test build's data host, and each SHA-256 matches.
- **Install:** the welcome page reaches ready, and the server was asked for `releases.json`, the
  manifest, `compressed.json`, every part, and every whole file (`install.spec.ts`).
- **Page lookup and the word popup:** on `words.html`, light and dark, served as
  `http://allowed.localhost/test-pages/words.html`, a site the test build holds: the underlines,
  the page's layout kept, the reading aids, a site turned off, words added later, a site given
  and taken back with `chrome.developerPrivate` from a `chrome://extensions` page, and the popup's
  card, choice, placement, closing, its More menu over it with one Escape each for the menu and
  the popup, links, Open Full Entry expanding the card in place and scrolling inside it, Share, and
  the ••• menu's Status, Add to List… and Add Note, saving nothing signed out; the More menu also over a caption word's popup on the YouTube stand-in, in and
  out of fullscreen; and the expanded card's Open on zenbujapanese.com, which opens the word's
  page in a new tab, fulfilled by `context.route` and taken off `outsideRequests`
  (`word-popup.spec.ts`). A transcript word's card on the stand-in watch page: the side panel
  page in a tab of its own, at 380 × 720, whose `chrome.tabs.query` for the active tab answers
  the watch tab, so its port reaches the watch page's content script; with `page-lookup.js` run
  in the watch tab as Every Site would, one card answers; and a caption word's card taking a
  transcript word's place keeps the video paused until it closes
  (`transcript-card-on-page.spec.ts`). The
  `languageDataHeld` option holds the fixture release back until a test lets it go
  (`page-lookup-before-data.spec.ts`). Chromium starts with `--disable-blink-features=WebShare`,
  so Share falls back to copying as it does where there is no share sheet.
- **The panel's headword:** Vite serves `test-pages/word-header.html` on a free port, with
  `test-pages/vite.config.ts`, and it draws `@zenbu/ui`'s `WordHeader` from props at the panel's
  size. テーブル and 食べる, with た over 食, each sit on one line inside the card at 380 px, with
  nothing overflowing (`word-header.spec.ts`). Neither word is in the fixture release.
- **The caption on the player:** the `youTubeStandIn` option serves the agent Chrome harness's
  stand-in site (`agent-chrome/site.mjs`) over HTTPS as `www.youtube.com`, trusted by its SPKI
  hash, so the YouTube content script runs on its watch page and the service worker's two
  requests reach it. On it: the line in the player in place of the site's captions, the words and
  reading aids, nothing added to the page's styles, one `timedtext` request whatever the controls
  do, the speed menu in and out of fullscreen, a word's popup pausing the video, and a word
  meaning's contrast against the caption's band over a white frame, the brightest a video can
  show, written to the test's `contrast.json`, and, on the stand-in's line of two neighbouring
  words, each word's underline apart from the next's (`player-captions.spec.ts`); dragging the caption,
  its cursor, its edges, a line change mid-drag, and its place kept through a resize, fullscreen,
  and the next video (`caption-drag.spec.ts`), which puts the place back after each test since
  the browser and its storage last the worker. Both open the page
  with `e2e/watch-page.ts`, and the stand-in's request log lasts the worker too, so a count of
  requests starts from the log's length when the test began. Both enter fullscreen through its
  `enterFullscreen`, from a real click on the page's heading, since Chrome refuses
  `requestFullscreen` without a fresh input. The line change goes to the track's short last line,
  so the width changes whatever fonts the machine has.
- **The Player tab's word meanings:** `side-panel.html` at 380 and 360 pixels wide, in light and
  dark. An init script on that page alone stands in for the active tab (a YouTube watch page),
  its port (playback in the second line, so that row is the line being played), and the
  `sendMessage` answers for the captions and the dictionary's segment and popup requests, since
  the fixture dictionary has none of the lines' words; the build's layout, styles and colours are
  real. It measures that no two meanings touch, each stays in its word's column, a line's first
  word has no indent, and the page doesn't scroll sideways, and each row's meaning contrast over
  its backgrounds (at least 4.5:1); a cut meaning's full text is its title and in the
  accessibility tree. With Word Meanings off and then on, each word's box, which carries its
  underline, is the meanings' gap from the next on its line, at the same splits either way
  (`e2e/word-underlines.ts`, which the caption's and the Translate tab's tests use too); each
  state's screenshot goes to its test's folder. The Translate tab's test translates a source that
  opens with an ellipsis and wraps at 360 pixels, and, with Word Meanings off and on, measures that
  each wrapped line starts at its first word and the first word sits right after the ellipsis
  (`side-panel-popup.spec.ts`). Each width's screenshots, light and dark, and `contrast.json` go to its
  test's folder under `e2e/results/` (`transcript-meanings.spec.ts`). Both contrast checks use
  `e2e/contrast.ts`.
- **A page's word meanings:** `words.html` with Word Meanings on, light and dark, and a paragraph
  of two neighbouring words added. By their boxes, a meaning after plain text and a meaning after
  another meaning are the transcript's gap, half the page's root font size, from it, and a meaning
  that starts its element is not indented. Each meaning is not the underline's blue, and its
  contrast over the page's backgrounds is at least 4.5:1, with `e2e/contrast.ts`
  (`page-lookup.spec.ts`).
- **The account,** with the `accountService` option (`account.spec.ts`): an emailed code on
  Settings' Account page, shown on the side panel's Account tab too; Google and Apple, Apple's
  through the service's return route, then signing out, which the service answers `200`; deleting
  an email account, after which its session answers `401`; a session the service refuses showing
  signed out; Subscribe… opening zenbujapanese.com's `/account/` page, with the subscription
  answering `subscription_required`, since the real one can't offer it locally; the Account tab
  at 360 pixels cutting none of its lines; and a content
  script, in its isolated world over CDP, finding no token in local or session storage or the
  page's IndexedDB. The website's handover (`website-sign-in.spec.ts`): a code the service gives
  a `zenbu-web` session, sent from a page on the local server, signs the extension in; a second
  answers `signed-in-already`; a page on `language-data.localhost` can't reach the extension.
  Each test starts signed out (`account-pages.ts`), since the browser lasts the worker, and
  counts the stand-ins' log from where it was when the test began.
- **Sync,** with the same service (`account-sync.spec.ts`, helpers in `account-copy.ts`): a word,
  a kanji, Favorites with a word, a note, and each synced setting reaching the account and a
  second profile signed in to it (`openProfile` in `fixtures.ts`), and a change made there coming
  back; the translation language and source coming down and never in a request; the signed-out
  Account's count of changes before another account replaces the copy; a change waiting while
  `/v1/sync` is aborted, kept through signing out, and going when the same account signs in
  again; a `402`, fulfilled by `context.route`, keeping the change and reading the subscription
  again; and the test content script's known states (`test-pages/
  known-states.tsx`) changing as a word is marked, with no `zenbu-account-copy` in the page's
  `indexedDB.databases()`.
- **The account service** (`account-service.ts`) is `apps/account-api` from the checkout, started
  as a child process on PGlite over a socket, with the dev mailbox, on a free port, not
  `verify-service`'s 8789, so it runs beside one. `account-api.localhost` maps to it, and it takes
  the local server's origin as the website's (`websiteCode`). Its preload
  (`account-service-preload.mjs`) answers Google's and Apple's key sets with the stand-ins' keys
  and refuses any other fetch off the machine. The stand-ins (`sign-in-providers.ts`) are an HTTPS
  server mapped as `accounts.google.com` and `appleid.apple.com`, with `agent-chrome/site.mjs`'s
  certificate trusted by its SPKI hash, since Playwright can't route the window
  `chrome.identity.launchWebAuthFlow` opens. They answer only the authorize URLs, and log each
  with its `redirect_uri`; Chrome's own requests to Google get a `404`. The service allows five
  codes in ten minutes from one address, so only the tests about the code send one; the others
  sign in with the Google stand-in.
- **Nothing else is asked.** `--host-resolver-rules` resolves no host but `127.0.0.1` and maps
  the test build's data host, `language-data.localhost`, to the local server, and, with
  `youTubeStandIn`, `www.youtube.com` to the stand-in site, and with `accountService`, the account
  service and the stand-ins; the `outsideRequests` fixture fails any
  test whose context asks anything but those and this extension. `outside-requests.spec.ts` asks `example.com` from the service worker, waits
  for the guard to record it, then clears it, so it passes only while the guard catches it. A
  page that logs an error, or throws, fails its test too.

The local server (`e2e/local-server.ts`) serves the test pages and a fixture release in the
bucket's layout, which `e2e/fixture-release.ts` builds when the tests start: every first- and
later-set file the installer names, tiny, with SQLite files from `node:sqlite` carrying the
metadata the installer checks, and the fixture words' entries with empty example tables, so a word's page answers, laid out
by `src/test/publish-release.ts` (the unit tests' fake
bucket uses it too) as `releases.json`, the manifest, `compressed.json`, and gzipped parts.
Nothing is read from Git LFS, and no binary is committed. A failed run keeps its trace and screenshot in
`e2e`'s `results` folder, which Git ignores.
