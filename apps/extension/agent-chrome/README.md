# Agent Chrome

A branded Google Chrome that an agent on this Mac starts, loads an unpacked extension into, drives,
and reads logs from, with no one at the keyboard. Built for #945, moved here by #952. The
`verify-extension` skill runs it; [`docs/agents/extension.md`](../../../docs/agents/extension.md)
says where it fits beside the Playwright tests, which use Playwright's Chromium instead.

- **Chrome:** `/Applications/Google Chrome.app`, branded, so it has Widevine and the Translator.
- **One per Mac.** DevTools listens on `127.0.0.1:9339` and the harness's control on `9340`, and
  the state file and lock are Mac-wide (`~/Library/Caches/com.zenbujapanese.agent-chrome/`), so a
  checkout sees another's Chrome. `start`, `selftest`, and `verify` take the `lock` file before
  they spawn a daemon (`lock.mjs`), so two agents starting at once can't both get one: the second
  fails at once with "Chrome is in use by pid N" and leaves the first running. The lock names the
  daemon's pid, goes when it stops, and is taken over once its pid is dead: under `lock.break`,
  only if it still names that dead pid, so two agents that find it stale can't remove each
  other's fresh lock. If an agent died holding `lock.break`, the error names the file to remove.
  Taking the lock also removes `lock.<pid>` files a dead agent left. A start also refuses
  a Chrome on 9339 that this harness didn't start, and a daemon that finds 9340 taken exits with
  the holder's pid, touching nothing. A run accepts only the state its own daemon wrote, stops
  only that daemon, and on any failed start stops its daemon and Chrome. Check `status`, and
  `stop` when done.
- **Offline by default.** `start`, `selftest`, and `verify` send every host but `127.0.0.1` and
  `localhost` to nowhere. `start --online` is the only way to reach a real site, and it holds
  YouTube's hosts to the request budget (Limits).
- **Profiles.** Each run gets a fresh profile under the checkout's
  `tmp/agent/agent-chrome/profiles/`, deleted when it stops. `--persistent` uses
  `~/Library/Application Support/Zenbu Agent Chrome`, outside every checkout, whose cookies,
  Widevine, and Translator model stay between runs. Never the owner's own profile.
- **Logs:** the checkout's `tmp/agent/agent-chrome/logs/`.

## Use

From `apps/extension`, after `pnpm install` at the root. `pnpm --silent agent-chrome <command>`
runs `node --experimental-strip-types agent-chrome/ctl.mjs`:

```sh
pnpm --silent agent-chrome status
pnpm --silent agent-chrome selftest [--headful] [--name <proof folder>]
pnpm --silent agent-chrome verify [--name <proof folder>] [--skip-build]
pnpm --silent agent-chrome start --ext <unpacked dir> [--headless] [--online] [--map-host <host>] [--persistent] [--net <regex>] [--pages runtime|console|off] [--unmute]
pnpm --silent agent-chrome load <dir> | unload <id> | open <url> | goto <url> [--new] [--page <url part>]
pnpm --silent agent-chrome click '<selector>' | eval [--raw] '<js>' | key <key> | type <text> | shot [file] [--full]
pnpm --silent agent-chrome pages | targets | tail [n] [net] [--grep <regex>]
pnpm --silent agent-chrome stop
```

- **`selftest`** starts a fresh, headless, offline Chrome with `selftest-extension/` and
  `--map-host www.youtube.com`. On the stand-in watch page it proves the content script, a click
  answered by the service worker, a muted `<video>` playing and seeking (and that `muted` held),
  then the popup, and an offscreen document's dedicated worker answering a ping, cold and again
  after `chrome.offscreen.closeDocument()`. It checks each from the log, keeps screenshots, and
  stops Chrome.
- **`verify`** builds `dist-test/` and starts the local language-data server
  (`e2e/local-server.ts`) and a fresh, headless, offline Chrome with the build. It opens the side
  panel and Settings in light and dark, sees the test content script's surface on `hostile.html`,
  closes the offscreen document and checks again from that surface, downloads `releases.json`, the
  pinned manifest, and one file from the local server and checks their SHA-256, then stops Chrome.
- **Proof** goes to `tmp/agent/verify/<name>/`: `console.log` (the run's log lines), `run.json`
  (each expected line, each result, and the failures), and the screenshots, also when a step
  throws or Chrome never starts. Exit 1 on a failure. Each of the self-test's messages waits
  10 s at most, so a worker that never answers fails as "no answer from the offscreen worker".

A script drives a running Chrome with Puppeteer: `import { connect } from './connect.mjs'`, then
`const { browser, page } = await connect()`, and `browser.disconnect()`, never `close()`.

## Logs

`console.log`, one line per message, from every page (the main world, each extension's isolated
world, so content scripts, and the harness's own), each extension service worker, offscreen
document, and worker, with exceptions and Chrome's log entries. `[harness]` lines say what it
attached to and each page it opened, so a run proves a page opened from the log. `[video]` lines
are each `<video>`'s `play`, `pause`, `seeking`, and `seeked`, with `currentTime` and `muted`, from
a listener in an isolated world of its own. `[site]` lines are the stand-in site's requests.
`net.log` (only with `--net <regex>`) has the status, type, and URL of each matching response.
`daemon.log` is the harness itself. Logs append; delete them when they grow.

## How it works

`daemon.mjs` launches Chrome with Puppeteer over a pipe, with `--enable-unsafe-extension-debugging`
and `--remote-debugging-port=9339`, and loads each extension with CDP `Extensions.loadUnpacked`
(branded Chrome 137 and later ignore `--load-extension`). It drops Puppeteer's
`--enable-automation`, its background-networking and component switches (so Widevine and the
Translator model download), keeps `--use-mock-keychain`, mutes audio, and allows autoplay. It
attaches a CDP session to each target and resumes it with `Runtime.runIfWaitingForDebugger`, or an
offscreen document's dedicated worker stays paused (#1057). On a page it enables `Page` and adds
the video listener with `Page.addScriptToEvaluateOnNewDocument`.

- **Offline,** the default, adds `--host-resolver-rules` that send every host but `127.0.0.1` and
  `localhost` to nowhere. `--online` drops them and turns on the YouTube budget.
- **`--map-host <host>`** serves `site/` over HTTPS from `127.0.0.1`, maps the host to it with
  `--host-resolver-rules`, and trusts only its self-signed certificate, made with `openssl` for the
  run, by its SPKI hash (`--ignore-certificate-errors-spki-list`). No request reaches the real
  host.

**Tests.** `pnpm test` runs `agent-chrome/*.test.mjs` with no Chrome: the lock, the start's
cleanup, the daemon's taken control port, and the budget. They run `test-daemon.mjs`, a stand-in
daemon, and point the harness at a temporary state folder and free ports
(`AGENT_CHROME_STATE_DIR`, `AGENT_CHROME_DEVTOOLS_PORT`, `AGENT_CHROME_CONTROL_PORT`).

## Limits

- **YouTube's request budget,** from one IP, set in one place, `youtubeBudget` in
  `youtube-budget.mjs`: at most 4 page loads an hour and 10 a day on `youtube.com`,
  `youtube-nocookie.com`, and `youtu.be` (each document, frames too), one `timedtext` request
  every 30 minutes, and after a 429 from them, nothing for 6 hours (#945: hours of loads blocked
  this Mac's IP for over 5 hours). An online Chrome pauses each request to those hosts
  (CDP `Fetch`), counts it in the Mac-wide `youtube-requests.json` beside the state file, and
  fails one past the budget with `ERR_BLOCKED_BY_CLIENT` and a `[budget] refused <url>: <why>`
  line in `console.log`; `goto` says the same. Nothing in a loop. The stand-in site and an offline
  Chrome spend none of it.
- **Sound:** set `video.muted = true` in the page and check that it held, since `--mute-audio`
  alone let sound through on 2026-10-22 (#945). The selftest does both.
- **Headless:** extensions, logs, playback, and Widevine work; the Translator reported
  `downloadable` again in headless after a headful window had downloaded it. Use headful
  (`--persistent`, no `--headless`) for the Translator and Netflix; its window is muted.
- **Netflix:** the persistent profile is signed out. Agents never type a password here.
- **chrome-devtools MCP:** `chrome-devtools-mcp@1.10.1 --browserUrl http://127.0.0.1:9339
  --categoryExtensions` attaches to a running agent Chrome; the repository's `.mcp.json` server is
  `--isolated` and can't.
