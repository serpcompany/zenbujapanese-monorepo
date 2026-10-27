# Quality: the browser extension

A grade for the Zenbu Japanese extension for Chrome. The scale, what each column means, and when
to re-grade a row are in [`quality.md`](quality.md), with the other areas' grades.

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browser extension | B | 2026-10-28 | `apps/extension/` | `apps/extension/build/`: the manifest of each build, the rem conversion, and the shadow root's stylesheet as the build makes it (no rem, the `--tw-*` fallback outside any `@supports`, `:host` reset); `src/service-worker/` and `src/offscreen/`: the offscreen document opened once, and again after Chrome closes it, once it says it has started, a ping carried from a page through the service worker and the offscreen document to the worker's answer, also first after a close, or to a failure, and the relay's wait for the worker, its restart, and its time limit; `src/shared/dictionary-status.interaction.test.tsx`, in happy-dom: checking, ready, failed, and Check again; `src/content/shadow-mount.interaction.test.tsx`, in happy-dom: the test surface drawn in its own shadow root, Geist added under its own family, `.dark` on the surface, a dialog opened inside the shadow root, and all of it gone on unmount; `src/side-panel/` and `src/service-worker/side-panel.test.ts`: routes and tab stacks, the service worker opening the panel before it awaits anything and leaving no route when Chrome refuses, and, in happy-dom, the five tabs and their empty states, arrow keys, pages over a tab and Back, focus after each, the last tab, the sign-up links, the dictionary progress on every tab but Translate and Try Again, the toolbar icon opening the panel, and `openPanel` through a fake Chrome to the panel, closed and open | `Extension`: Biome with its layer rules, typecheck, the tests, and both builds; `Repository`'s import check holds its layers | [`extension.md`](agents/extension.md), [product docs](../apps/extension/docs/product/index.md) | The unpacked test build in the agent Chrome harness, on both test pages, and the side panel opened from a click, closed and open, at 320 and 380 px |
| Word Detail | B | 2026-10-28 | `apps/extension/src/word-detail/` | `src/word-detail/word-detail-page.interaction.test.tsx` and `kanji-and-form-pages.interaction.test.tsx`, in happy-dom, on the core's fixtures through a fixture source: 要る's top and sections, Furigana off, the chosen frequency order, 要's two entries, the conjugation table to a form's examples, a meaning's Speak and Copy, Share and Copy Link on the website's origin, Load More, an example's word, いる's related word not found, a spelling resolved, Back through the pages; 要's kanji detail with strokes and while they download, not ready, Try again, not found; a form's examples; the side panel's pages | `Extension`'s tests; `Web` holds the `@zenbu/ui` parts it shares | [product docs](../apps/extension/docs/product/word-detail.md) | Not yet: nothing opens the pages until #957, and the whole dictionary comes with #956 |

- **Browser extension, B.** The code that needs no browser is tested before merge, and both builds
  must succeed, but nothing loads the built extension in Chrome before merge: the pages, the ping,
  the offscreen document's return, the shadow root on a real page, and the side panel opening
  from a click and fitting 320 px are checked by hand. Main
  gap: no check that loads the unpacked build in Chrome runs before merge; #952 brings the agent
  Chrome harness into the repository.
- **Word Detail, B.** Every behavior in its product doc has an interaction test before merge, on
  the fixtures, and the side panel draws them. Main gap: nothing in the extension opens them yet,
  so no browser test or check by hand covers them until #957's Open Full Entry, #952's Playwright
  harness, and #956's data arrive.
