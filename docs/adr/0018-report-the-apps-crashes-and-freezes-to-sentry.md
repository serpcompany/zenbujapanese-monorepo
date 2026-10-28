---
status: accepted
---

Superseded in part by ADR 0021: Crash Data and Other Diagnostic Data are now declared linked.

# Report the app's crashes and freezes to Sentry

The Zenbu Japanese app reports its crashes, its freezes, and the failures it handles at a few
boundaries to Sentry's `zenbujapanese-ios` project (#859), through `sentry-cocoa` pinned to an
exact 9.x version. Reports are on by default, with a **Send Crash Reports** switch in Account (on
the Mac, in Settings) that takes effect at once. This replaces #21's posture of no third-party
crash-reporting SDK; the rest of #21's privacy rules stand, and the app still keeps no analytics,
sessions, or tracing.

- **One folder imports Sentry.** `SearchExperience/Diagnostics/` holds the reporter, its options,
  the scrubber, and the handled failures, and `pnpm verify layers` refuses `import Sentry`
  anywhere else (`restrictedImports` in `tools/checks/src/layers.ts`). The options only iOS or the
  Mac has need `#if os`, which only `Platform/` may use, so they live in
  `SearchExperience/Platform/Diagnostics/`, the one other folder the rule allows, with the tests'
  `SearchExperienceTests/Diagnostics/`. `TranslatorCore` and `TranslatorOnDevice` stay free of it.
- **One `configure(options)` sets every option that matters,** each with a unit test: the crash
  handler, app hangs at 2 seconds, and watchdog terminations on; and off, everything else that
  collects: memory introspection, all threads' stack traces, Spotlight, default PII, sessions,
  automatic and network breadcrumbs, failed requests, tracing and trace headers, file I/O and Core
  Data tracing, MetricKit, Sentry's logs and metrics, client reports, swizzling, screenshots, the
  view hierarchy, user-interaction tracing, and on the Mac uncaught `NSException` reporting. Session replay's sample rates are set to 0 as well.
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

## Where this differs from the standard

SERP's [native app error reporting](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-error-reporting.md)
standard was written for desktop apps. Where this app departs from it:

- **`qa` comes from the bundle ID's suffix,** not a `-dev.` version, and no CI rejects it. A
  build with `ZENBU_BUNDLE_ID_SUFFIX` set has another bundle ID, which can't ship under the App
  Store's app record, so a `qa` build can't reach learners.
- **dSYMs go up by hand,** from the TestFlight steps, since no release CI archives the app (see
  Consequences).
- **Handled failures are sent too,** beyond the standard's crashes and freezes: a code from each
  of a few boundaries, never a message.
- **Four test switches, not two:** `-ZBTestCrash` and `-ZBTestFreeze` as the standard has them,
  and `-ZBTestError` (a seeded handled failure) and `-ZBTestOffline` (no network for Sentry), to
  check scrubbing and a report that waits offline. Only a `qa` build reads any of them.
- **File names:** the standard never includes file paths and names. The scrubber removes paths,
  quoted names, and a bare file name ending in a data or media extension (`.txt`, `.csv`,
  `.jpg`, and the like); a bare name with another extension, or the earlier words of a name with
  spaces, can stay. Handled failures send no message at all, and no crash message in the app's
  own code holds a value, so such a name can only come from a system exception's reason.

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
- The app links `sentry-cocoa` statically, and so does the share extension, through
  `SearchExperience`, though it never starts it.
- [`ios-crash-reports.md`](../agents/ios-crash-reports.md) has how it's built and checked, and the
  product docs' [Crash reports](../../apps/ios/docs/product/crash-reports.md) what the learner
  sees.

## Amendment: the browser extension reports the same way

Amended 2026-10-28 (issue 953): the browser extension's error reports follow this record. They
are on by default, as here, with a **Send Crash Reports** switch on its Settings page that takes
effect at once, and they go to Sentry in the same `serpcompany` organization, with the same rule
of a code, never a message, for a handled failure. The extension has no Sentry project of its own
yet: the owner chose on 2026-10-27 not to create `zenbujapanese-extension` for now, so its DSN is
empty and no build sends anything until it is created. How it is built, scrubbed, and checked is
in [`extension-error-reports.md`](../agents/extension-error-reports.md).
