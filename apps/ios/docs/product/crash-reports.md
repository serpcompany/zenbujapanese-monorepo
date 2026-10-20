# Crash reports

When Zenbu Japanese crashes or freezes, or an account sync, a download, the dictionary, or
Translate's start fails, it sends a report to its developers through Sentry, so the problem can be
found and fixed. A report says where in the app's code it happened and on what, never what the
learner searches, reads, types, says, or photographs. How it's built is in
[`ios-crash-reports.md`](../../../../docs/agents/ios-crash-reports.md).

- Source: #859, part of #858. Reports are on by default, with a switch in Settings that takes
  effect at once (owner, on #858), and the switch is a stock toggle row with no mockup (owner,
  2026-10-12).
- [ADR 0018](../../../../docs/adr/0018-report-the-apps-crashes-and-freezes-to-sentry.md) records
  why the app now has a crash-reporting SDK.

## Send Crash Reports

Account has a **Send Crash Reports** switch, in the Help & Support group under
[**Report a Problem…**](problem-reports.md), on until the learner turns it off. The line under it says what's sent and where: the app and system versions, the
device's model and state (such as memory in use), a random ID for this install, and where in the
app's code it happened, to its developers through Sentry, and that crash reports never include the
learner's searches, words, sentences, notes, photos, conversations, or account details. On the Mac, the same switch is in Settings' Account pane.

Turning it off stops reports at once, without waiting on the network, and a crash after that sends
nothing. It also deletes the reports still waiting on the device to be sent, so turning it back on
never sends one from before. Turning it back on starts them again without a relaunch. A problem
report still goes with the switch off ([problem reports](problem-reports.md#with-crash-reports-off)).

Check: UI `AccountUITests.testCrashReportsAreOnUntilTheSwitchTurnsThemOff` (on at first, and off
once flipped) and `testAccountListsEveryArea` (the row); package `CrashReporterSwitchTests` (off
closes Sentry and deletes its waiting reports but not a waiting problem report, and on starts it
again, against a stand-in for the SDK), `CrashReportingMachineTests` (never catching crashes with
the switch off, in any order of switch changes and problem reports), and
`CrashReportingPolicyTests` (on until turned off, and a build without a destination that the
switch can't start). The Mac's
Settings pane is checked by hand while the Mac is on hold (2026-10-18).

## What a report holds

A crash or a freeze of 2 seconds or more sends a report with its stack trace, the app's version and
build, the system's version, and the device model. iOS ending the app for using too much memory
or for hanging is reported too, on the next launch. A crash is sent on the next launch, and a
report that can't be sent, such as with no connection, waits on the device and goes once it can.

A failure the app handles sends only its area and a fixed code, such as `account_sync:
account_service_error.refused`, with at most four short details such as an HTTP status or a pack's
ID. Each is sent at most once a launch, and never holds the error's message. A cancelled task, a
lost connection, or a session that ended sends nothing, since each is expected; a download the
app's setup or its host broke, such as one refused for its certificate, is reported.

| Area | Fails when |
| --- | --- |
| Account sync | The account service refuses or garbles a sync |
| Frequency dictionaries | A pack's download or install fails |
| Language-analysis packs | A pack fails its check, or its install or an older pack's removal fails |
| The dictionary | The app's dictionary files are missing or the core doesn't load |
| Translate | The microphone is denied, or speech recognition or Apple Translation isn't available |

Every report carries a random ID made once for this install, and nothing else about the learner:
no name, email, account, IP address, location, device name, locale, or time zone. Before a report
leaves the device, web addresses, email addresses, quoted text, Japanese text, paths into the
app's or the learner's folders, and file names with a data or media extension (such as `.txt`,
`.csv`, or `.jpg`) are removed from everything it says; of a library loaded from those
folders, such as the app itself, only its name is kept. The system's own libraries keep their
paths, which say nothing about the learner.

Check: package `CrashReporterOptionsTests` (every Sentry option, the install ID as the only user,
and every report through the scrubber), `CrashReportScrubberTests` (paths, web and email addresses,
Japanese and quoted text, and a fully populated report), and `HandledProblemTests` (each failure's
code, once a launch, never its message or payload).

## Which builds send

Only TestFlight and App Store builds (as `production`) and a Release build of Zenbu Dev (as `qa`)
send reports. Debug builds, a Debug Zenbu Dev, the share sheet's card, and the app under unit or UI
tests never do.

Check: package `CrashReportingPolicyTests` (each build, and the test hosts); contract
`test_crash_report_settings.py` (the destination only in Release builds, never in the share
extension, and the privacy manifest's Device ID, Customer Support, Crash Data, and Other Diagnostic
Data, each linked).

## Checked by hand

| By hand | Closest automated check |
| --- | --- |
| A crash, a freeze, and a handled failure each arrive in Sentry's `zenbujapanese-ios` as `qa`, symbolicated, with nothing the policy removes ([`ios-crash-reports.md`](../../../../docs/agents/ios-crash-reports.md#checking-a-report-arrives)) | `CrashReporterOptionsTests` and `CrashReportScrubberTests` |
| With the switch off before launch, a crash sends nothing. Turning it off in the running app deletes a report waiting offline; a crash after that isn't checked | `CrashReporterSwitchTests` (off closes the SDK), `CrashReportingPolicyTests`, and the UI switch test |
| A crash that couldn't be sent arrives once the app is back online | None: Sentry keeps it on the device |
