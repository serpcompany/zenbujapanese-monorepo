# The Extension workflow

What the `Extension` workflow runs and why. Every workflow and what starts it is in
[`ci.md`](ci.md); how to run the same checks locally is in [`extension.md`](extension.md).

## Its jobs

`.github/workflows/extension.yml` runs `pnpm check` in `apps/extension` (Biome with its layer
rules, typecheck, Vitest, the release build, and the test build) on pull requests that change the
extension, `packages/ui`, which draws it, the core, or `assets/brand`, whose mark the side panel
shows ([`extension.md`](extension.md)). On the same pull requests, `Extension packages` builds and
checks the staging and Chrome Web Store packages ([`ci-deploys.md`](ci-deploys.md)). It filters by
`paths`, so it isn't a check to require.

Its `browser` job starts once `check` passes, under a 20-minute limit. It loads the test build in
Playwright's Chromium and runs the browser tests (`pnpm test:browser`,
[`extension-browser-tests.md`](extension-browser-tests.md)), all offline, against a local
language-data server that serves a fixture release the tests build in memory, so the job reads
nothing from Git LFS. A failed test isn't retried; its report, traces, and screenshots
go up as the `extension-playwright-report` artifact for a week.
