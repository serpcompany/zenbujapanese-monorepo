---
name: verify-extension
description: Check a change to the Zenbu Japanese Chrome extension in branded Chrome on this Mac. Builds the test build, starts a fresh, headless, offline agent Chrome with it and the local language-data server, opens the side panel, popup, and Settings in light and dark, closes the offscreen document and checks again, sees the test content script on a local page, downloads a release file and checks its SHA-256, and runs the harness's self-test, which serves a stand-in page as www.youtube.com by host mapping and logs its video events. Keeps console lines, screenshots, and run.json under tmp/agent/verify/, and always stops Chrome. Use after changing apps/extension, and to reproduce an extension bug before fixing it.
---

# Check an extension change in Chrome

The Playwright tests (`pnpm test:browser` in `apps/extension`) hold what should keep working, in
Playwright's Chromium, in CI. This skill is the look in branded Google Chrome, the browser
learners use, with the proof kept. The harness and its limits are in
`apps/extension/agent-chrome/README.md`; read its Limits before going near a real site.

## 1. Find what the change touches

The feature map is the extension's product docs, `apps/extension/docs/product/index.md`: each
surface, what a learner sees, and its check. How the parts fit is in
`docs/agents/extension.md`.

## 2. Make sure Chrome is free

One agent Chrome runs per Mac, shared by every checkout. From `apps/extension`, after
`pnpm install` at the root:

```sh
pnpm --silent agent-chrome status
```

`not running` means go on. Anything else is another agent's Chrome: wait for it, in the
background, and never stop a Chrome you didn't start. `verify` and `selftest` refuse to start
while one runs.

## 3. Run

```sh
pnpm --silent agent-chrome verify --name <issue>/extension
pnpm --silent agent-chrome selftest --name <issue>/selftest
```

`verify` builds `dist-test/` first (`--skip-build` if it is current). Each run starts its own
Chrome with a fresh profile, offline: every host but `127.0.0.1` fails, so nothing reaches a real
site. Each stops Chrome when it ends, passed or not. `--name` is the folder under
`tmp/agent/verify/`; without it, `<date>-extension` and `<date>-agent-chrome-selftest`.

Each prints its `run.json` and exits 1 on a failure. `failures` names a step that failed, and a
`MISSING` in `lines` names a log line that never came.

- **`verify`** proves each page opened (`[harness] opened page <id>/pages/...`), the service
  worker and the offscreen document attached, the side panel answered again after the offscreen
  document closed, the test content script drew its surface on `hostile.html`, and the release
  file's SHA-256 matched the manifest's. A 503 from the language-data server names the Git LFS file
  to pull.
- **`selftest`** proves the harness itself: a content script on the stand-in
  `https://www.youtube.com/watch` page, served from this Mac by host mapping, a muted video's
  `[video] play`, `seeking`, `seeked`, and `pause` lines, and an offscreen document's worker
  answering cold and after `chrome.offscreen.closeDocument()`.

## 4. Look at the proof

Open the screenshots: each page in light and dark, the side panel after the offscreen document
closed, the test surface on `hostile.html`, and the stand-in watch page. Read `console.log` for
errors and exceptions. A behavior none of this covers is driven by hand on a running Chrome
(`pnpm --silent agent-chrome start --ext dist-test --headless --offline`, then `goto`, `click`,
`eval`, `shot`, `tail`), followed by `pnpm --silent agent-chrome stop`.

## 5. Report

Put the commands, the result, and the proof folder in the pull request. What a learner can now do
that should keep working becomes a Playwright test in `apps/extension/e2e/`.

## Never

- Use the owner's own Chrome profile, or ask the owner to load, click, or paste.
- Leave Chrome running: `pnpm --silent agent-chrome status` should say `not running` at the end.
- Load a real YouTube or Netflix page without counting it against the request budget in the
  harness's Limits.
