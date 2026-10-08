---
name: browser-tests
description: Run, debug, and add the website's Playwright browser tests (apps/web/e2e). Picks the smallest run (one spec or one test, on next dev locally or on the production build in workerd as CI runs it), reads a failure from its error-context.md, trace, video, and screenshot, and writes specs the repository's way, including a regression test for a bug before fixing it. Use when changing a page, component, route, or redirect, when a browser test fails locally or in CI, or when a website bug is reported.
---

# Run and debug the browser tests

The suite is in `apps/web/e2e/`, configured by `apps/web/playwright.config.ts`. It runs every spec
at two widths, `desktop` and `phone`, against the site on the dictionary fixtures
(`packages/dictionary-core/src/fixtures/`): the words 要る, いる, 炒る, 入る, 射る, 鋳る, 要, 要項,
要求 and a few more, the kanji 要, and the searches `iru`, `いる`, and `要`. Every test fails if a
page logs a console error or throws, which is where hydration errors show.

Run commands in `apps/web`. The first run needs Chromium: `pnpm exec playwright install chromium`.

## 1. Pick the smallest run

```bash
pnpm test:e2e e2e/word.spec.ts                         # one spec file, both widths
pnpm test:e2e e2e/word.spec.ts -g "Frequency Details"  # one test
pnpm test:e2e --project desktop                        # one width
pnpm test:e2e                                          # everything, before a pull request
```

Leave out the `--` pnpm scripts usually take: pnpm passes it on, and Playwright then reads every
option after it as a file filter.

- **Locally** the suite starts `next dev` on port 3100 with `ZENBU_DICTIONARY_FIXTURES=1`, which
  makes the site read the fixtures even when `.dev.vars` names a dictionary service, and reuses a
  server already on that port. `E2E_BASE_URL=<url>` runs against a server you started instead.
- **In CI** (`Web`, the `e2e` job) it runs on the production build in workerd, where the Worker's
  redirects and headers behave as deployed: `pnpm exec opennextjs-cloudflare build`, then
  `E2E_SERVER=preview pnpm test:e2e`. OpenNext can't build on Windows; there, run that in a
  Linux container, such as `mcr.microsoft.com/playwright`, at the version in
  `apps/web/package.json`.
- **On the production build locally**, build first, without `SITE_ENV`, as CI does:
  `pnpm exec opennextjs-cloudflare build && E2E_SERVER=preview pnpm test:e2e`. The tests load the
  build in `.open-next/`, not the source, so refuse to run them on a build older than your last
  change, or on one a deploy made with `SITE_ENV` set: it tests other code, and its pass means
  nothing. Playwright also reuses a server already on port 8787, so stop a preview you started
  earlier first. This lists what changed since the last build; rebuild when it lists anything, or
  when it says `.open-next/worker.js` is missing:

  ```bash
  find src worker.ts next.config.ts ../../packages/dictionary-core/src -newer .open-next/worker.js -type f
  ```

## 2. Read a failure

1. `error-context.md` in the test's own folder, which Playwright writes under `results` in
   `apps/web/e2e/`: the error, the call log, and the page's accessibility snapshot when it failed.
   It's often enough by itself.
2. The screenshot, video, and trace beside it. `pnpm exec playwright show-trace <path>/trace.zip`
   opens the trace for a person.
3. The server's side. Playwright prints what the server writes to stderr, which holds the site's
   `log('error', …)` lines (`apps/web/src/lib/log.ts`); run with `DEBUG=pw:webserver` to see all
   of its output, the `info` and `warn` lines too. A server Playwright reused, or the one
   `E2E_BASE_URL` names, prints in its own terminal instead. On the production build, wrangler
   also writes each run's log to a file, under `~/Library/Preferences/.wrangler/logs/` on macOS
   and `~/.config/.wrangler/logs/` on Linux. The suite reads the fixtures, so it never calls the
   dictionary service; on the whole dictionary (`verify-web`), the service prints one JSON line
   per request, with its route, status, and time, in the terminal it runs in
   (`docs/agents/dictionary-api.md`). Compare their times with the trace's.
4. A test that passes alone but fails in the full run usually races the page: an element that
   re-renders, or a list that loads more on its own when scrolled to (the examples do). Wait for
   the result the learner sees, not a fixed time.
5. To watch it happen, go through the same steps with the `verify-web` skill.

In CI, a failure uploads the HTML report and those folders as the `playwright-report` artifact:
`gh run download <run-id> -n playwright-report` fetches it, and
`gh run view <run-id> --log-failed` prints the failing step's log, with the server's lines
Playwright printed.

## 3. Write specs the repository's way

- Import `test`, `expect`, and the fixture helpers from `e2e/test.ts`, never from
  `@playwright/test` (types aside), so the console check applies; Biome refuses the other import
  in a spec. A test that expects an error, such as a 404
  page's failed resource, allows it with `test.use({ allowedConsoleErrors: [/status of 404/] })`.
- Find things as a learner does: `getByRole` with the accessible name, `getByText`. The
  accessibility snapshot in `error-context.md`, or `take_snapshot` in `verify-web`, shows the
  names. Never select by CSS class.
- Name words by their fixture entry (`word(1546640)`, `needed`), and build expectations from the
  fixtures (`searchOrder('iru')`), so a fixture change can't leave a test passing by accident.
- Open pages at their canonical URLs, with the trailing slash. A URL without it tests only the
  redirect; check redirects and statuses with `request.get(path, { maxRedirects: 0 })`, on
  `desktop` only.
- A behavior in `apps/web/docs/product/` with a browser test names it in its entry's Check line.
- A new kind of page goes in `apps/web/e2e/page-types.ts`, which the phone checks, the contrast
  check, and the phone gallery read (`docs/agents/web.md`, Phone layout).

## 4. A regression test for a bug

For a website bug, write the test that shows it first and watch it fail, then fix the code and
watch it pass. Put it in the spec for the page it's on, named for the behavior the learner should
see, not the bug. If the fixtures can't show it (it needs a word they don't have), say so in the
pull request and check it with `verify-web` on the whole dictionary instead.
