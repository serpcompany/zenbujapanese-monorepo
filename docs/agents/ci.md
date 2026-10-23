# GitHub Actions working guide

The workflows are in `.github/workflows/`, and the actions they share are in `.github/actions/`.
Workflow files hold no comments ([`code.md`](code.md), No comments), so what starts each one, what
it runs, and why it's built that way are in three docs. Change a workflow's section in the same
pull request as the workflow.

- **This doc:** every workflow and what starts it, the checks a merge can wait for, and each
  workflow that checks a pull request.
- [`ci-agents.md`](ci-agents.md): the workflows Claude runs in, and the app and token they use.
  [`ci-review.md`](ci-review.md) has the `Code review` workflow's design.
- [`ci-deploys.md`](ci-deploys.md): the workflows that deploy or publish, and the pinned actions.

Every job runs on `ubuntu-latest` and reads the repository's contents only, unless its section
says otherwise. The pnpm jobs set up pnpm from the root `package.json` and the Node that
`.node-version` names, and install with `pnpm install --frozen-lockfile`, reading packages with
their own token ([`checks.md`](checks.md), In CI). A job that runs Python on Linux sets up the one
`.python-version` names. Every job has a time limit, and a change to a version file starts the
workflows that read it (`tools/checks/src/workflow-rules.test.ts`).

| Workflow | File | Starts on | Section in |
| --- | --- | --- | --- |
| `Repository` | `.github/workflows/repository.yml` | Every pull request; the merge queue | This doc |
| `Pull request` | `.github/workflows/pull-request.yml` | Every pull request, again when its title or body is edited; the merge queue | This doc |
| `Code review` | `.github/workflows/code-review.yml` | Every pull request that isn't a draft | [`ci-agents.md`](ci-agents.md), [`ci-review.md`](ci-review.md) |
| `Claude` | `.github/workflows/claude.yml` | `@claude` in an issue, a pull request comment, a review, or a review comment | [`ci-agents.md`](ci-agents.md) |
| `Weekly maintenance` | `.github/workflows/maintenance.yml` | Mondays at 14:00 UTC; by hand, every job or one | [`ci-agents.md`](ci-agents.md) |
| `Web` | `.github/workflows/web.yml` | Every pull request and the merge queue, working when the site or the core changed | This doc |
| `Web deploy` | `.github/workflows/web-deploy.yml` | Pushes to `main` that change the site, the core, or the dictionary service's image; by hand | [`ci-deploys.md`](ci-deploys.md) |
| `Dictionary core` | `.github/workflows/dictionary-core.yml` | Every pull request and the merge queue, working when the core changed | This doc |
| `Dictionary API` | `.github/workflows/dictionary-api.yml` | Every pull request and the merge queue, working when the service or what it reads changed; pushes to `main` that change its cached files; by hand | This doc |
| `Dictionary API deploy` | `.github/workflows/dictionary-api-deploy.yml` | Pushes to `main` and pull requests that change what the image holds; by hand | [`ci-deploys.md`](ci-deploys.md) |
| `Account API` | `.github/workflows/account-api.yml` | Every pull request and the merge queue, working when the account service or what the services share changed; by hand | This doc |
| `Account API deploy` | `.github/workflows/account-api-deploy.yml` | Pushes to `main` and pull requests that change what the image holds; by hand | [`ci-deploys.md`](ci-deploys.md) |
| `iOS` | `.github/workflows/ios.yml` | Every pull request and the merge queue, working when `apps/ios` changed; by hand | This doc |
| `Language data build` | `.github/workflows/language-data-build.yml` | Every pull request and the merge queue, working when a release's inputs changed; pushes to `main` that change them | This doc |
| `Language data release` | `.github/workflows/language-data-release.yml` | Pushes to `main` that change a release's inputs; by hand | [`ci-deploys.md`](ci-deploys.md) |

"The core" is `packages/dictionary-core`, and a change to the root `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, or `.node-version` counts as changing it. A change to a workflow's own file
starts it too.

GitHub also runs four workflows that have no file here, turned on in the repository's settings:
`CodeQL`, code scanning's default setup, on `main` and on every pull request; `Dependency Graph`;
and Copilot's two, `Copilot` (its pull request reviewer) and `Copilot cloud agent`, which last ran
in September 2026. `gh api repos/serpcompany/zenbujapanese-monorepo/actions/workflows` lists them
([as the app](ci-agents.md#outside-ci)). None is a check a merge waits for.

## Checks a merge can wait for

`main`'s ruleset requires no status check yet ([`harness-debt.md`](../harness-debt.md), Checks), so
a red check stops no merge. The workflows are built so the owners can require them as they are:

- **Each starts on every pull request and on `merge_group`.** A required check has to report
  every time: a workflow that its `paths` filter skipped would leave its check pending and block
  the merge, and one that never ran in the merge queue would block the queue.
- **Each decides inside whether the change concerns it.** `Web`, `Dictionary core`,
  `Dictionary API`, `Account API`, `iOS`, and `Language data build` begin with a `changes` job.
  It asks the `changed-paths` action (`.github/actions/changed-paths/`) whether the pull request,
  or the merge group, changed any of the workflow's paths, comparing the checked-out commit with
  its base, which it fetches. The other jobs need it and run only on `true`. On a push or a run
  by hand there is no base, and it answers `true`.
- **Each ends in one job named for the workflow** (`web`, `dictionary-core`, `dictionary-api`,
  `account-api`, `ios`, `language-data-build`). It always runs, and fails when a job it needs
  failed or was cancelled. It is the job to require: a job skipped because the one it needs
  failed would itself count as passing.
- **A heavy job waits for its workflow's fast checks.** `e2e` needs `check` (`Web`), `website`
  needs `check` (`Account API`), `check` needs `scripts` (`Dictionary API`), `swift` needs
  `contracts` (`iOS`), and `build` needs `pins` (`Language data build`), on a pull request and in
  the queue alike. A failed fast check then spends no runner time on the browser tests, the suites
  or the release on the real files, or a Mac: the heavy job is skipped, and the last job fails for
  the fast one. A passing change starts the heavy job later
  by the fast job's time: about 1.5 minutes in the first two, under 40 seconds in the others.
- **A queue run is never cancelled.** A new push cancels a pull request's last run only.

The jobs to require are `verify` (`Repository`), `title`, `issue-link`, and `fix-test`
(`Pull request`), and the six above. `ios` passes without testing the app until the owners turn
`IOS_SWIFT_TESTS` on (iOS, below). An owner adds them under the ruleset's required status
checks; nothing in the repository can. The merge queue waits 90 minutes for a required check
(`check_response_timeout_minutes`), and the `swift` job may run for four hours: raise that wait
before turning `IOS_SWIFT_TESTS` on with `ios` required, or the queue drops every app change.
`tools/checks/src/workflows.test.ts` holds every workflow to this shape, plays each one's jobs
out (nothing to check, every job passing, each job failing), and runs the action against
scratch repositories.

## Repository

`.github/workflows/repository.yml` runs on every pull request; a new push cancels the pull request's
last run. It installs the whole workspace, since the dead-code and import checks read every package,
then runs this repository's own checks (`pnpm check` in `tools/checks`), then `pnpm verify`: every
shared check, at the `@serpcompany/verify` the lockfile pins ([`checks.md`](checks.md) has the
grant its install needs, and why it isn't SERP's reusable workflow). It starts on `merge_group`
too, so once `main`'s ruleset requires its `verify` job, the merge queue runs it on the tree that
will land; a queue run is never cancelled.

The checks' tests include the server's deployer's (`tools/checks/src/deployer/`), which run
`deploy/deployer.sh` itself against stand-ins for Docker, cosign, Slack, and the journal
([`deployer-alerts.md`](deployer-alerts.md), Tests). So a change to the deployer is tested on
every pull request, on the runner's own bash and GNU tools, and they fail there, rather than skip,
without a bash new enough.

## Pull request

`.github/workflows/pull-request.yml` holds the three rules about a pull request itself
([`code.md`](code.md), Pull requests), each as its own job so each can be a required check:

- **`title`**: the title is a Conventional Commit.
- **`issue-link`**: GitHub has linked the pull request to an issue it closes, or its body says
  `No issue: <reason>`. GitHub links a closing keyword a moment after the event, so the job looks
  three times, five seconds apart. The job name is the one SERP's standard requires.
- **`fix-test`**: a pull request from a `fix/` branch, or titled `fix:`, adds or changes a test.
  It reads the changed files from GitHub, leaving out deleted ones.

It runs again when the title or body is edited, which `Repository` doesn't, so a retitled pull
request is checked at once. Each job runs `tools/checks/pull-request.mjs`, which uses nothing but
Node, so the job checks out that one file and installs nothing (why it isn't the package's action:
[`checks.md`](checks.md)). The title and body reach it through the environment, never the command
line. Pull requests from `claude[bot]`, `dependabot[bot]`, and `renovate[bot]` skip all three;
`serp-agent[bot]`'s don't. On `merge_group` the jobs pass without doing anything: a required check
that never reports in the merge queue would block every merge, and the pull request was checked.

## Web

`.github/workflows/web.yml` checks pull requests that change `apps/web/**`, the core, or
`tools/checks/ports.mjs`, which hands the browser tests their port. In `apps/web`, it runs
ShellCheck 0.11 on the scripts in `apps/web/scripts/`, at warning level, in Docker, since the
runner's own ShellCheck is older; checks that `cloudflare-env.d.ts` is what `pnpm cf-typegen` writes
from `wrangler.jsonc`, and that it writes no other file, so a binding changed without regenerating
the types fails here; then `pnpm check` ([`web.md`](web.md), Run and verify); then it builds twice
more, with `SITE_ENV=staging` and with `SITE_ENV=production`. `pnpm check` builds without
`SITE_ENV`, but static pages and prerendering differ by environment, so a route that reads a binding
at build time fails only in that environment's build. Neither build reaches the dictionary service:
deployed pages read it only at request time. After each, it checks the prerendered `/about/` has the
footer's Sign in linking `/login/`, since staging's and production's account pages are open
([`web.md`](web.md), Account pages); the header's Log in is in the account menu, which the browser
draws, so `src/lib/site.test.ts` checks its address with the account pages open and closed. Each
step names `apps/web` as its working directory, rather than the jobs setting it as a default,
because the dead-code check reads a step's working directory to find the scripts and binaries a
step runs, and not a job's.

Its `e2e` job starts once those checks pass (about 15 minutes of browser tests, behind about 1.5
of checks). It runs the browser tests ([`web.md`](web.md), Run and verify) on the site as it
deploys: it installs Chromium, builds with OpenNext without `SITE_ENV`, so the build reads the
dictionary fixtures, and serves it in workerd with `opennextjs-cloudflare preview`. A test that
fails isn't tried again (`retries` is 0 in `apps/web/playwright.config.ts`): one that fails once
and passes the next time is a failing test ([`verification.md`](verification.md), Three levels),
and a retry would hide it. On a failure it uploads the report, traces, videos, and screenshots as
the `playwright-report` artifact, kept for a week.

## Dictionary core

`.github/workflows/dictionary-core.yml` runs `pnpm check` in `packages/dictionary-core` (Biome with
its rule that keeps runtimes and frameworks out, typecheck, and Vitest) on pull requests that change
the core, or `docs/data-sources.md`, which its source credits are held to. Those tests need no data:
the app-recorded suites run through the core in
`Dictionary API`, and `Web` builds the site with it. See [`dictionary-core.md`](dictionary-core.md).

## Dictionary API

`.github/workflows/dictionary-api.yml` checks the dictionary service on pull requests that change
the service, the core, what the services share (`packages/node-service/`), its API reference
(`docs/api/dictionary-api.md`, which its tests write), the website's dictionary code
(`apps/web/src/lib/dictionary/`, `apps/web/src/components/dictionary/`, `apps/web/src/test/`,
`apps/web/vitest.config.ts`, and what gives the gate its address, `apps/web/e2e/server.ts` and
`tools/checks/ports.mjs`), the conformance suites (`language-data/conformance/`), the app's
resources (`apps/ios/Modules/Sources/SearchExperience/Resources/`), or `language-data/release.json`
(the release the service names), its pins (`language-data/releases/`), and its retired entries
(`language-data/derived/`), and by hand. A new push cancels the pull request's last run. Its
`scripts` job runs ShellCheck 0.11 on the server's deployer (`deploy/deployer.sh`), in Docker, since
the runner's own ShellCheck is older; `Repository` runs ShellCheck on it too, and its tests, on
every pull request. Once `scripts` passes, its `check` job:

1. restores and pulls the app's Git LFS files the service reads (the `.sqlite3` files and
   Kuromoji's), then Sudachi's dictionary (`pnpm sudachi`, which keeps a cached copy that matches
   the app's pin, or downloads and checks it);
2. runs `pnpm check` in `apps/dictionary-api`: Biome, typecheck, the app-recorded suites on the
   real files, and the bundle;
3. exports the core's fixtures from the real files and fails if they differ from the committed ones
   (`packages/dictionary-core/src/fixtures/`) or add a file, so a data rebuild that changes a
   fixture word's rows re-exports them in the same pull request;
4. starts the built service and runs the website's rendered-page gate against it
   ([`web.md`](web.md), The rendered-page gate), and prints the service's log if a step failed.

`ZENBU_REQUIRE_ARTIFACT=1` makes the suites fail, rather than skip, without the app's files or
Sudachi's dictionary. `DICTIONARY_API_TOKEN` is a CI-only value that only this job's service and
gate use.

The Git LFS files (about 520 MB) are cached under a hash of their pointers, so a run downloads them
only when they change, and Sudachi's dictionary under a hash of the app's pin
(`apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json`). A pull
request's cache is visible only to that pull request, so the workflow also runs on a push to
`main` that changes those files, the pin, or the workflow: that run builds the caches every later
pull request restores. `Dictionary API deploy` uses the same Git LFS cache key, so the two share
it. See [`dictionary-api.md`](dictionary-api.md), Check it.

## Account API

`.github/workflows/account-api.yml` checks the account service on pull requests that change it, what
the services share (`packages/node-service/`), its API reference (`docs/api/account-api.md`, which
its tests write), or what the website's account pages are built from (`apps/web/src/`, the browser
test against the service with `apps/web/e2e/test.ts`, `apps/web/playwright.config.ts`, and what
gives it its port, `apps/web/e2e/server.ts` and `tools/checks/ports.mjs`, and the site's
`next.config.ts`, `package.json`, and `wrangler.jsonc`), and by hand. A new push cancels the pull
request's last run. The deployer and the backups script (`deploy/deployer.sh`,
`apps/account-api/deploy/backups.sh`) are ShellChecked by `Repository`'s `pnpm verify`.

- **`check`** runs `pnpm check` for `packages/node-service`, then for `apps/account-api`, with a
  Postgres 18 service container. `ACCOUNT_API_TEST_DATABASE_URL` points the service's database
  tests at it, so the migrations and the `pg` driver run against the Postgres the server runs,
  including two migrations started at once. The container trusts any connection and lives only as
  long as the job, so it has no password. See [`account-api.md`](account-api.md), Check it.
- **`website`**, once `check` passes, starts the service from its source on a Postgres 18
  container, with the dev mailbox and the website's local origin, then runs the website's
  browser test against it (`apps/web/e2e/account-service.spec.ts`, on `next dev`, at the
  desktop width): a learner registers with an emailed code, edits the profile, signs out, signs
  in again, and deletes the account after a fresh sign-in ([`web.md`](web.md), Account pages).
  The `Web` workflow can't run it, with no service, so it runs here, as `Dictionary API` runs
  the website's rendered-page gate against the service it builds. A failed run is not tried
  again, as in the `Web` workflow, and here it couldn't be: the service sends five codes from one
  address in 10 minutes, and a run sends three. `ACCOUNT_API_SECRET` is a CI-only value. On a
  failure it prints the service's log and keeps the test's trace, video, and screenshot as
  `account-pages-report` for a week.

## iOS

`.github/workflows/ios.yml` checks the iOS app on pull requests that change `apps/ios`, the
language data it's built from and tested against (`sources/`, `generated/`, `conformance/`, and
`tools/` in `language-data/`), or the username cases its tests share with the account service
(`apps/account-api/src/domain/username-cases.json`), in two jobs:

- `contracts` runs the data tools' contract tests (`language-data/tools/tests/`) on Linux, with
  every Git LFS file under `apps/ios` and `language-data/sources/` but the archived source snapshots
  (`LFS_SNAPSHOTS`), which only a rebuild reads, and the recorded-audio check's recordings
  (`LFS_RECORDINGS`): they check the bundled packs and indexes against their pinned sources, import
  reports, and the bundled dictionary, and that each import report records the current hash of the
  tool that wrote it ([`ios.md`](ios.md)). Then the app's own Python tests (`apps/ios/Tools/tests/`)
  check that Release builds sign in to production's account service, that every build signs as the
  App Store record ([`ios.md`](ios.md), Sign-in in the App Store build), and the app's iPhone, iPad,
  and Mac settings (`test_app_platforms.py`: platforms, orientations, the Mac's sandbox and icon,
  privacy strings, and entitlements), that every Swift package the app links has a license text with
  its copyright line on Licenses (`test_package_licenses.py`), and test the Simulator script
  and its keeper (`test_simulator.py`, `test_simulator_keeper.py`, `test_simulator_devices.py`). Its LFS cache is keyed on the pointers of the LFS patterns it fetches.
- `swift`, once `contracts` passes, runs the app's tests on all three platforms, one after another:
  `SearchExperienceTests` and `TranslatorCoreTests` with `xcodebuild` on an iPhone Pro Max Simulator
  and an iPad Pro 13-inch Simulator it makes with `apps/ios/Tools/simulator.py`, the script agents
  use ([`verification.md`](verification.md)), and on the Mac; then, after filling the Sudachi build
  cache (cached by the catalog's hash), the app's UI tests (`ZenbuJapaneseUITests`) and StoreKit
  tests (`ZenbuJapaneseStoreKitTests`, run inside the app;
  [`ios-subscription.md`](ios-subscription.md)), which build the app as
  `com.zenbujapanese.dictionary.uitests` and drive it on the same iPhone and iPad Simulators and on
  the Mac, each signed to run locally (no team needed), after turning on Automation Mode for the
  Mac, which its UI tests need (`automationmodetool`). So a change that breaks the app on one of
  them fails ([`ios.md`](ios.md), Tests on every platform). Last come the recorded-audio check's
  scoring tests with `swift test` (the replay itself needs the Mac's speech models, which the runner
  doesn't have, so it stays a local check, [`translate.md`](translate.md)), on `macos-26` with the
  Xcode `.xcode-version` pins, which it selects first (arm64, which the `sudachi-swift` binary
  needs), with up to 4 hours for all of it. It runs only when the repository variable
  `IOS_SWIFT_TESTS` is `on`, or when the workflow is run by hand. Turning it on is the owners'
  decision. It was first kept off for the runner's cost: on a private repository a macOS minute
  counts ten times a Linux one. This repository is public, where GitHub's standard runners,
  `macos-26` among them, are free, so what turning it on costs is the time a run takes. Asked on
  2026-10-11, Francis chose to keep it off for now. Until it is on, nothing tests the app on iPad or
  the Mac before merge. `tools/checks/src/ios-workflow.test.ts` pins both jobs: `contracts` on every
  pull request, `swift` only when it's turned on, and that it runs every suite on every platform.

## Language data build

`.github/workflows/language-data-build.yml` packages the next language-data release from the
committed files (issue 828, step 2). It runs on pull requests and pushes to `main` that change
`language-data/**` (the sources and suites among it), the app's resources, the dictionary service's
Dockerfile, the shared action, or the workflow (and, on pull requests, the release workflow). Tests
in `language-data/pipeline/tests/` fail when a release input or the Dockerfile doesn't start it.

Its `pins` job runs `package.py check-pin` first, without Git LFS: the committed files, the
conformance suites, the app's bundle, and the image's copies against the pinned release, and no
change to a pin the base holds ([`language-data/README.md`](../../language-data/README.md), Pinned
releases and Running it). Then `build` packages through the shared action
([`ci-deploys.md`](ci-deploys.md), The package-language-data action) and keeps only `manifest.json`
and `files.tsv` (each staged file's size and path) as the Actions artifact
`language-data-manifest-<commit>`, for 7 days. It has no credentials and publishes nothing. The
files themselves (516 MiB) aren't kept: `Language data release` rebuilds them rather than trusting
this output. The job names `shell: bash` so pipefail is on.

