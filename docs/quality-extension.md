# Quality: the browser extension

A grade for the Zenbu Japanese extension for Chrome. The scale, what each column means, and when
to re-grade a row are in [`quality.md`](quality.md), with the other areas' grades.

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browser extension | B | 2026-10-28 | `apps/extension/` | `apps/extension/build/`: the manifest of each build, the rem conversion, and the shadow root's stylesheet as the build makes it (no rem, the `--tw-*` fallback outside any `@supports`, `:host` reset); `src/service-worker/` and `src/offscreen/`: the offscreen document opened once, and again after Chrome closes it, once it says it has started, a ping carried from a page through the service worker and the offscreen document to the worker's answer, also first after a close, or to a failure, and the relay's wait for the worker, its restart, and its time limit; `src/shared/dictionary-status.interaction.test.tsx`, in happy-dom: checking, ready, failed, and Check again; `src/content/shadow-mount.interaction.test.tsx`, in happy-dom: the test surface drawn in its own shadow root, Geist added under its own family, `.dark` on the surface, a dialog opened inside the shadow root, and all of it gone on unmount; `src/shared/settings.test.ts`: the settings' defaults, storage, and channel to open tabs; `src/popup/` and `src/settings/` interaction tests, in happy-dom on one fake Chrome: each reading aid stored and heard by the test content script without a reload, a site turned off, kept off after a reload, and turned on from Sites, the pages Zenbu can't run on, Chrome's site access, the download, Open Side Panel, and Settings' five pages | `Extension`: Biome with its layer rules, typecheck, the tests, and both builds; `Repository`'s import check holds its layers | [`extension.md`](agents/extension.md), [product docs](../apps/extension/docs/product/index.md) | The unpacked test build in the agent Chrome harness, on both test pages, with the popup and Settings |

- **Browser extension, B.** The code that needs no browser is tested before merge, and both builds
  must succeed, but nothing loads the built extension in Chrome before merge: the pages, the ping,
  the offscreen document's return, the shadow root on a real page, and the popup and Settings at
  their real widths are checked by hand. Main
  gap: no check that loads the unpacked build in Chrome runs before merge; #952 brings the agent
  Chrome harness into the repository.
