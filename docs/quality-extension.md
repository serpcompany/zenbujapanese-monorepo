# Quality: the browser extension

A grade for the Zenbu Japanese extension for Chrome. The scale, what each column means, and when
to re-grade a row are in [`quality.md`](quality.md), with the other areas' grades.

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browser extension | A | 2026-10-28 | `apps/extension/` | `apps/extension/build/`: the manifest of each build, the rem conversion, and the shadow root's stylesheet as the build makes it (no rem, the `--tw-*` fallback outside any `@supports`, `:host` reset); `src/service-worker/` and `src/offscreen/`: the offscreen document opened once, and again after Chrome closes it, once it says it has started, a ping carried from a page through the service worker and the offscreen document to the worker's answer, also first after a close, or to a failure, and the relay's wait for the worker, its restart, and its time limit; `src/shared/dictionary-status.interaction.test.tsx`, in happy-dom: checking, ready, failed, and Check again; `src/content/shadow-mount.interaction.test.tsx`, in happy-dom: the test surface drawn in its own shadow root, Geist added under its own family, `.dark` on the surface, a dialog opened inside the shadow root, and all of it gone on unmount; `e2e/`, in Playwright's Chromium with the test build: each page the manifest names opens with its text, the side panel answers after the offscreen document closes, the test content script draws on `hostile.html`, a release file downloads from a local language-data server with its SHA-256 checked, and any request to another host fails the test; `agent-chrome/*.test.mjs`: the agent Chrome harness's Mac-wide lock, its cleanup after a failed start, a taken control port, and YouTube's request budget | `Extension`: Biome with its layer rules, typecheck, the tests, both builds, and the browser tests; `Repository`'s import check holds its layers | [`extension.md`](agents/extension.md), [product docs](../apps/extension/docs/product/index.md) | The `verify-extension` skill in branded Chrome; the test surface's menu and dialog, by keyboard and pointer, on both test pages |

- **Browser extension, A.** Before merge, the code that needs no browser is tested, both builds
  must succeed, and the browser tests load the test build in Chromium: the pages, the offscreen
  document's return, the content script on a real page, and a release download, offline. The
  `verify-extension` skill shows the same in branded Chrome with proof. Main gap, both tracked in
  [`tech-debt.md`](tech-debt.md) (Browser extension): the test surface's menu and dialog are
  driven by hand (#1062), and branded Chrome runs only on an agent's Mac, not in CI (#1063).
