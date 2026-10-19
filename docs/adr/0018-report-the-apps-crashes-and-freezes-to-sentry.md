---
status: accepted
---

# Report the app's crashes and freezes to Sentry

The iOS app reports its crashes, its freezes, and the failures it handles at a few boundaries to
Sentry's `zenbujapanese-ios` project (#859), through `sentry-cocoa` pinned to an exact 9.x version.
Reports are on by default, with a **Send Crash Reports** switch in Settings that takes effect at
once. This replaces #21's posture of no third-party crash-reporting SDK; the rest of #21's privacy
rules stand, and the app still keeps no analytics, sessions, or tracing.

- **One folder imports Sentry.** `SearchExperience/Diagnostics/` holds the reporter, its options,
  the scrubber, and the handled failures, and `pnpm verify layers` refuses `import Sentry`
  anywhere else (`restrictedImports` in `tools/checks/src/layers.ts`). The options only iOS or the
  Mac has need `#if os`, which only `Platform/` may use, so they live in
  `SearchExperience/Platform/Diagnostics/`, the one other folder the rule allows, with the tests'
  `SearchExperienceTests/Diagnostics/`. `TranslatorCore` and `TranslatorOnDevice` stay free of it.
- **One `configure(options)` sets every option that matters,** each with a unit test: the crash
  handler, app hangs at 2 seconds, and watchdog terminations on; and off, everything else that
  collects: default PII, sessions, automatic and network breadcrumbs, failed requests, tracing and
  trace headers, file I/O and Core Data tracing, MetricKit, Sentry's logs and metrics, client
  reports, swizzling, screenshots, the view hierarchy, user-interaction tracing, and on the Mac
  uncaught `NSException` reporting. Session replay stays at the SDK's default sample rates of 0.
- **Every report goes through a scrubber** in `beforeSend` and `beforeBreadcrumb`, ported from
  Keybumps (its ADR 0007): fields cleared, contexts on an allowlist, only the app's own
  breadcrumbs, and URLs, emails, paths, quoted names, and Japanese text removed, by rules that each
  run in linear time. A random install ID, made once and kept in defaults, is the only user.
- **Handled failures send a code, never a message:** an area and a stable code from the error's
  type and case, with at most four bounded details, from account sync, frequency- and
  language-pack installs, the dictionary core's bundle, and Translate's start checks.
- **Only Release builds carry the destination.** The DSN is the Release-only build setting
  `ZENBU_CRASH_REPORTS_DSN`, read from `Info.plist`; Debug builds, the share extension, and the
  unit- and UI-test hosts have none. A Release build with `ZENBU_BUNDLE_ID_SUFFIX` set reports as
  `qa`, any other as `production`.

## Why

- **We can't fix what we don't hear about.** App Store Connect's crash logs come only from people
  who share analytics with developers, arrive late, and say nothing of freezes or failed syncs.
  Sentry symbolicates, groups, and alerts, and SERP's other apps already report to it.
- **The standard decides the options.** SERP's native app error reporting standard and its
  telemetry defaults set what a report may hold and that every other collection stays off; iOS's
  extra options follow the telemetry rule, off unless needed and reviewed.
- **On by default, with a switch,** is the standard's default, which the owner confirmed on #858.
  A crash can't be reported after the fact, so asking first would leave the earliest crashes,
  the ones at launch, unreported.
- **A code instead of a message** keeps a learner's words out: messages from the account service,
  SQLite, or Foundation can quote a search, a word, or a file name, and the scrubber's rules are a
  second line, not the first.

## Considered

- **Apple's crash reports and MetricKit only:** no SDK and nothing new to disclose, but only from
  people who opted in to sharing with developers, a day or more late, with no handled failures and
  no alerts.
- **Off by default, asking at first launch:** fewer reports, and no report of a crash before the
  question is answered.
- **Sentry's own MetricKit integration:** off, as the standard has it. It would report each crash
  a second time, a day later.

## Consequences

- The privacy policy (#904), the App Store privacy labels
  ([`app-store-privacy-labels.md`](../../apps/web/docs/app-store-privacy-labels.md)), and the
  privacy manifest declare Crash Data and Other Diagnostic Data, not linked to the person and not
  used for tracking.
- TestFlight builds are archived by hand, so their debug symbols reach Sentry through
  `apps/ios/Tools/upload_dsyms.py` in the TestFlight steps; without them, a report's stack trace
  is unsymbolicated, and a failed upload is a warning, not a failed release.
- The app links `sentry-cocoa`, and so does the share extension, through `SearchExperience`, though
  it never starts it.
- [`ios-crash-reports.md`](../agents/ios-crash-reports.md) has how it's built and checked, and the
  product docs' [Crash reports](../../apps/ios/docs/product/crash-reports.md) what the learner
  sees.
