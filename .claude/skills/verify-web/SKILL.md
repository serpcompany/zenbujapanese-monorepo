---
name: verify-web
description: Check a zenbujapanese.com change in a real browser. Runs the site locally (pnpm dev in apps/web, on the dictionary fixtures or on the whole dictionary through a local dictionary service), or opens staging, and drives it with the chrome-devtools MCP server (navigate, accessibility snapshot, click and fill, screenshot, recording, console, network, phone widths), then compares what it shows with the website's product docs. Use after changing pages, components, routes, redirects, or headers, and to reproduce a website bug before fixing it.
---

# Check a website change in the browser

This is the look an agent takes by hand. What should keep working goes in a browser test that
runs on every pull request (the `browser-tests` skill).

The `chrome-devtools` MCP server in `.mcp.json` opens its own Chrome with a temporary profile
(`--isolated`), so sessions in different worktrees never share state. Every page tool takes a
`pageId`, which `list_pages` and `new_page` return. Give tools absolute paths.

## 1. Run the site

Pick the smallest setup that shows the change. Run one site at a time on this machine.

- **On fixtures**: `pnpm dev` in `apps/web` serves `http://localhost:3000/`. Without a dictionary
  service, dictionary pages read the local fixtures (`packages/dictionary-core/src/fixtures/`):
  twelve words and the kanji 要, such as `/dictionary/要る-1546640/` and `/dictionary/search/要/`,
  and searches that find them, such as `/dictionary/search/いる/`. Other words are 404s here.
- **On the whole dictionary**: start the dictionary service first (`pnpm dev` in
  `apps/dictionary-api`, set up as in `docs/agents/dictionary-api.md`, Run it), wait until
  `http://localhost:8788/healthz` answers 200, then name it in `.dev.vars` in `apps/web` (as in
  `docs/agents/web.md`, Dictionary) and restart the site. Never print `.env` or `.dev.vars`:
  they hold the token. Sentence search, examples, and conjugated forms need this setup.
- **The production build**: `pnpm preview` builds with OpenNext and serves the Worker in workerd,
  which is where redirects, headers, and caching behave as deployed. OpenNext can't build on
  Windows; there, build in a Linux container, or check the change on staging after it deploys.
- **Staging**: `https://staging.zenbujapanese.com/` runs `main` after `Web deploy`. The zone's
  Bot Fight Mode can challenge an automated browser: a challenge page there says nothing about
  the site, so check locally instead.

Stop what you started when you're done: end the dev server's whole process tree.

## 2. Reproduce first

For a bug, open the failing page before changing code, and keep the evidence in `tmp/` at the
repository root (git ignores it):

- `take_screenshot` and `take_snapshot` with a `filePath`.
- A recording: `screencast_start` with a `filePath` ending in `.webm` or `.mp4`, go through the
  steps, then `screencast_stop`. It needs ffmpeg on the PATH, and records only frames where the
  page changes, so start it before the steps.

After the fix, record the same steps again, so the pull request shows both.

## 3. Check the change

For each page the change touches:

1. `navigate_page` to its URL. Page URLs end in a slash (`/dictionary/search/見る/`); a URL
   without it only tests the redirect.
2. `take_snapshot` reads the accessibility tree: check text, headings, links, and their order
   there rather than guessing from a screenshot. Its `uid`s are what `click`, `fill`, and `hover`
   act on; `wait_for` the text that shows the result (a sheet opening, more examples loading).
3. `take_screenshot` checks layout at desktop and phone widths. Set the width with `emulate`
   (`viewport` `"1440x900x1"`, or `"390x844x3,mobile,touch"` for a phone), then reload. Avoid
   `resize_page`: a tab it resized in a headless session stopped receiving clicks.
4. `list_console_messages`: no errors. A hydration error (React #418 or #423) means the server's
   HTML differs from the first render in the browser.
5. `list_network_requests`: no failed requests. The dictionary service is called from the server,
   so the browser sees only the site's own routes, such as the `examples.json` and
   `conjugations/*.json` routes that load more of a page.
6. Compare what you see with the behavior's entry in `apps/web/docs/product/`. A difference with
   no decision on file is a bug; a deliberate change updates the entry in the same pull request.

On the production build or staging, also check what only it does, with `get_network_request` on
the page's document request: a URL without its slash answers 308 to the one with it, and staging
sends `X-Robots-Tag: noindex`.

## 4. Report

Say which URLs, widths, and setup (fixtures, local service, preview, or staging) you checked,
what the snapshot showed for the behavior you changed, whether the console and network were clean,
and where the screenshots and recordings are. A check you couldn't run is reported as not run,
not as passed. A website change needs this evidence in its pull request (`docs/agents/code.md`).

## Setup

- The server is enabled for this repository in `.claude/settings.json`; `npx` downloads the pinned
  version on first use. Chrome must be installed. Recording needs ffmpeg
  (`winget install ffmpeg`, `brew install ffmpeg`).
- Without a display (a cloud or CI agent), add `--headless` with a local override from the
  repository root, which Claude Code prefers to the project's entry:
  `claude mcp add chrome-devtools --scope local -- npx -y chrome-devtools-mcp@1.10.1 --isolated --headless --experimental-screencast --no-usage-statistics --no-performance-crux`
