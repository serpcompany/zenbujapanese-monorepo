# Quality

A grade for each product area and layer, from what the repository holds: its automated tests,
whether CI runs them before a pull request merges, whether docs describe its behavior, and how a
change is checked by hand. Each row names the code its grade covers (Code) and the day it was
last graded (Graded, in UTC). The line under each table gives the evidence for each grade and the
main gap, which is what would raise it. Known debt, each item with its issue, is in
[`tech-debt.md`](tech-debt.md) and [`harness-debt.md`](harness-debt.md).

The weekly maintenance report lists every row whose code changed after the day it was graded, under
"Scores to re-grade", and doc gardening re-grades those rows ([`ci-agents.md`](agents/ci-agents.md),
Weekly maintenance). A folder in Code counts as changed when any file in it changes.

| Grade | Means |
| --- | --- |
| A | Tests cover the behavior, CI runs them on every pull request that changes it, and docs describe it. What's left is small and tracked. |
| B | Tests, CI, and docs cover the main behavior, but a notable part is checked only by hand, or not at all. |
| C | Tests and docs exist, but one leg is missing: no CI runs the tests before merge, or no doc describes the behavior. |
| D | Almost nothing is tested, run before merge, or written down. |

"By hand" means a person or an agent checking the running app or site.

## The apps

The app's areas are graded in [`quality-ios.md`](quality-ios.md), and the website's in
[`quality-web.md`](quality-web.md).

## Dictionary service and core

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dictionary service | A | 2026-10-14 | `apps/dictionary-api/src/` | The six app-recorded suites, replayed on the app's data in `apps/dictionary-api/src/conformance/`, each once more through the entry point the app calls, whose answer for the words a list of lines counts is held to the words it links in the example suite's sentences, and the romaji suite, replayed through the core and through that entry point (`romaji.conformance.test.ts`), beside `sentence-search.test.ts`, `full-text.test.ts`, `conjugation-examples.test.ts`, `frequency.test.ts` (the bundled lists read from their own files as the app reads them, and under their schemas as the service does), `browse.test.ts`, `browse-categories.test.ts`, `word-cards.test.ts`, and `app-routes.test.ts`; the routes in `apps/dictionary-api/src/app.test.ts`, the app routes' tokens, scopes, and limits in `src/app-routes.test.ts`; and their OpenAPI contract and API reference in `src/openapi.test.ts`, held to the core's types and to each error the routes answer, with every answer on the app's data checked against it | `Dictionary API`, where the suites fail rather than skip without the data, and the core's fixtures must match what the service exports from it; `Dictionary API deploy` builds the image and checks that it answers | [`dictionary-api.md`](agents/dictionary-api.md), the app routes' [API reference](api/dictionary-api.md), ADR 0009 | `pnpm dev` and its routes; `verify-web` on the whole dictionary |
| Shared dictionary core | A | 2026-10-14 | `packages/dictionary-core/src/` | Unit tests beside the code in `packages/dictionary-core/src/` (`search`, `results`, `detail`, `examples`, `browse`, `cards`, `artifact`, `sources`, whose credits are held to `docs/data-sources.md`, and `embedded`, which also fails when the app's bundle isn't built from the source); the service's suites run through it, and `tokenizer.conformance.test.ts` holds the tokenizer to the tokens recorded from kuromoji.js (`tokenizer.json`) | `Dictionary core` (Biome with its import rules, typecheck, and tests); `Repository`'s import check, which refuses any runtime the core reaches; `Dictionary API`, which replays the app's suites through the app's entry point and checks the fixtures against the data | [`dictionary-core.md`](agents/dictionary-core.md), ADR 0008 | Through the service and the website |

- **Dictionary service, A.** Every recorded suite runs on the real data on each pull request that
  changes the service, the core, a suite, or the data, and the image is checked before it ships.
  Main gap: sentence search is held to the service's own cases, not to the app (#470).
- **Shared dictionary core, A.** Unit tests, the recorded suites, and import rules that keep it
  free of any runtime all run before merge. The app runs all of it, so each rule has one
  implementation (#481). Main gap: the app's own tests of the Swift around it don't run before
  merge.

## Account service

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account service | A | 2026-10-14 | `apps/account-api/src/`, `apps/account-api/migrations/` | `apps/account-api/src/config.test.ts`; the routes in `apps/account-api/src/http/app.test.ts`; sign-in in `apps/account-api/src/auth/` (codes, providers, linking, tokens, the open routes, and the website's cookie session, refused from another site), the whole service on PGlite with stand-ins for Apple's and Google's keys; `/v1/me` and `/v1/sync` in `apps/account-api/src/http/` (access, apps and their scopes, profiles, known words and lists, watch history and its newest 50, bookmarked sentences and their cap, conflicts, the journal, cursors, retries, bounds, rate limits, and the logs), the OpenAPI contract and its API reference against the routes, each route's scope, every documented sync example, and every sign-in answer; the profile and cursor rules in `apps/account-api/src/domain/`, the username's from the cases the app's tests read too (`apps/account-api/src/domain/username-cases.json`); the mailer in `apps/account-api/src/email/`; and the migrations, the schema's rules, the journal's trigger, and the `pg` driver in `apps/account-api/src/db/`, on PGlite or, in CI, Postgres 18, where changes made at once to one account, and watches past its 50 videos, are raced | `Account API`, against Postgres 18; `Account API deploy` builds the image and checks that it migrates an empty database, answers, and publishes a signing key | [`account-api.md`](agents/account-api.md), the [API reference](api/account-api.md), the [client guide](agents/account-clients.md), ADR 0013 | `pnpm dev` with the dev mailbox, and its routes |
| What the Node services share | A | 2026-10-14 | `packages/node-service/src/` | `packages/node-service/src/log.test.ts`, `http.test.ts`: the request log, a real server stopped with SIGTERM, and the port it is given, never one already in use, and `api-reference.test.ts`: the API reference's routes, fields, answers, sync entities, and error index | `Account API`; `Dictionary API` runs the dictionary service's tests through it | [`dictionary-api.md`](agents/dictionary-api.md), Code layout | Through both services |

- **Account service, A.** Sign-in, its tokens and refusals, profiles and sync, the mailer, the
  routes and their contract, configuration, migrations, and database driver are tested on every pull
  request that changes them, with the driver and the races against a real Postgres, Better Auth's
  origin and CSRF checks forced on as in production, and the migrations checked against their
  snapshots, and the image is checked before it ships. Main gaps: Apple's and Google's real keys and
  useSend are first used on staging, the website's Apple deletion with them; it hasn't run on the
  server (#565's, #566's, and #567's server steps); and the iOS app syncs with it from Debug builds
  on staging, and from 2.0.0's TestFlight and App Store builds in production (#573, #616).
- **What the Node services share, A.** Small, and tested on its own and through both services.

## Language data

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Language-data pipeline | B | 2026-10-12 | `language-data/pipeline/` | `language-data/pipeline/tests/`: the packager, the publisher against a fake bucket, the schemas, and which changes start the build and release workflows | `Language data build`: the tests, then packaging and validating the release | [`language-data/README.md`](../language-data/README.md), ADR 0006 | `package.py build` and `validate` on a workstation |
| iOS data tools | B | 2026-10-12 | `apps/ios/Tools/` | `apps/ios/Tools/tests/`: contract tests for the frequency packs, the example word index, compound pitch, the ranked lists, and the JLPT kanji levels, a provenance test that fails when a tool changes without the data it built, and `test_simulator.py` for the script that hands a checkout its Simulator | `iOS` runs the contract tests on pull requests that change `apps/ios`; Ruff lints the tools in `pnpm verify`. `Language data build` checks the pins between the files they write, when those files change | [`apps/ios/Tools/README.md`](../apps/ios/Tools/README.md), [`apps/ios/LanguageData/Sources/README.md`](../apps/ios/LanguageData/Sources/README.md), [`ios.md`](agents/ios.md), [`data-sources.md`](data-sources.md) | `rebuild_language_data.py` rebuilds everything on the pinned Python and runs the contract tests; then re-record the suites on a Mac |

- **Language-data pipeline, B.** Every pull request that changes the data or the pipeline
  rebuilds and validates the release. Main gap: publishing has run only against the fake bucket,
  since the `language-data-release` environment has no R2 token, and no client reads a release
  yet (#463, #473).
- **iOS data tools, B.** The `iOS` workflow runs the four contract tests before merge, and a
  rebuild is one command, on a pinned Python, from sources archived beside their records. But the
  importers, such as `apps/ios/Tools/import_jmdict.py`, have no tests of their own. Main gap: an
  importer change is checked only through the files it writes.

## Delivery

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Website and service deploys | B | 2026-10-12 | `.github/workflows/web-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/account-api-deploy.yml`, `apps/web/scripts/`, `deploy/`, `apps/account-api/deploy/`, `apps/dictionary-api/Dockerfile`, `apps/account-api/Dockerfile` | `apps/web/scripts/smoke.sh` after each deploy, where staging's run gates production, though from CI it skips its dictionary checks; `apps/web/src/lib/dictionary-service-deploy.test.ts`, which runs `use-dictionary-service.sh` on a copy of `wrangler.jsonc`; the image checks in `Dictionary API deploy` and `Account API deploy`; `apps/web/scripts/wait-for-dictionary-service.sh`, which ships the service's image before the site; `tools/checks/src/deploy-workflows.test.ts`, which holds every job that pushes or deploys to the guard against deploying over a later run; `tools/checks/src/deployer/`, which runs the server's deployer itself against stand-ins for Docker, cosign, Slack, and the journal: each deploy path, each refusal, its Slack alerts and what they may hold, and a run cut short | The image checks; the deployer's tests, ShellCheck on the deployer and the backups, and actionlint in `Repository`. The deploy workflows run after merge | [`web.md`](agents/web.md), Environments and deploys; [`api-servers.md`](agents/api-servers.md) and [`deployer-alerts.md`](agents/deployer-alerts.md); [`dictionary-api.md`](agents/dictionary-api.md) and [`account-api.md`](agents/account-api.md), Ship it | `verify-web` on staging; the dictionary service's earlier deployer was checked by hand on staging |
| iOS releases | C | 2026-10-12 | `apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj`, `apps/ios/metadata/`, `apps/ios/CHANGELOG.md` | `apps/ios/Tools/tests/test_account_service_settings.py` (the App Store record's team and bundle identifier in both configurations, and production's account service in Release) and `apps/ios/Tools/tests/test_app_platforms.py` (platforms, privacy strings, entitlements) | `iOS` runs both on pull requests that change `apps/ios`; nothing builds or archives a Release build | [`ios.md`](agents/ios.md), The App Store record | Archiving and uploading in Xcode, the listing in App Store Connect, and a TestFlight build checked on a device |

- **Website and service deploys, B.** The image is checked and signed before it's published, the
  server runs only images main signed, a job never deploys over a later run's, and the deployer's
  tests run it against stand-ins on every pull request: each deploy path, each refusal, and what it
  posts to Slack. But Bot Fight Mode challenges CI runners, so nothing in CI sees the server deploy,
  and the smoke test skips its dictionary checks there. Main gaps: nothing checks a deployed service
  before production moves, and the deployer's Slack alerts are off until an owner turns them on
  ([`harness-debt.md`](harness-debt.md), Delivery); a change to a deploy workflow is first exercised
  on `main`; the server runs whichever `deploy/deployer.sh` someone last installed, which nothing
  compares with the repository's; the deployer both services share, and its alerts, haven't run on
  the server yet; and the account backups have no tests.
- **iOS releases, C.** Contract tests pin a release's settings on every iOS pull request, and
  `ios.md` says how a build reaches TestFlight and the App Store. But nothing builds a Release
  archive before a person does in Xcode, and nothing checks the listing. Main gap: #381.

## Repository

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Repository checks | A | 2026-10-14 | `tools/checks/`, `.claude/`, `knip.json`, `lefthook.yml`, `.github/workflows/repository.yml`, `.github/workflows/code-review.yml`, `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml` | The checks' tests in `tools/checks/src/`: docs and the doc rules (`tools/checks/src/doc-rules/`), sizes, secrets, duplicates and their exceptions, imports (on scratch packages with a cycle, an unused module, and a test import), the pull request rules, the hooks (run as Claude Code runs them, in scratch repositories), the pre-push hook's choice of packages (`git-hooks.test.ts`, run by lefthook in scratch repositories), the report, the workflows' own rules (`workflow-rules.test.ts`: a time limit on every job, actions pinned by commit wherever a secret is read, and one file for each toolchain's version; `workflows.test.ts`: each workflow's jobs played out, a heavy job never starting once a fast check failed), the script that hands a checkout its ports (`ports.test.ts`, in scratch repositories with worktrees, many asking at once), and the comment checks' in `tools/checks/src/comments/`; the agent tooling's in `tools/checks/src/agents/`: the permission rules, `.mcp.json`, and the scripts of the review, `@claude`, and both gardening jobs, each run even when Claude's step fails. The package also holds the server's deployer's tests (`tools/checks/src/deployer/`), graded under Delivery | `Repository`, on every pull request: the checks' own tests, then `pnpm verify` (no comments, docs, sizes, secrets, duplicate code, dead code, imports, and the linters), and on a `fix/` branch, a changed test | [`code.md`](agents/code.md) | `pnpm verify`; the git hooks; Claude Code's edit hook |

- **Repository checks, A.** They run on every pull request and in the git hooks, an agent's edits
  are checked as it writes them, in a worktree too, and its whole change before a turn ends, and
  each failure says how to fix it. The docs' links, anchors, paths, scripts, named tests, and sizes
  are checked on every pull request; whether their prose still matches the code is checked only
  weekly, by doc gardening in `Weekly maintenance`. Main gaps: no check is required to merge yet, an
  owner's setting; Swift has no linter (#516); and nothing refuses a cast of parsed JSON
  ([`harness-debt.md`](harness-debt.md), Checks).

Re-grade an area, and set its Graded date to that day, in the same pull request that changes its
tests, CI, or docs, even when its grade stays the same.
