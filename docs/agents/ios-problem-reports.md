# Problem reports (iOS)

How **Report a Problem…** sends a learner's report through Sentry, with crash reports on or off,
how to check that one arrives, and how a report is found and answered. What the learner sees is in
[`apps/ios/docs/product/problem-reports.md`](../../apps/ios/docs/product/problem-reports.md). It
uses the crash reports' SDK, destination, install ID, and scrubber
([`ios-crash-reports.md`](ios-crash-reports.md)), and SERP's
[native app problem reports](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-problem-reports.md)
standard (#860).

## Code layout

In `apps/ios/Modules/Sources/SearchExperience/Diagnostics/`:

- **`ProblemReport/`:**
  - `ProblemReportView`: the sheet, and `ReportAProblemButton`, Account's row
    (`account.report-a-problem`). Its fields' identifiers start `problem-report.`.
  - `ProblemReportForm`: the form's state, which is all the view decides: the email it opens
    with, the note, whether Send is on, typed text, and sending once. A `ProblemReportSender` is
    where it sends: `.live` is `CrashReporter`, and UI tests launch with
    `ZENBU_PROBLEM_REPORT_STAND_IN=1` (Debug only, `LaunchHarness.problemReportSender`) for one
    that can send and sends nowhere.
  - `ProblemReportDetails`: the details rows, read when the form opens: the bundle's version and
    build, `ThisDevice.systemName` and `model` (in `Platform/`), the OS version, the account, the
    switch, the installed frequency packs' names, and the microphone's and camera's permissions.
  - `ProblemReport`: the event, and the contact rule.
- **`CrashReportingMachine`:** a pure state machine for Sentry's three modes, `off`, `reporting`
  (crash reports on), and `sendingOnly` (started just to send problem reports). Each change, the
  switch turned on or off, a report sent, a flush done, a launch with reports waiting, returns
  the actions to take: start for reporting, start for sending only, capture, flush, close, and
  delete the crash reports.
- **`CrashReportingSession`:** the `@MainActor` instance that runs those actions on a
  `CrashReportingSDK`. `CrashReporter` keeps one for the app, made at launch only in a build that
  has a destination, so `CrashReporter.canSendProblemReports` is false in any other.

## The event

`ProblemReport.event()` makes an ordinary event at level `info`, tagged `report: problem`, with
the fingerprint `["problem-report", <its own event ID>]`, so each report is its own issue, and the
trimmed description as its message. Its contexts:

- `report`: `details`, the rows as `Label: value` lines; `crash_reports`, `on` or `off`; and
  `contact`, only when `ProblemReport.contact(from:)` finds the whole trimmed field to be one email
  address (the scrubber's own email pattern, anchored).
- `permissions`: `microphone` and `camera`, each `allowed`, `denied`, `not asked`, or
  `restricted`.

`CrashReportScrubber` runs on it as on every event, with three differences for an event tagged
`report: problem` (`ProblemReport.isProblemReport`): its message goes through only the path, URL,
and email rules (`scrubWritten`), so quoted words and Japanese stay; it keeps the `report` and
`permissions` contexts (`problemReportContexts`), which it drops from any other event; and it
keeps `report.contact` only while it's still wholly an email, through no rule. The path and URL
rules end only at a line break, a quotation mark, or an angle bracket, so a path or link takes the
rest of its line.

## Sending

With crash reports on, the report is captured on the running SDK and goes with them. With them
off, `CrashReportingMachine.send` returns start for sending only, capture, and flush:
`CrashReporter.sendingOnlyOptions` are the app's options with the crash handler, app hangs, and
watchdog terminations off, the cache folder `Library/Caches/<bundle ID>/Problem Reports`, and a
`beforeSend` that drops any event that isn't a problem report. The flush (up to 15 seconds,
`CrashReportingPolicy.flushTimeout`) runs off the main thread, since it blocks, and when the last
one finishes the machine closes the SDK, then starts reporting if the switch was turned on
meanwhile.

- **A report that couldn't go** stays in `Problem Reports/io.sentry/<DSN hash>/envelopes/`. At a
  launch with crash reports off, the session starts sending only, just to flush it. Before Sentry
  starts for crash reports, at launch or from the switch, the session moves waiting envelopes into
  `Sentry/` at the same relative path, so the main transport sends them.
- **The switch off** deletes `Sentry/`, as for crash reports, and never `Problem Reports/`, which
  is beside it rather than inside, as the standard has it, for that reason.
- **Known limit:** a report sent with crash reports on that can't go waits in `Sentry/`, and
  turning crash reports off deletes it with them; the standard keeps it until they're back on.
- **A handled failure** recorded while Sentry runs only to send is dropped by `beforeSend`, and
  counts as sent for the rest of that launch.

## Tests

- **Package** (`-only-testing:SearchExperienceTests/<suite>`, a local run, not CI):
  `CrashReportingMachineTests` runs every order of up to six switch changes, sends, and flushes
  from each kind of launch and checks that nothing catches crashes with the switch off, nothing
  starts twice, every send is captured and flushed, and the end state follows the switch;
  `ProblemReportSendingTests` runs the session against `StandInCrashReportingSDK`;
  `ProblemReportTests` checks the event, the contact rule, and the scrubbing; and
  `ProblemReportFormTests` the form.
- **UI:** `ProblemReportUITests`,
  `AccountSignedInUITests.testAReportOpensWithTheAccountsEmailFilledInAndSaysSo`,
  `AccountUITests.testAccountListsEveryArea`, and `AccountAuditUITests`, which audits the form, an
  email that isn't an address, and Report Sent.

## Checking a report arrives

Build and install Zenbu Dev for Release on this checkout's Simulator, as in
[`ios-crash-reports.md`](ios-crash-reports.md#checking-a-report-arrives), and launch it without a
test switch. Then, through the Simulator, signed out:

1. **Crash reports on:** send "The “Language” menu froze after I opened
   /var/mobile/Documents/notes.txt", with the email `pat@example.com`.
2. **Crash reports off** (`xcrun simctl spawn <simulator-udid> defaults write
   com.zenbujapanese.dictionary.dev crash-reports.send -bool NO` before launch): send another,
   then launch with `-ZBTestCrash YES` and again without: the report arrives, and no crash.
3. **Offline, with crash reports off:** launch with `-ZBTestOffline YES`, send a report, quit, and
   launch without it: the report arrives once.

In `zenbujapanese-ios`, environment `qa`, each report is an `info` issue whose message keeps
“Language” and reads `<path>` for the path; `report.contact` is the email; `report.details` lists
the rows; it has no location; and its user ID is the one the same install's crash reports carry.
The **Zenbu problem reports** alert emails each new one.

## Triage

`devin@serp.co`, the Sentry member behind `support@zenbujapanese.com`, triages problem reports.
The Sentry alert **Zenbu problem reports** (#742, `zenbujapanese-ios`) emails that member when a
new issue tagged `report: problem` appears; Sentry treats `info` events as low priority, so its
default alerts may skip them. Keep the alert out of shared Slack channels, since an issue's title
is the person's own words.

- **Finding them:** search `is:unresolved report:problem` over a wide range, since each report is
  one event and drops out of the default 14 days:
  `https://serpcompany.sentry.io/issues/?project=4512238676213760&query=is%3Aunresolved%20report%3Aproblem&statsPeriod=90d`.
  `production` holds reports from TestFlight and the App Store, and `qa` from Zenbu Dev. In the
  event's Contexts, `report.details` is what the person saw and `report.contact` their email.
- **Replying:** as `support@zenbujapanese.com`, never a personal address, asking for anything
  missing. Email routing only forwards incoming mail, so replying as it needs send-as set up in
  the inbox it reaches.
- **A confirmed bug** becomes a GitHub issue here, in your own words, with the app and iOS
  versions and the Sentry issue's ID. Never paste the person's text or email into an issue, a PR,
  a review comment, a commit, or a test fixture, and don't use Sentry's "Create GitHub issue",
  which titles it with their words.
- **Closing the loop:** resolve the Sentry issue when the fix ships, tell the person if they left
  an email, and delete a report when its sender asks.
