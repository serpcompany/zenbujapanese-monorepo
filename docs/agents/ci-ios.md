# The iOS workflow

What the `iOS` workflow runs, what a run keeps, and why the app has no committed test plans. Every
workflow and what starts it is in [`ci.md`](ci.md); how to run the same tests on a Mac is in
[`ios.md`](ios.md), Tests on every platform.

## Its jobs

`.github/workflows/ios.yml` checks the iOS app on pull requests that change `apps/ios`, the
language data it's built from and tested against (`sources/`, `generated/`, `conformance/`, and
`tools/` in `language-data/`, and the core's files its romaji forms come from), or the account
rules' cases its tests share (`packages/account-rules/cases/`), in two jobs:

- `contracts` runs the data tools' contract tests (`language-data/tools/tests/`) on Linux with Node,
  every Git LFS file under `apps/ios` and `language-data/sources/` but the archived source snapshots
  (`LFS_SNAPSHOTS`), which only a rebuild reads, and the recorded-audio check's recordings
  (`LFS_RECORDINGS`): they check the bundled packs and indexes against their pinned sources, import
  reports, and the bundled dictionary, and that each import report records the current hash of the
  tool that wrote it ([`ios.md`](ios.md)). Then the app's own Python tests (`apps/ios/Tools/tests/`)
  check that Release builds sign in to production's account service, that every build signs as the
  App Store record ([`ios.md`](ios.md), Sign-in in the App Store build), and the app's iPhone, iPad,
  and Mac settings (`test_app_platforms.py`: platforms, orientations, the Mac's sandbox and icon,
  privacy strings, and entitlements), that every Swift package the app links has a license text with
  its copyright line on Licenses (`test_package_licenses.py`), and test the Simulator script and its
  keeper (`test_simulator.py`, `test_simulator_keeper.py`, `test_simulator_devices.py`). Its LFS
  cache is keyed on the pointers of the LFS patterns it fetches.
- `swift`, once `contracts` passes, fills the Sudachi build cache (cached by the catalog's hash) and
  runs the app's tests on all three platforms, one after another: `SearchExperienceTests` and
  `TranslatorCoreTests` with `xcodebuild` on an iPhone Pro Max Simulator and an iPad Pro 13-inch
  Simulator it makes with `apps/ios/Tools/simulator.py`, the script agents use
  ([`verification.md`](verification.md)), and on the Mac; then the app's UI tests
  (`ZenbuJapaneseUITests`) and StoreKit tests (`ZenbuJapaneseStoreKitTests`, run inside the app;
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
  pull request, `swift` only when it's turned on, that it runs every suite on every platform, and
  that it keeps what each run wrote (below).

## What a run keeps

Each `xcodebuild` run in `swift` writes its result bundle (`-resultBundlePath`) into
`$RUNNER_TEMP/ios-results`, and each test run, `swift test` too, its output there as a `.log`, one
pair for each suite and device: `package-iphone`, `package-ipad`, `package-mac`, `ui-iphone`,
`ui-ipad`, `ui-mac`, and `translate-replay-scoring.log`. A result bundle holds each test's result,
the device, the build and test logs, and a failed UI test's screenshots and **What was on screen**
([`ios.md`](ios.md), Tests on every platform). The job's steps run in bash with pipefail, so a run
piped into `tee` still fails the step. Its last step runs whether the tests passed or failed, and
keeps the folder as the `ios-results` artifact for 7 days, as long as `Web` keeps its browser
tests' report and `Account API` its account pages' (those only on a failure): a week covers a pull
request's review and the run after a fix, and every run keeps its own. Read a bundle on a Mac with
`xcrun xcresulttool get test-results summary --path <bundle>`, and its screenshots with
`xcrun xcresulttool export attachments --path <bundle> --output-path <folder>`. Code coverage,
which #381 lists too, isn't collected: it builds every suite instrumented, on a run that already
takes hours, so it waits for the owners' decision on which runs gate a pull request.

## Test plans

The scheme makes its test plan from its own test targets (`shouldAutocreateTestPlan`), and nothing
in `apps/ios` commits an `.xctestplan`. #381 asked for four, `ZenbuPR`, `ZenbuAccessibility`,
`ZenbuNightly`, and `ZenbuPerformance`, with `ZenbuPR` as the scheme's default. They aren't
committed, because none would hold anything today:

- **The plans #381 names were for a suite that's gone.** #334 removed them with the inherited
  tests, and the copies under the `archive/ios-test-ci-pre-reset-2026-09-11` tag select a unit
  test target and two UI test classes that no longer exist, by target identifiers the project no
  longer has. #409 decided that suite
  isn't the shape of its replacement.
- **Every run is the whole suite.** `swift` runs every package test and every UI test on every
  device, and an agent picks a few with `-only-testing` (the `verify-app` skill), so a `ZenbuPR`
  plan would be the scheme's own testables again. Which tests gate a pull request apart from the
  rest is the owners' decision, with `IOS_SWIFT_TESTS`.
- **There is no run for the others.** The accessibility audits are UI tests in
  `apps/ios/UITests/Accessibility/`, run with the rest; no iOS run is scheduled; and the UI
  tests never assert how long something took ([`ios-ui-tests.md`](ios-ui-tests.md)), so a
  performance plan would have nothing to measure.
- **The package's tests can't take one.** They run through SwiftPM's generated
  `ZenbuJapaneseModules-Package` scheme, which no file in the repository holds, so a plan for them
  needs a committed scheme first.

A plan earns its file once a run needs a subset or settings the scheme doesn't give: a nightly
run, a pull request gate smaller than the whole suite, or coverage.
