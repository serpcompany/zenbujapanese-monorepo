# Quality

A grade for each product area and layer, from what the repository holds: its automated tests,
whether CI runs them before a pull request merges, whether docs describe its behavior, and how a
change is checked by hand. Each row names the code its grade covers (Code) and the day it was
last graded (Graded, in UTC). The line under each table gives the evidence for each grade and the
main gap, which is what would raise it. Known debt, each item with its issue, is in
[`tech-debt.md`](tech-debt.md), [`tech-debt-web.md`](tech-debt-web.md), and
[`harness-debt.md`](harness-debt.md).

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

The app's areas are graded in [`quality-ios.md`](quality-ios.md), its Account tab and Zenbu account
in [`quality-ios-account.md`](quality-ios-account.md), and the website's in
[`quality-web.md`](quality-web.md).

## Dictionary service and core

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dictionary service | A | 2026-10-26 | `apps/dictionary-api/src/` | The eight app-recorded suites, the sentence suites' Sudachi words and a sentence's results screen among them, replayed on the app's data in `apps/dictionary-api/src/conformance/`, each once more through the entry point the app calls, whose answer for the words a list of lines counts is held to the words it links in the example suite's sentences, and for the glosses a word's meaning offers to JMdict's own, which the word-detail suite records for every sense, whole, with each sense's checked example, and the romaji suite, replayed through the core and through that entry point (`romaji.conformance.test.ts`), beside `sentence-search.test.ts`, `full-text.test.ts`, `conjugation-examples.test.ts`, `frequency.test.ts` (the bundled lists read from their own files as the app reads them, and under their schemas as the service does), `browse.test.ts`, `browse-categories.test.ts` (each usage category's word label the note on every meaning it labels), `word-cards.test.ts`, `app-routes.test.ts`, and `sudachi-pack.conformance.test.ts` (the Sudachi pack the cases in `language-data/conformance/sudachi-pack.json` name, which the app and its build replay too); the routes in `apps/dictionary-api/src/app.test.ts` (an examples offset past a word's list answered as none), the app routes' tokens, scopes, and limits in `src/app-routes.test.ts`; and their OpenAPI contract and API reference in `src/openapi.test.ts`, held to the core's types and to each error the routes answer, with every answer on the app's data checked against it; the start refused on files that aren't the pinned language-data release's in `src/load.test.ts`; the thread pool sending a request back to the thread that answered its query, word, form, or kanji before when that thread is as free as any, is still computing it, or was slow to, and anything else to the least busy, and naming the build its threads loaded without a call to one, for `/healthz` and a `/v1` answer's headers too, in `src/pool.test.ts`; and `/v1/retired` answering a release's retired entries in `src/retired.test.ts`, and the committed release's on the app's data in `src/conformance/retired.test.ts` | `Dictionary API`, where the suites fail rather than skip without the data, and the core's fixtures must match what the service exports from it; `Dictionary API deploy` builds the image and checks that it answers | [`dictionary-api.md`](agents/dictionary-api.md), its threads in [`dictionary-api-threads.md`](agents/dictionary-api-threads.md), the app routes' [API reference](api/dictionary-api.md), ADR 0009 | `pnpm dev` and its routes; `verify-web` on the whole dictionary |
| Shared dictionary core | A | 2026-10-26 | `packages/dictionary-core/src/` | Unit tests beside the code in `packages/dictionary-core/src/` (`search`, which also replays the sentence suite's words and runs romaji search, each spelling and its order, on an in-memory artifact, `results`, `detail`, `examples`, `browse`, `cards`, `artifact`, whose example retrieval runs on an in-memory artifact in either width and case, `sources`, whose credits are held to `docs/data-sources.md`, and `embedded`, which also fails when the app's bundle isn't built from the source); the service's suites run through it, and `tokenizer.conformance.test.ts` holds the tokenizer to the tokens recorded from kuromoji.js (`tokenizer.json`) | `Dictionary core` (Biome with its import rules, typecheck, and tests); `Repository`'s import check, which refuses any runtime the core reaches; `Dictionary API`, which replays the app's suites through the app's entry point and checks the fixtures against the data | [`dictionary-core.md`](agents/dictionary-core.md), ADR 0008 | Through the service and the website |

- **Dictionary service, A.** Every recorded suite runs on the real data on each pull request that
  changes the service, the core, a suite, or the data, and the image is checked before it ships.
  Main gap: a sentence's results screen, with its chips, is held to the service's own case, since
  the app recorded the results suite without Sudachi (#830).
- **Shared dictionary core, A.** Unit tests, the recorded suites, and import rules that keep it
  free of any runtime all run before merge. The app runs all of it, so each rule has one
  implementation (#481). Main gap: the app's own tests of the Swift around it don't run before
  merge.

## Account service

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account service | A | 2026-10-19 | `apps/account-api/src/`, `apps/account-api/migrations/` | `apps/account-api/src/config.test.ts`; the routes in `apps/account-api/src/http/app.test.ts`; sign-in in `apps/account-api/src/auth/` (codes, providers, linking, tokens, the open routes, and the website's cookie session, refused from another site), the whole service on PGlite with stand-ins for Apple's and Google's keys; `/v1/me` and `/v1/sync` in `apps/account-api/src/http/` (access, apps and their scopes, profiles, known words and lists, watch history and its newest 50, bookmarked sentences and their cap, notes, photos and their words, the profile photo, settings, recent searches and their newest 50, photo files uploaded, downloaded, refused, and swept, conflicts, the journal, cursors, retries, bounds, rate limits, and the logs), the OpenAPI contract and its API reference against the routes, each route's scope, every documented sync example, and every sign-in answer; the profile and cursor rules in `apps/account-api/src/domain/`; the R2 adapter against a stand-in S3 server in `apps/account-api/src/storage/`; the username's from the cases the app's tests read too (`apps/account-api/src/domain/username-cases.json`); the mailer, and each email in English and Japanese, in `apps/account-api/src/email/`, and the language a request names or an account keeps, through Google's web sign-in too, in `apps/account-api/src/auth/email-language.test.ts`; and the migrations, the schema's rules, the journal's trigger, and the `pg` driver in `apps/account-api/src/db/`, on PGlite or, in CI, Postgres 18, where changes made at once to one account, watches past its 50 videos, one photo uploaded six times at once, and an account deleted while an upload saves its row are raced; and the subscription in `apps/account-api/src/http/`, `src/billing/`, and `src/domain/`, against stand-ins for Stripe's API and Apple's certificates: each store's signed events (a purchase, a bad signature, a repeat, a renewal, a cancellation, a lapse, a refund, a billing retry and a grace period, deliveries out of order, and the store down), the app's transactions and whose they are, Checkout and the portal, the gate on sync and photo files, deletion with a subscription, and the settings | `Account API`, against Postgres 18; `Account API deploy` builds the image and checks that it migrates an empty database, answers, and publishes a signing key | [`account-api.md`](agents/account-api.md), [`account-entities.md`](agents/account-entities.md), [`account-photos.md`](agents/account-photos.md), [`account-email.md`](agents/account-email.md), [`account-billing.md`](agents/account-billing.md), the [API reference](api/account-api.md), the [client guide](agents/account-clients.md) and its [rules](agents/account-client-rules.md), ADRs 0013, 0019, and 0020 | `pnpm dev` with the dev mailbox, and its routes |
| What the Node services share | A | 2026-10-19 | `packages/node-service/src/` | `packages/node-service/src/log.test.ts`, `http.test.ts`: the request log, a real server stopped with SIGTERM, and the port it is given, never one already in use; `api-reference.test.ts`: the API reference's routes, fields, answers, the media types of a body or answer that isn't JSON, sync entities, and error index; and `api-host.test.ts`: which paths, `/v1/photos` and `/v1/webhooks` among them, the API host sends to each service | `Account API`; `Dictionary API` runs the dictionary service's tests through it | [`dictionary-api.md`](agents/dictionary-api.md), Code layout | Through both services |

- **Account service, A.** Sign-in, its tokens and refusals, profiles and sync, the mailer, the
  routes and their contract, configuration, migrations, and database driver are tested on every pull
  request that changes them, with the driver and the races against a real Postgres, Better Auth's
  origin and CSRF checks forced on as in production, and the migrations checked against their
  snapshots, and the image is checked before it ships. Main gaps: Apple's and Google's real keys and
  useSend are first used on staging, the website's Apple deletion with them; it hasn't run on the
  server (#565's, #566's, and #567's server steps); the iOS app syncs with it from Debug builds
  on staging, and from 2.0.0's TestFlight and App Store builds in production (#573, #797); and
  photo files have reached only a stand-in for R2, with R2 and nginx's body limit first used on
  staging (#867). The subscription has met neither Stripe nor Apple: no test-mode purchase or
  sandbox purchase has run, nor a webhook delivered through Cloudflare (#868).
- **What the Node services share, A.** Small, and tested on its own and through both services.

## Language data

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Language-data pipeline | B | 2026-10-24 | `language-data/pipeline/` | `language-data/pipeline/tests/`: the packager, the pins (the committed files, the app's bundle, and the image's copies against the pinned manifest, a build against it, and merged pins left unchanged, on a scratch repository, and the real repository's files against its pin), the retired entries (three synthetic releases: what each drops, a merged entry's replacement, a replacement dropped later, an entry that comes back, and each refusal; and the real releases' file), the core's hashes, the publisher against a fake bucket, the schemas, and which changes start the build and release workflows | `Language data build`: `check-pin` first, then the tests, packaging and validating the release, and comparing it with its pin | [`language-data/README.md`](../language-data/README.md), ADR 0006 | `package.py build`, `validate`, and `pin` on a workstation |
| Language-data tools | B | 2026-10-25 | `language-data/tools/`, `.github/workflows/jmdict-update.yml`, `packages/dictionary-core/scripts/romaji-search-forms.mjs` | `language-data/tools/tests/`: contract tests for the frequency packs, the example word index, compound pitch, the ranked lists, the JLPT kanji levels, and every entry's note identity, which earlier versions saved notes under, `test_unidic_pitch.py`: the UniDic pitch adapter on UniDic's real ハシ and カミ rows, each homophone keeping its own accent, `test_compound_pitch_rule.py`: the compound pitch rule on UniDic's real rows, each combination type, the special-mora shift, the gate, the C2 fallback, and the words it leaves out, `test_jmdict_examples.py`: on real excerpts of EDRDG's 2026-10-23 exports, the export with examples, its example blocks removed, is the one without (the header's mention of `<example>` kept), every entry row is the same either way, each meaning's examples link only to a bundled pair whose Japanese and English match, an earlier entry keeps its note identity, and the row delta names what was added, changed, and deleted, `test_jmdict_romaji.py`: the core's romaji forms reach the importer whole for a batch larger than a pipe, each under its kind, a provenance test that fails when a tool changes without the data it built, `test_rebuild_start.py`: the rebuild refuses to start while a path a tool derives from its own folder is missing, `test_refresh_jmdict_sources.py` and `test_refresh_jmdict_summary.py`: the monthly JMdict refresh's record, snapshot, evidence counts, note identities, next release, and stale suites, and its pull request's counts and steps, on the same excerpts; and `tools/checks/src/jmdict-update-workflow.test.ts` and `jmdict-update-export.test.ts`: the monthly workflow, its download step against a stand-in for EDRDG, and its push to a scratch remote with Git LFS | `iOS` runs the contract tests on pull requests that change `apps/ios` or the language data; Ruff lints the tools in `pnpm verify`. `Language data build` checks the pins between the files they write, when those files change; `Repository` runs the monthly workflow's tests | [`language-data/tools/README.md`](../language-data/tools/README.md), [`jmdict-updates.md`](../language-data/jmdict-updates.md), [`language-data/sources/README.md`](../language-data/sources/README.md), [`ios.md`](agents/ios.md), [`data-sources.md`](data-sources.md) | `rebuild_language_data.py` rebuilds everything on the pinned Python and runs the contract tests; then re-record the suites on a Mac, as a person does for each monthly JMdict pull request |

- **Language-data pipeline, B.** Every pull request that changes the data, the pipeline, or the
  service's Dockerfile checks the app's files and the image's copies against the pinned release,
  then rebuilds it, checks its retired entries against every pinned release, and compares it with
  its pin. Main gap: publishing has run only against the
  fake bucket, since the `language-data-release` environment has no R2 token (#828).
- **Language-data tools, B.** The `iOS` workflow runs the contract tests before merge, and a
  rebuild is one command, on a pinned Python, from sources archived beside their records. But most
  importers, such as `language-data/tools/import_jmdict.py`'s entries, have no tests of their own
  beyond the UniDic pitch adapter's, the compound pitch rule's, and the JMdict examples'. JMdict's
  monthly update runs in CI and opens its pull request, but a person records the app's suites it
  moves on a Mac ([`harness-debt.md`](harness-debt.md), Delivery). Main gap: an importer change is
  mostly checked only through the files it writes.

## Delivery

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Website and service deploys | B | 2026-10-21 | `.github/workflows/web-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/account-api-deploy.yml`, `apps/web/scripts/`, `deploy/`, `apps/account-api/deploy/`, `apps/dictionary-api/Dockerfile`, `apps/account-api/Dockerfile` | `apps/web/scripts/smoke.sh` after each deploy, where staging's run gates production and checks staging's password (`smoke-indexing.sh`), though from CI it skips its dictionary checks other than the sitemaps; `apps/web/src/lib/dictionary-service-deploy.test.ts`, which runs `use-dictionary-service.sh` on a copy of `wrangler.jsonc`; `apps/web/src/lib/dictionary-sitemaps-deploy.test.ts`, which runs the sitemap writer against a stand-in service and the deploy's sitemap step against a stand-in Docker; the image checks in `Dictionary API deploy` and `Account API deploy`; `apps/web/scripts/wait-for-dictionary-service.sh`, which ships the service's image before the site; `tools/checks/src/deploy-workflows.test.ts`, which holds every job that pushes or deploys to the guard against deploying over a later run; `tools/checks/src/deployer/`, which runs the server's deployer itself against stand-ins for Docker, cosign, Slack, and the journal: each deploy path, each refusal, its Slack alerts and what they may hold, a run cut short, and answers from Docker longer than a pipe holds | The image checks; the deployer's tests, ShellCheck on the deployer and the backups, and actionlint in `Repository`. The deploy workflows run after merge | [`web.md`](agents/web.md), Environments and deploys; [`api-servers.md`](agents/api-servers.md) and [`deployer-alerts.md`](agents/deployer-alerts.md); [`dictionary-api.md`](agents/dictionary-api.md) and [`account-api.md`](agents/account-api.md), Ship it | `verify-web` on staging; the dictionary service's earlier deployer was checked by hand on staging |
| iOS releases | C | 2026-10-25 | `apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj`, `apps/ios/Tools/prepare_sudachi_core.py`, `apps/ios/Tools/upload_dsyms.py`, `apps/ios/metadata/`, `apps/ios/CHANGELOG.md` | `apps/ios/Tools/tests/test_account_service_settings.py` (the App Store record's team and bundle identifier in both configurations, and production's account service in Release), `apps/ios/Tools/tests/test_app_platforms.py` (platforms, Release's iPhone-only device family, privacy strings, entitlements), `apps/ios/Tools/tests/test_crash_report_settings.py` (Sentry's destination only in the app's Release configuration, and the privacy manifest's diagnostics), `apps/ios/Tools/tests/test_upload_dsyms.py` (the debug-symbol upload, its token, and its warnings), and `apps/ios/Tools/tests/test_sudachi_pack.py` (the Sudachi pack the build bundles, by the shared cases the app and the service replay) | `iOS` runs them on pull requests that change `apps/ios`; nothing builds or archives a Release build | [`ios.md`](agents/ios.md), The App Store record; [`ios-crash-reports.md`](agents/ios-crash-reports.md), Debug symbols | Archiving and uploading in Xcode, uploading its debug symbols, the listing in App Store Connect, and a TestFlight build checked on a device |

- **Website and service deploys, B.** The image is checked and signed before it's published, the
  server runs only images main signed, a job never deploys over a later run's, and the deployer's
  tests run it against stand-ins on every pull request: each deploy path, each refusal, and what it
  posts to Slack. But Bot Fight Mode challenges CI runners, so nothing in CI sees the server deploy,
  and the smoke test skips its dictionary checks there. Main gaps: nothing checks a deployed service
  before production moves, and the deployer's Slack alerts are off until an owner turns them on
  ([`harness-debt.md`](harness-debt.md), Delivery); a change to a deploy workflow is first exercised
  on `main`; the server runs whichever `deploy/deployer.sh` someone last installed, which nothing
  compares with the repository's; the deployer both services share, and its alerts, haven't run on
  the server yet; and the account backups have no tests. Each image's install reads the
  private `@serpcompany/verify` through a secret `npmrc`, which `verify-package.test.ts` holds each
  build to.
- **iOS releases, C.** Contract tests pin a release's settings on every iOS pull request, and
  `ios.md` says how a build reaches TestFlight and the App Store. But nothing builds a Release
  archive before a person does in Xcode, and nothing checks the listing. Main gap: #381.

## Repository

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Repository checks | A | 2026-10-25 | `tools/checks/`, `verify.json`, `.npmrc`, `package.json`, `.claude/`, `apps/ios/Tools/simulator.py`, `apps/ios/Tools/simulator_keeper.py`, `apps/ios/Tools/simulator_devices.py`, `knip.json`, `lefthook.yml`, `.github/workflows/repository.yml`, `.github/workflows/code-review.yml`, `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml` | The shared checks' own tests are in `@serpcompany/verify`, in serp, at the version the lockfile pins. This repository's in `tools/checks/src/`: the agent hooks as `.claude/settings.json` runs them (`hooks.test.ts`: each hands its input to `serp-verify`, says where a checkout has no install, and passes in a GitHub Actions job that installed nothing), the pre-push hook's choice of packages and its extending the package's hooks (`git-hooks.test.ts`, run by lefthook in scratch repositories), the package's pin, `.npmrc`, and every install that reads it (`verify-package.test.ts`), the pull request rules, the report and what it reads from `serp-verify` and `verify.json` (`shared-checks.test.ts`, `files.test.ts`, `doc-references.test.ts`), the workflows' own rules (`workflow-rules.test.ts`: a time limit on every job, actions pinned by commit wherever a secret is read or the token can push, and one file for each toolchain's version; `workflows.test.ts`: each workflow's jobs played out, a heavy job never starting once a fast check failed, and the pull request rules and the review skipping only the bots they name), the script that hands a checkout its ports (`ports.test.ts`: its claims made in the test process with a stand-in for git and a clock that moves only while a run waits, two first askers meeting at the lock in a set order, and the script run as a command on real git), and the one that hands it its Simulators, which `iOS` runs (`apps/ios/Tools/tests/test_simulator.py`, where a Simulator that was up is restarted when a stand-in preferences daemon refuses its write, `apps/ios/Tools/tests/test_simulator_devices.py` for what it runs against `simctl`, and `apps/ios/Tools/tests/test_simulator_keeper.py` for its keeper, played out on a stand-in clock and memory: with swap over its limit, it leaves a Simulator up while a boot waits for a calm Mac and for 5 minutes after the handover, and still stops one nothing uses); the agent tooling's in `tools/checks/src/agents/`: the permission rules, `.mcp.json`, and the scripts of the review, `@claude`, and both gardening jobs, each run even when Claude's step fails, a workflow's own steps and the review's context script run in the test process on a clock that moves only when they wait. The package also holds the server's deployer's tests (`tools/checks/src/deployer/`), graded under Delivery | `Repository`, on every pull request: this repository's own checks, then `pnpm verify` (`serp-verify`: no comments, docs, sizes, no XCUITest waits in UI tests, secrets, duplicate code, dead code, imports, and the linters), and on a `fix/` branch, a changed test | [`code.md`](agents/code.md), [`checks.md`](agents/checks.md) | `pnpm verify`; the git hooks; Claude Code's edit hook |

- **Repository checks, A.** They run on every pull request and in the git hooks, an agent's edits
  are checked as it writes them, in a worktree too, and its whole change before a turn ends, and
  each failure says how to fix it. The docs' links, anchors, paths, scripts, named tests, and sizes
  are checked on every pull request; whether their prose still matches the code is checked only
  weekly, by doc gardening in `Weekly maintenance`. Main gaps: no check is required to merge yet, an
  owner's setting; Swift has no linter; and nothing refuses a cast of parsed JSON
  ([`harness-debt.md`](harness-debt.md), Checks).

Re-grade an area, and set its Graded date to that day, in the same pull request that changes its
tests, CI, or docs, even when its grade stays the same.
