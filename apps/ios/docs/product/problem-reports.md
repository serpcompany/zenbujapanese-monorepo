# Problem reports

A learner tells the developers about a problem with **Report a Problem…** on Account. The report
goes through Sentry, with the same scrubbing and install ID as a
[crash report](crash-reports.md), and with an email for a reply if they give one. How it's built,
and how a report is found and answered, is in
[`ios-problem-reports.md`](../../../../docs/agents/ios-problem-reports.md).

- Source: #860, part of #858. The owner chose design A (everything in view), the row's place, the
  details, the email rules, and every line of copy (on #860, 2026-10-20). iPhone only while the
  Mac and iPad are on hold.
- SERP's [native app problem reports](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-problem-reports.md)
  standard, and the website's privacy policy (#904), which says what a report sends.

## The row

Account's Help & Support group holds **Help & Support**, then **Report a Problem…** (a pink tile
with `exclamationmark.bubble.fill`), then **Send Crash Reports**, with the crash reports' note
under the group. **Privacy Policy** and **Credits & Attributions** follow in a group of their own.
The row opens the form as a sheet.

Check: UI `AccountUITests.testAccountListsEveryArea` (each row shows; not their order).

## The form

**Report a Problem** has everything in view, top to bottom:

- **What happened?**, a box that grows from four lines, "Describe the problem".
- An email field, "Your email (optional, for a reply)", one line like the app's other email
  fields. Signed in, it opens with the Zenbu account's email, which the learner can change or
  clear; signed out, it opens empty. Under it, a note says where the report goes and
  what's removed, and, signed in, that the account's email is sent for a reply unless cleared, or,
  signed out, to enter an email for one. While the field holds something that isn't an email
  address, a line above the note says "Enter an email address, or leave this empty."
- **Included with your report**: one row each for the version and build, iOS, the device's model
  identifier (such as `iPhone17,1`), signed in or out, crash reports on or off, the installed
  frequency dictionaries (or None), and whether the microphone and camera are allowed, denied, or
  not asked. These rows are exactly what's sent. The note under them says Sentry also adds the
  iPhone's state, such as memory in use and Low Power Mode, and that no conversations, searches,
  lists, or photos are attached.

**Send** is the toolbar's confirm button. It stays off until What happened? has text, while the
email isn't an address, and until the details have loaded. Sending shows a spinner in its place,
then **Report Sent**, "Thanks. Your report is on its way.", with **Done**. Closing the form with
anything typed asks first, with **Discard Report**; the filled-in account email alone isn't
typed text, and closes at once. Swiping the sheet down is off while there's typed text.

A build with nowhere to send reports (a Debug build) keeps Send off, and the note says "This build
of Zenbu Japanese can't send reports. Email support@zenbujapanese.com instead.", with the address
as a link.

Check: package `ProblemReportFormTests` (Send's rules, the email signed in and out, typed text,
sending once, and a cleared email sending no contact); UI
`ProblemReportUITests.testAReportSendsOnceItSaysWhatHappenedAndTheEmailIsAnAddress`,
`testClosingAReportWithTextAsksFirstAndAnEmptyOneClosesAtOnce`, and
`testABuildThatCantSendKeepsSendOffAndGivesTheSupportAddress`, and
`AccountSignedInUITests.testAReportOpensWithTheAccountsEmailFilledInAndSaysSo`; and the Account
audits, which include the form, an email that isn't an address, and Report Sent.

## What a report holds

The report is an `info` event, tagged `report: problem`, and its own issue in Sentry. It holds:

- what the learner wrote, without file paths, links, and email addresses, which become
  `<path>`, `<url>`, and `<email>`. A path or a link takes the rest of its line with it. Quoted
  words and Japanese stay, since a learner reporting a word's problem names the word;
- the email, only when the whole field is one email address;
- the details rows, as `Label: value` lines, and the microphone and camera permissions; and
- what Sentry adds to every crash report: the app and system versions, the device's model and
  state, and the install ID, which crash reports from the same install share. Like a crash report,
  it has no location, IP address, device name, locale, or time zone.

Check: package `ProblemReportTests` (the event, the contact rule, the scrubbing, and the details).

## With crash reports off

A report still goes, because the learner chose to send it. Sentry starts just to send it, with no
crash, freeze, or termination reporting, then closes. A crash after that sends nothing. A report
that can't go, such as with no connection, waits on the device and goes at a later launch, with
crash reports on or off. Turning crash reports off deletes the crash reports waiting, but not a
problem report waiting with them. If crash reports are turned on while a report is sending, they
start once it's sent.

Check: package `ProblemReportSendingTests`, `CrashReporterSwitchTests` (off keeps a waiting
report), and `CrashReportingMachineTests` (every order of sends, flushes, and switch changes, with
a stand-in for Sentry).

## Checked by hand

| By hand | Closest automated check |
| --- | --- |
| A report from a Release Zenbu Dev build arrives in `zenbujapanese-ios`, with crash reports on and off, scrubbed, with the details and the install ID ([`ios-problem-reports.md`](../../../../docs/agents/ios-problem-reports.md#checking-a-report-arrives)) | `ProblemReportTests` and `ProblemReportSendingTests` |
| Sent offline with crash reports off, a report arrives once, at a later launch online | `ProblemReportSendingTests.waitingReportGoesAtLaunch` |
| The **Zenbu problem reports** alert emails the triager | None |
