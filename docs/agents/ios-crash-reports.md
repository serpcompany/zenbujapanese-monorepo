# Crash reports (iOS)

How the app reports its crashes, freezes, and handled failures to Sentry, and how to check that a
report arrives. What the learner sees is in
[`apps/ios/docs/product/crash-reports.md`](../../apps/ios/docs/product/crash-reports.md), and why
the app has a crash-reporting SDK at all in
[ADR 0018](../adr/0018-report-the-apps-crashes-and-freezes-to-sentry.md) (#859).

## Code layout

- **`SearchExperience/Diagnostics/`** (in `apps/ios/Modules/Sources/`) holds all of it:
  - `CrashReporter`: `startAtLaunch()`, which `ZenbuJapaneseApp.init()` calls first, so a crash
    during the rest of launch is caught; `setEnabled(_:)` for the switch; `record(_:in:details:)`
    for handled failures; and `configure(_:dsn:environment:installID:bundleID:)`, every option.
  - `CrashReportingSDK`: the SDK's start, close, and whether it runs, which the switch's tests
    replace with a stand-in.
  - `CrashReportingPolicy`: which build reports and as what, the switch's default, the install
    ID, Sentry's folder, and which breadcrumbs and contexts a report keeps.
  - `CrashReportScrubber`: what `beforeSend` and `beforeBreadcrumb` remove.
  - `HandledProblem` and `ProblemArea`: a handled failure's area, code, and details.
  - `CrashReportsSection`: the **Send Crash Reports** row.
  - `CrashReportTest`: the test switches, which only a `qa` build reads.
- **`SearchExperience/Platform/Diagnostics/CrashReportingPlatform.swift`** holds the options only
  iOS or the Mac has, since only `Platform/` may use `#if os`.
- **Only those folders import Sentry,** with the tests' `SearchExperienceTests/Diagnostics/`:
  `pnpm verify layers` refuses `import Sentry` anywhere else (`restrictedImports` in
  [`layers.ts`](../../tools/checks/src/layers.ts)). Code elsewhere reports through
  `CrashReporter`. `TranslatorCore` and `TranslatorOnDevice` never import it.
- **The package** is `sentry-cocoa`, pinned to an exact 9.x version in
  `apps/ios/Modules/Package.swift`. Its code links statically, and the app embeds a 33 KB
  `Sentry.framework` stub that carries Sentry's privacy manifest. To move it, change the version
  there and resolve all three `Package.resolved` files: `apps/ios/Modules`, the project's
  workspace, and `apps/ios/Tools/TranslateReplay`. The share extension links the same code
  through `SearchExperience`, so its binary carries it, but it never starts it.

## Which builds send

The destination (the DSN) is the build setting `ZENBU_CRASH_REPORTS_DSN`, which `Info.plist`
carries as `ZenbuCrashReportsDSN`. It is set only in the app target's Release configuration in
`project.pbxproj`; a DSN only lets a client send events to the project, so it isn't a secret.

| Build | Sends | Environment |
| --- | --- | --- |
| TestFlight and the App Store (a Release archive) | Yes | `production` |
| A Release build with `ZENBU_BUNDLE_ID_SUFFIX` set, such as Zenbu Dev | Yes | `qa` |
| Any Debug build, Zenbu Dev's included | No: no DSN | |
| The unit-test host (`XCTestConfigurationFilePath` set) and the UI-test host (`.uitests`) | No | |
| The share extension | No: no DSN, and it never starts Sentry | |

The release is `<bundle ID>@<version>+<build>` and the dist the build number, both from
`Info.plist`. `apps/ios/Tools/tests/test_crash_report_settings.py` checks that only the app's
Release configuration has a DSN, that `Info.plist` reads it under the key the Swift code reads,
and that the privacy manifest declares Crash Data and Other Diagnostic Data, unlinked.

## Options

`CrashReporter.configure` sets every option that collects anything, and
`CrashReporterOptionsTests` checks each:

- **On:** the crash handler; app hangs, at 2 seconds; watchdog terminations (iOS ending the app
  for memory or a hang, reported on the next launch, never on a Simulator); and stack traces on
  handled failures, of the current thread only (`attachAllThreads` off).
- **Off:** memory introspection, which would put strings near the stack in a crash's report;
  Spotlight, a second destination; default PII; sessions; automatic and network breadcrumbs;
  network tracking and failed requests; tracing and trace headers (`tracePropagationTargets` is
  empty); file I/O and Core Data tracing; MetricKit; Sentry's logs and metrics; client reports;
  swizzling; and, on iOS, screenshots, the view hierarchy, user-interaction tracing, and
  view-controller tracing, or on the Mac, uncaught `NSException` reporting.
- **`shutdownTimeInterval` is 0,** so turning the switch off never waits on the network, and
  `cacheDirectoryPath` is `Library/Caches/<bundle ID>/Sentry`, the app's own folder.
- Sentry still lists its session replay and metrics integrations as installed. Both are inert:
  replay's sample rates are set to 0 and swizzling is off, and the app records no metrics. Its
  frames tracker runs for app hangs, to tell a fully blocked hang from a partial one. Profiling
  is never configured, so nothing measures performance.
- **IP addresses:** with default PII off, the SDK sends `infer_ip: never`, asking Sentry not to
  take the connection's IP address. Whether Sentry stores it, or a location from it, is set in
  the project: Prevent Storing of IP Addresses, and a `[Remove] [Anything] from [$user.geo.**]`
  rule. Neither setting is checked yet; the owner confirms both before a build with the DSN
  reaches TestFlight, since the live policy says the address isn't stored.

## What a report holds

The install ID, a UUID made once and kept in defaults (`crash-reports.install-id`), is the only
user, set in `initialScope` and again in `beforeSend`. `CrashReportScrubber.scrub(_:)` then:

- clears the server name, the request, extras, and the error object, and keeps the user's ID only;
- keeps only the `app`, `device`, `os`, `runtime`, `trace`, and `problem` contexts, without the
  device's name, locale, and time zone, or the app's device hash;
- drops each frame's source lines and variables, in the exceptions', the threads', and the
  event's own stack traces, and shortens an image's or frame's path that names a folder
  (`/Users`, `/private`, `/var`, and the like) to `<path>/<file>`;
- keeps only breadcrumbs whose category starts `zenbu.` (the app leaves none yet); and
- in every message, exception value, mechanism, and kept context or breadcrumb value, replaces
  URLs, email addresses, paths, quoted text (“…”, 「…」, "…"), bare file names, and Japanese
  text with a placeholder. A bare file name is a word ending in a data or media extension
  (`fileExtensions`: `sqlite`, `db`, `json`, `plist`, `txt`, `csv`, `pdf`, images, audio, video,
  `zip`), so type names such as `Foundation.URL` and code files such as `DictionaryCore.swift`
  stay; a name with spaces loses only its last word. Each rule runs in linear time, and
  `CrashReportScrubberTests` checks them on real-looking strings and a fully populated event.

## Handled failures

A handled failure sends its area and a stable code, never its message: `CrashReporter.record(error,
in: area)` builds the code from the error's type and case in snake case
(`account_service_error.refused`), or an `NSError`'s domain and number; other errors give their
type's name, and a code that isn't short and stable becomes `unknown`. At most four details go
with it, and only short, stable keys and values (a status or a pack's ID). Cancellation, a lost
connection (`HandledProblem.expectedURLErrors`: no network, a timeout, a host that can't be found
or reached, and the like), and an unreachable service or an ended session send nothing; any other
URL error, such as a refused certificate or an `http://` address, is sent as
`nsurlerror_domain.<number>`. Each area and code is sent once a launch, grouped by
`["handled-problem", area, code]`. `HandledProblemTests` checks the codes, once a launch, and that
a message, a service's answer, or a payload never reaches the event.

| Area | Where | Codes |
| --- | --- | --- |
| `account_sync` | `AccountSyncScheduler` | The `AccountServiceError` case, with the HTTP status and the service's own code |
| `frequency_pack` | `FrequencyPackManager` | The download's or install's error, with the pack |
| `language_pack` | `LanguageTechnologyPack` | `bundled_pack_unverified`, `installed_pack_unverified`, or the install's or older pack's removal's error, with the pack |
| `dictionary_core` | `DictionaryCore` | `bundle_unavailable`, `core_did_not_load` |
| `translate_start` | `TranslateExperience` | `microphone_denied`, `speech_unavailable`, `translation_unavailable` |

To report a new failure, pass the error and an area (add one to `ProblemArea` if none fits), with
details only from values the app chose, never text a learner or a service wrote.

## The switch

`CrashReportsSection` is a stock `Toggle` (`account.send-crash-reports`) on Account, after Frequency
Dictionaries, and in the Mac's Settings window. It stores `crash-reports.send` in defaults, on until
turned off, and calls `CrashReporter.setEnabled`, which closes the SDK at once or starts it again.
With the switch off at launch, Sentry isn't started at all. What checks it:

- `CrashReporterSwitchTests`, against a stand-in `CrashReportingSDK`: turning the switch off
  closes a running SDK, turning it on starts it with the app's options, and a build with no
  destination ignores it.
- `CrashReportingPolicyTests`: on until turned off, and the real SDK never starts in a build with
  no destination.
- `AccountUITests.testCrashReportsAreOnUntilTheSwitchTurnsThemOff`: the row is on at first and
  off once flipped.
- By hand (Checking a report arrives, step 3): with the switch off before launch, a crash sends
  nothing. Turning it off while the app runs and then crashing hasn't been checked in the running
  app, since the test crash comes 3 seconds after launch.

## Test switches

A `qa` build reads these launch arguments; a `production` build ignores them
(`CrashReportingBuild.allowsTestSwitches`).

| Argument | Does |
| --- | --- |
| `-ZBTestCrash YES` | Crashes 3 seconds after launch (`SentrySDK.crash()`) |
| `-ZBTestFreeze YES` | Blocks the main thread for 5 seconds, 3 seconds after launch |
| `-ZBTestError YES` | Records an account-sync failure seeded with a secret, an email address, a URL, a path, and Japanese text, none of which may arrive |
| `-ZBTestOffline YES` | Gives Sentry a connection that fails every request, so reports stay queued on the device |

## Checking a report arrives

On this checkout's Simulator (`python3 apps/ios/Tools/simulator.py udid`), never the phone, from
the worktree's root:

```sh
BUILD=$(python3 apps/ios/Tools/simulator.py derived-data)
xcodebuild -project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese -configuration Release \
  -destination "platform=iOS Simulator,id=<simulator-udid>" -derivedDataPath "$BUILD" \
  ONLY_ACTIVE_ARCH=YES ZENBU_BUNDLE_ID_SUFFIX=.dev "ZENBU_DISPLAY_NAME=Zenbu Dev" \
  ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon-Dev build
python3 apps/ios/Tools/upload_dsyms.py "$BUILD/Build/Products/Release-iphonesimulator"
xcrun simctl install <simulator-udid> "$BUILD/Build/Products/Release-iphonesimulator/Zenbu Japanese.app"
xcrun simctl launch <simulator-udid> com.zenbujapanese.dictionary.dev -ZBTestCrash YES
```

1. **A crash:** after it, launch again without the switch; the report goes on that launch.
2. **A freeze** (`-ZBTestFreeze YES`) and **a handled failure** (`-ZBTestError YES`) go at once.
3. **The switch off:** `xcrun simctl spawn <simulator-udid> defaults write
   com.zenbujapanese.dictionary.dev crash-reports.send -bool NO`, crash, and launch twice, off and
   then on (`defaults delete` the key): nothing arrives.
4. **Offline:** crash, launch with `-ZBTestOffline YES` (the report waits in
   `Library/Caches/com.zenbujapanese.dictionary.dev/Sentry/io.sentry/<hash>/envelopes/` in the
   app's data container), then launch without it: it arrives.

Find each event in Sentry's `serpcompany/zenbujapanese-ios`, environment `qa`, through the Sentry
MCP or sentry.io. The app's frames name their function and file, with a line where the compiler
kept one; the event has the release, the OS, the device model, and the install ID as its only
user; and it has no location, server name, locale, time zone, or file name of the learner's. The
handled failure's message is `account_sync: account_service_error.refused` with only a status of
400. The Simulator's system frames stay `<unknown>`, since Sentry has no symbols for them. Last
checked on 2026-10-20 for #859.

## Debug symbols

Without the build's dSYMs, a report's stack trace is addresses. `apps/ios/Tools/upload_dsyms.py`
takes an `.xcarchive` (its `dSYMs` folder) or a build's products folder and runs a pinned
`@sentry/cli`: first `npx --yes -- @sentry/cli@<version> --version`, which installs it without the
token, and then `npx --no -- @sentry/cli@<version> debug-files upload --org serpcompany --project
zenbujapanese-ios`, which can't install anything and alone gets the token. Each has a timeout. In the TestFlight steps ([`ios.md`](ios.md#the-app-store-record)), after the
upload, it's run on the archive, which the Organizer's **Show in Finder** reveals:

```sh
python3 apps/ios/Tools/upload_dsyms.py ~/Library/Developer/Xcode/Archives/<date>/<name>.xcarchive
```

- **The token** comes from `SENTRY_AUTH_TOKEN`, or else the login keychain's
  `zenbu-sentry-auth-token`, an organization auth token from Sentry's settings. Keep it with
  `security add-generic-password -U -a "$USER" -s zenbu-sentry-auth-token -w "$(pbpaste)"`, since
  the keychain's own prompt cuts a long token short. The script never prints it.
- **A failure is a warning:** with no dSYMs, no token, or an install or upload that fails or
  stalls, it says so and exits 0, since the build is fine; run it again later.
  `test_upload_dsyms.py` checks each case, and that the install never gets the token.

## Tests

- **Package** (`apps/ios/Modules`, `-only-testing:SearchExperienceTests/<suite>`):
  `CrashReporterOptionsTests`, `CrashReporterSwitchTests`, `CrashReportingPolicyTests`,
  `CrashReportScrubberTests`, and `HandledProblemTests`. They don't run in CI ([`ci.md`](ci.md)), so a change cites a local run.
- **UI:** `AccountUITests.testCrashReportsAreOnUntilTheSwitchTurnsThemOff` and
  `testAccountListsEveryArea`.
- **Contract:** `test_crash_report_settings.py` and `test_upload_dsyms.py` in
  `apps/ios/Tools/tests/`, which the iOS workflow runs.
- **Layers:** `tools/checks/src/layers.test.ts` keeps `import Sentry` in the Diagnostics folders.
