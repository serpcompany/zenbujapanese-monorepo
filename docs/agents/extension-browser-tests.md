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
  and Recent; Account's and its Words'; and a last tab kept from the five tabs before them opening
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
  the popup, links, Open Full Entry, Share, and Copy Link; the More menu also over a caption
  word's popup on the YouTube stand-in, in and out of fullscreen (`word-popup.spec.ts`). The
  `languageDataHeld` option holds the fixture release back until a test lets it go
  (`page-lookup-before-data.spec.ts`). Chromium starts with `--disable-blink-features=WebShare`,
  so Share falls back to copying as it does where there is no share sheet.
- **The caption on the player:** the `youTubeStandIn` option serves the agent Chrome harness's
  stand-in site (`agent-chrome/site.mjs`) over HTTPS as `www.youtube.com`, trusted by its SPKI
  hash, so the YouTube content script runs on its watch page and the service worker's two
  requests reach it. On it: the line in the player in place of the site's captions, the words and
  reading aids, nothing added to the page's styles, one `timedtext` request whatever the controls
  do, the speed menu in and out of fullscreen, a word's popup pausing the video, and a word
  meaning's contrast against the caption's band over a white frame, the brightest a video can
  show, written to the test's `contrast.json` (`player-captions.spec.ts`); dragging the caption,
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
  accessibility tree. Each width's screenshots, light and dark, and `contrast.json` go to its
  test's folder under `e2e/results/` (`transcript-meanings.spec.ts`). Both contrast checks use
  `e2e/contrast.ts`.
- **Nothing else is asked.** `--host-resolver-rules` resolves no host but `127.0.0.1` and maps
  the test build's data host, `language-data.localhost`, to the local server, and, with
  `youTubeStandIn`, `www.youtube.com` to the stand-in site; the `outsideRequests` fixture fails any
  test whose context asks anything but those and this extension. `outside-requests.spec.ts` asks `example.com` from the service worker, waits
  for the guard to record it, then clears it, so it passes only while the guard catches it. A
  page that logs an error, or throws, fails its test too.

The local server (`e2e/local-server.ts`) serves the test pages and a fixture release in the
bucket's layout, which `e2e/fixture-release.ts` builds when the tests start: every first- and
later-set file the installer names, tiny, with SQLite files from `node:sqlite` carrying the
metadata the installer checks, laid out by `src/test/publish-release.ts` (the unit tests' fake
bucket uses it too) as `releases.json`, the manifest, `compressed.json`, and gzipped parts.
Nothing is read from Git LFS, and no binary is committed. A failed run keeps its trace and screenshot in
`e2e`'s `results` folder, which Git ignores.
