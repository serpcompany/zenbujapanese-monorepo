# Harness debt

Known debt in the checks, in delivery, and in the harness agents work in. The code's debt is in
[`tech-debt.md`](tech-debt.md), which says what a row holds, what each Size means, and when to add
or remove one. The weekly maintenance report counts both files' rows together.

## Checks

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| No check is required to merge: `main`'s ruleset requires a pull request, resolved review threads, and the merge queue, but no status checks. Every workflow that checks a pull request now starts on each one and on `merge_group`, and ends in one job to require ([`ci.md`](agents/ci.md), Checks a merge can wait for). | A red `Repository`, `Web`, or `Dictionary API` check doesn't stop a merge, and the merge queue lands changes without waiting for anything; the git hooks can be skipped. What is left is an owner's setting: add the ten jobs `ci.md` names to the ruleset's required status checks. | #698 | medium |
| `anthropics/claude-code-action` is pinned to v1.0.247 ([`ci-deploys.md`](agents/ci-deploys.md), Pinned actions). It was pinned because v1.0.248 seemed to fail every run, but a revoked `CLAUDE_CODE_OAUTH_TOKEN` failed them. | The review, `@claude`, and gardening jobs get no Claude Code fixes until someone moves the pin to the latest release, after a review passes with a renewed token. | No issue yet | small |
| `SearchExperienceTests` runs only when someone runs it on a Mac: the `iOS` workflow's macOS job waits for the owners to set `IOS_SWIFT_TESTS` to `on` ([`ci.md`](agents/ci.md), iOS). | The Swift can drift from the recorded suites the website is held to, and a change that breaks the app's build can merge. | #381, #516 | medium |
| The app is tested on iPhone, iPad, and the Mac in CI only when `IOS_SWIFT_TESTS` is on: the `iOS` workflow's opt-in `swift` job runs the package's tests and the app's UI tests on an iPhone Simulator, an iPad Simulator, and the Mac, and the owners have kept it off for the runner's cost, which a public repository no longer pays ([`ci.md`](agents/ci.md), iOS). `pnpm verify layers` catches only the iPhone-only APIs it lists. | A change on `main` can break the app on one platform, or use an iPhone-only API the check doesn't know, unnoticed until someone runs the tests on a Mac (ADR 0015). | #661, #381 | medium |
| The UI tests (`apps/ios/UITests/`) drive every tab with stand-ins at the edge, but what they can't reach is still a checklist in `docs/agents/ios.md` a person walks through: YouTube's real player and results page, Apple Translation, live speech, a real Apple or Google sign-in, the system's photo and file pickers, Edit's reordering of lists, and Split View, dragging from another app, and Continuity Camera. | A change there is caught only when someone checks it by hand. | #516 | medium |
| No app-recorded suite covers sentence search (Discovered Words). The service checks its own cases in `apps/dictionary-api/src/conformance/sentence-search.test.ts`. | The website's sentence search isn't held to what the app shows. Recording it needs the Japanese Text Analysis pack in the test host. | #470 | medium |
| The iOS data tools' importers have no tests; only the contract tests on what they write run before merge (`apps/ios/Tools/tests/`, in the `iOS` workflow). | An importer change is checked only through a rebuild of what it writes. | No issue yet | medium |
| Swift has no linter. `pnpm verify` runs ShellCheck, actionlint, and Ruff. | Swift mistakes that a linter would catch are left to review. | #516 | medium |
| The website casts the dictionary service's JSON to its types without checking its shape (`apps/web/src/lib/dictionary/api.ts`), and nothing refuses a cast of parsed JSON (`JSON.parse`, `response.json()`). The site compares only the contract number. | A service answering another shape under the same contract number renders wrong pages instead of failing where the data enters. Needs a decision on how to validate without a schema library in the core. | No issue yet | medium |
| Apple's accessibility audit found 144 Dynamic Type, 14 hit-region, and 4 clipped-text problems in the app. | Large text and small targets fail on Search, its results, Word Detail, Kanji Detail, and Examples. | #380 | large |

## Delivery

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| The server's deployer (`deploy/deployer.sh`) and the account service's backups (`apps/account-api/deploy/backups.sh`) have no tests: ShellCheck is all that runs before merge. | A change to either is first exercised on the server, where it deploys production or backs it up. A test would run them against stand-ins for `docker`, `cosign`, and `aws`, which their fixed `PATH` keeps out. | No issue yet | medium |
| Tomodachi's App ID (`com.zenbujapanese.tomodachi`) is still on the backup Apple Developer team (`W3GXL2NQQP`), while the iOS app is on TSMC LLC's (`847HR8U8D9`) and the website's Services ID and the service's key move there with it ([`account-api.md`](agents/account-api.md), Moving from the backup team). | Apple gives a learner a different user ID in each team, and the service makes Apple's client secret with TSMC LLC's key once #616's cutover is done. Then an account Tomodachi makes with Apple can't be deleted from Tomodachi (Apple refuses the secret for its bundle ID: `503 apple_unavailable`), and its Apple user ID matches no Zenbu sign-in, so deleting it from the app or website answers `apple_account_mismatch`. | #616 | medium |
| Nothing refuses an account migration that drops or renames what the running code reads. The rule is to add first and remove in a later release ([`account-api.md`](agents/account-api.md), The database). | A deploy migrates while the old image still serves, so such a migration breaks it until the new one takes over. | No issue yet | small |

## Harness

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| The website's log lines (`log()` in `apps/web/src/lib/log.ts`) stay in Workers Logs and the service's on its server, neither of which agents can query, and the smoke test has no latency budget. | An agent can't read why staging or production failed, or see a slowdown. | #516 | medium |
| `zenbujapanese/research`, which `AGENTS.md` routes to and ADR 0005 links into, isn't readable by every maintainer: `gh` can't resolve it for at least one. | Agents working for them can't follow those links. | #516 | medium |
| The Clipy skill, `/wayfinder`, and XcodeBuildMCP, which `docs/agents/clipy.md`, `docs/agents/issue-tracker.md`, and `docs/agents/ios.md` rely on, are installed per user. `.mcp.json` holds only the Chrome DevTools server. | Cloud agents and teammates' agents don't get them. | #516 | medium |
| `docs/agents/web.md` is still one guide for running, the dictionary, deploys, and sitemaps. | A small page change sends an agent through all of it. | #516 | small |
| A GitHub token exposed in issue comments isn't recorded as revoked. | A published credential stays usable until it's revoked. | #379 | small |
