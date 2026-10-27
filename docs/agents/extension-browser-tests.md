# The extension's browser tests

The Playwright tests that load the extension's test build in Chromium, in `apps/extension/e2e/`.
Run them with `pnpm test:browser` from `apps/extension`; the rest of the extension's checks are in
[`extension.md`](extension.md) (Checks).

`playwright.config.ts` runs `e2e/*.spec.ts` against `dist-test/` (`pnpm test:browser` builds it
first). One persistent Chromium context per run loads the build with `--load-extension`, since
Playwright can't open the browser-level CDP session `Extensions.loadUnpacked` needs, and
Playwright's Chromium, unlike branded Chrome 137 and later, still honors the switch.

- **Pages:** each page the manifest names (`side_panel.default_path`, `action.default_popup`,
  `options_ui.page`) is in the build, opens, and shows its title and text, so a build missing a
  page fails. The side panel answers again after `chrome.offscreen.closeDocument()`.
- **Content script:** on `hostile.html`, the test content script's surface shows `食べる` and
  "The dictionary is ready."
- **Language data:** an extension page downloads `releases.json`, the pinned release's manifest,
  and `JLPTLevelPack.sqlite3` from the local server, and each SHA-256 matches.
- **Nothing else is asked.** `--host-resolver-rules` resolves no host but `127.0.0.1`, and the
  `outsideRequests` fixture fails any test whose context asks anything but the local server and
  this extension. `outside-requests.spec.ts` asks `example.com` from the service worker, waits
  for the guard to record it, then clears it, so it passes only while the guard catches it. A
  page that logs an error, or throws, fails its test too.

The local server (`e2e/local-server.ts`) serves the test pages and the language-data bucket's
layout from the checkout: `releases.json`, written from `language-data/releases/` up to the
release `language-data/release.json` pins, with each manifest's SHA-256 and its commit from Git;
`releases/<release>/manifest.json`; and `files/<sha256>/<name>`, read through
`language-data/release-inputs.json`'s roots. A file still a Git LFS pointer answers 503 with the
`git lfs pull --include` that fetches it. A failed run keeps its trace and screenshot in
`e2e`'s `results` folder, which Git ignores.
