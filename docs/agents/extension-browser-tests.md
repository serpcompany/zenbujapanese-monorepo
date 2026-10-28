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
  page fails. The side panel shows its header and the Video tab's empty state.
- **Content script:** on `hostile.html`, the test content script's surface shows `食べる` and
  "The dictionary is ready.", and answers again after `chrome.offscreen.closeDocument()`.
- **Language data:** an extension page downloads `releases.json`, the fixture release's manifest,
  and `JLPTLevelPack.sqlite3` from the test build's data host, and each SHA-256 matches.
- **Install:** the welcome page reaches ready, and the server was asked for `releases.json`, the
  manifest, `compressed.json`, every part, and every whole file (`install.spec.ts`).
- **Nothing else is asked.** `--host-resolver-rules` resolves no host but `127.0.0.1` and maps
  the test build's data host, `language-data.localhost`, to the local server; the
  `outsideRequests` fixture fails any test whose context asks anything but the local server and
  this extension. `outside-requests.spec.ts` asks `example.com` from the service worker, waits
  for the guard to record it, then clears it, so it passes only while the guard catches it. A
  page that logs an error, or throws, fails its test too.

The local server (`e2e/local-server.ts`) serves the test pages and a fixture release in the
bucket's layout, which `e2e/fixture-release.ts` builds when the tests start: every first- and
later-set file the installer names, tiny, with SQLite files from `node:sqlite` carrying the
metadata the installer checks, laid out by `src/test/publish-release.ts` (the unit tests' fake
bucket uses it too) as `releases.json`, the manifest, `compressed.json`, and gzipped parts.
Nothing is read from Git LFS, and no binary is committed. A failed run keeps its trace and screenshot in
`e2e`'s `results` folder, which Git ignores.
