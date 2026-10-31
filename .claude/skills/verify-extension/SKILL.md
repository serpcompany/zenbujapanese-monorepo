---
name: verify-extension
description: Check a change to the Zenbu Japanese Chrome extension in branded Chrome on this Mac. Builds the test build, starts a fresh, headless, offline agent Chrome with it and the local language-data server, opens the side panel and Settings in light and dark, sees the test content script on a local page, closes the offscreen document and checks again from it, downloads a release file and checks its SHA-256, and runs the harness's self-test, which serves a stand-in page as www.youtube.com by host mapping and logs its video events. Keeps console lines, screenshots, and run.json under tmp/agent/verify/, and always stops Chrome. Use after changing apps/extension, and to reproduce an extension bug before fixing it.
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
background, and never stop a Chrome you didn't start. `start`, `verify`, and `selftest` take a
Mac-wide lock first, so if two agents start at once, the second fails at once with "Chrome is in
use by pid N" and the first keeps running.

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
  worker and the offscreen document attached, the test content script drew its surface on
  `hostile.html` and it answered again after the offscreen document closed, and the release
  file's SHA-256 matched the manifest's. A 503 from the language-data server names the Git LFS file
  to pull.
- **`selftest`** proves the harness itself: a content script on the stand-in
  `https://www.youtube.com/watch` page, served from this Mac by host mapping, a muted video's
  `[video] play`, `seeking`, `seeked`, and `pause` lines, and an offscreen document's worker
  answering cold and after `chrome.offscreen.closeDocument()`.

## 4. Look at the proof

Open the screenshots: each page in light and dark, the test surface on `hostile.html`, and again
after the offscreen document closed, and the stand-in watch page. Read `console.log` for
errors and exceptions. A behavior none of this covers is driven by hand on a running Chrome
(`pnpm --silent agent-chrome start --ext dist-test --headless`, offline by default, then `goto`, `click`,
`eval`, `shot`, `tail`), followed by `pnpm --silent agent-chrome stop`.

## 5. Report

Put the commands, the result, and the proof folder in the pull request. What a learner can now do
that should keep working becomes a Playwright test in `apps/extension/e2e/`.

## Never

- Use the owner's own Chrome profile, or ask the owner to load, click, or paste.
- Leave Chrome running: `pnpm --silent agent-chrome status` should say `not running` at the end.
- Go online without a reason. `start --online` is the only way to reach a real site; offline is
  the default for `start`, `verify`, and `selftest`.

## YouTube

Check a YouTube feature on the stand-in watch page, offline, never on youtube.com. Start
`pnpm --silent language-data` in the background; it prints its `hostRule`. Then:

```sh
pnpm --silent agent-chrome start --ext dist-test --map-host www.youtube.com --host-rule '<hostRule>'
pnpm --silent agent-chrome open 'https://www.youtube.com/watch?v=zenbuJa0001'
```

The page is the harness's (`apps/extension/agent-chrome/README.md`, The stand-in watch page): a
muted local video in `#movie_player`, the player and `timedtext` answers from the fixtures, with
lines whose words are in the fixture dictionary that the language-data server gives. `[site]` lines in `console.log` count the player and `timedtext` requests. The
side panel docks only from a user gesture: send `{ target: 'service-worker', openPanel: { tab:
'player' } }` with `chrome.runtime.sendMessage` from the content script's isolated world, by CDP
`Runtime.evaluate` with `userGesture: true`. Set `video.muted = true` before playing. Chrome's own
Translator model download needs its hosts let through (`--host-rule`), or English shows its
download failure.
For a fullscreen screenshot in headless Chrome, emulate the viewport again after
`requestFullscreen()` (CDP `Emulation.setDeviceMetricsOverride`); otherwise it crops to 800 × 600.

## Netflix

Check a Netflix feature on the stand-in Netflix page, offline, never on netflix.com, the same way,
mapping Netflix's page and the stand-in's track server too:

```sh
pnpm --silent agent-chrome start --ext dist-test --map-host www.netflix.com --map-host ipv4-c001-tyo001-ix.1.oca.nflxvideo.net --host-rule '<hostRule>'
pnpm --silent agent-chrome open 'https://www.netflix.com/watch/81234567'
```

The page is the harness's (`apps/extension/agent-chrome/README.md`, The stand-in Netflix page).
`[netflix]` lines in `console.log` show each track turned on, each seek, play, pause, and speed
that went through the stand-in player, and an M7375 line for a seek that didn't; `[site]` lines
count the track fetches.

## YouTube's request budget

An online Chrome counts each request to `youtube.com`, `youtube-nocookie.com`, and `youtu.be` in
a Mac-wide ledger and refuses one past the budget: 4 page loads an hour, 10 a day, one
`timedtext` request every 30 minutes, and nothing for 6 hours after a 429. The numbers live in one
place, `youtubeBudget` in `apps/extension/agent-chrome/youtube-budget.mjs`. A refused load fails
with `ERR_BLOCKED_BY_CLIENT`, `goto` prints "YouTube's request budget refused <url>: <why>", and
`console.log` has a `[budget] refused` line. Stop there and say so in the report; never work
around it. Netflix has no counter: load it by hand, once, and never in a loop.
