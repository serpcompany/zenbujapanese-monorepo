---
status: accepted
---

# Send problem reports through the crash reports' Sentry setup

The Zenbu Japanese app's **Report a Problem…** sends what a learner writes, an email for a reply,
and the details the form shows to Sentry's `zenbujapanese-ios` project (#860), through the SDK,
destination, install ID, scrubber, and switch that crash reports use
([ADR 0018](0018-report-the-apps-crashes-and-freezes-to-sentry.md)). Each report is an ordinary
`info` event tagged `report: problem`, its own issue, and the **Zenbu problem reports** alert
emails the triager. With crash reports off, Sentry starts only to send it, then closes.

- **One path.** The report goes through `CrashReporter` and `CrashReportScrubber` in
  `SearchExperience/Diagnostics/`, with no second Sentry setup and no user-feedback API.
- **A pure state machine** (`CrashReportingMachine`) decides Sentry's modes, off, reporting, and
  sending only, and is tested in every order of sends, flushes, and switch changes.
- **The design is the owner's:** a sheet with everything in view, the details as rows, and a
  Permissions row (design A, on #860, 2026-10-20).

## Where this differs from the standard

SERP's [native app problem reports](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-problem-reports.md)
standard was written for desktop apps, and lets an app depart from it only with a recorded
decision. Where this app departs:

- **Signed in, the email is filled in.** The standard sends a contact only when the person types
  one. Here the field opens with the Zenbu account's email, which the learner can change or clear,
  and the note says it's sent for a reply unless cleared. Signed out, it opens empty. The owner
  decided this on #860 (2026-10-20): a learner who signed in shouldn't have to type an address
  Zenbu already has.
- **A row in Account, not a Help menu item.** The standard's places are the Help menu, the menu
  bar menu, and Settings › General. The iPhone has no menu bar, so the row sits in Account's Help
  & Support group. The Mac's Help menu item and Settings row wait for the Mac (#661), which is on
  hold.
- **The send-only cache folder is beside `Sentry/`,** at `Library/Caches/<bundle ID>/Problem
  Reports`, not inside it, because turning crash reports off deletes `Sentry/` (ADR 0018).
- **Turning crash reports off keeps a waiting report.** The standard's known limit leaves such a
  report in the main queue until reports are back on. Here the switch deletes that queue, so it
  first moves each envelope tagged `report: problem` into `Problem Reports/`, which sends it at a
  later launch. A report still sending during the close could, rarely, go twice.
- **A handled failure recorded while Sentry runs only to send is dropped,** and counts as sent for
  the rest of that launch, so turning crash reports off sends no failures.
- **A path takes the rest of its line.** The standard removes paths, URLs, and emails and keeps the
  rest. A path can hold spaces, so the path rule runs to a line break, a quotation mark, or an
  angle bracket, and removes the words after a path on its line. A link ends at a space too.
- **Closing with text typed asks first.** The standard throws a report away however the window
  closes. Here Cancel asks with **Discard Report**, and swiping the sheet down is off while there's
  typed text, so a swipe never loses a report (design A).

## Why

- **One setup is one thing to scrub and disclose.** The install ID, the scrubber's rules, and the
  switch are already reviewed for crash reports; a second SDK or path would need its own.
- **A filled-in email gets more replies.** A signed-in learner already gave Zenbu their address,
  and a report without a contact can't be answered. The field stays editable and the note says
  what's sent, so the learner still chooses.
- **A typed report is worth more than a tidy close:** a learner who lost a long description to a
  swipe, or to the switch, wouldn't write it again.

## Considered

- **Sentry's user-feedback API:** it skips `beforeSend`, so nothing would be scrubbed.
- **An empty email field when signed in,** as the standard has it: fewer reports could be
  answered, for no privacy gain the note doesn't already give.
- **Sending a report with a contact but without the install ID,** so crash reports stay unlinked:
  the standard and #860 match a report to the install's crash reports by that ID, and triage needs
  it.

## Consequences

- An install's crash reports can now be linked to the person: a problem report carries the same
  install ID and can carry the account's email. The App Store privacy labels
  ([`app-store-privacy-labels.md`](../../apps/web/docs/app-store-privacy-labels.md)) and the
  privacy manifest declare Device ID, Customer Support, Crash Data, and Other Diagnostic Data,
  each linked and not used for tracking. This replaces ADR 0018's unlinked Crash Data and Other
  Diagnostic Data, and the answers in App Store Connect must change with it.
- The privacy policy's crash and problem reports section (#904) says what a report sends, that the
  email links the install's reports to the account, and that a report goes with crash reports off.
- [`ios-problem-reports.md`](../agents/ios-problem-reports.md) has how it's built, checked, and
  triaged, and the product docs' [Problem reports](../../apps/ios/docs/product/problem-reports.md)
  what the learner sees.
