# The app's accessibility audits

The UI tests run Apple's accessibility audit, XCUITest's `performAccessibilityAudit`, on every
screen the product docs list, on the iPhone, the iPad, and the Mac. How the UI tests are run, and
the harnesses they launch the app with, are in [`ios.md`](ios.md), Tests on every platform; how a
test waits is in [`ios-ui-tests.md`](ios-ui-tests.md).

## What runs

Four classes in `apps/ios/UITests/Accessibility/` walk one tab each, `SearchAuditUITests`,
`TranslateAuditUITests`, `PlayerAuditUITests`, and `AccountAuditUITests`, with three tests apiece:

- **At the default text size**, in light appearance.
- **At the largest text size**, Accessibility XXXL, in light appearance. The app is launched with
  `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityXXXL`
  (`TestDevice.largestTextArguments`), its own setting for that launch: the Simulator's
  Settings stay as they were. The Mac skips it: macOS has no Dynamic Type, so an app's text
  doesn't follow a size setting there.
- **In dark appearance**, at the default text size. The app is launched with
  `ZENBU_APPEARANCE=dark`, a Debug-only harness (`LaunchHarness.colorScheme`) that draws every
  window and sheet dark, so the device's appearance isn't touched either. Color changes only what
  the contrast audit sees, and the default size is where contrast is held to the stricter ratio,
  so dark isn't run again at the largest size.

A walk launches the app fresh for each part of its tab, reaches each screen the way a learner
does, and audits it (`audit(_:in:)` in `AccessibilityAudit.swift`). It collects every finding and
fails once, at the end, listing each finding that isn't allowed, so one run measures a whole tab.
Each test attaches **Accessibility findings**: the screens it audited, the findings not allowed,
those allowed, those only reported, any allowed entry that matched nothing, and what each kind of
finding means. A screen with findings also attaches its screenshot;
`TEST_RUNNER_ZENBU_AUDIT_SCREENSHOTS=1` on the `xcodebuild` command keeps every screen's. Read
them with `xcrun xcresulttool export attachments`.

## Each audit and what it decides

| Audit | Where | Decision |
| --- | --- | --- |
| Hit region | Everywhere | Fails. A control is at least 44 by 44 points (`HitTarget.minimum`); `OutsetHitTarget` grows a small icon's target around it without moving anything laid out beside it |
| Text clipped | iPhone | Fails |
| Dynamic Type | iPhone | Fails |
| Element detection | Everywhere | Fails |
| Element description | iPhone and iPad | Fails |
| Trait | iPhone and iPad | Fails |
| Element description, action, and parent and child | Mac | Reported, not failed: they report SwiftUI's own AppKit elements (unnamed groups for stacks and sections, a List's outline, a NavigationLink row's role, a Picker's pop-up), which no app code names |
| Contrast | Everywhere | Reported, not failed: its findings are the system's secondary and tertiary text styles, the tint on Liquid Glass, and text under the bars' scroll edge, and raising them recolors the app, a design decision |
| Text clipped and Dynamic Type | iPad | Not run: they step the text size while the system's floating tab bar lays itself out, and the tab bar can loop in its own layout until the app stops responding. A sample of the hung app shows its main thread in `_UIFloatingTabBar`'s `layoutSubviews`, under the audit's `_axAuditCheckDynamicTextSupport`, with none of the app's code. The iPhone runs both on the same views |
| Element detection | iPad: Image's sources, a frequency rank's details, Add to List, a word's photo, Handwriting, Radicals, a frequency dictionary's details, Stroke Order, Sign In, and Delete Account | Not run: each shows a sheet or alert over a page that stays dimmed but legible behind it, and element detection reads that page's text from the screen as text VoiceOver can't reach. VoiceOver rightly skips it while the sheet is up, so there is no element to name. The iPhone audits the same sheets, and finds nothing behind them |
| Dynamic Type | iPhone: Image's sources | Not run: the Image alert is Apple's, and the system rebuilds it as the audit steps into the accessibility sizes, so the audit loses what it found and can't name it. Apple sizes and scrolls its alerts itself |

`AllowedFinding.reportedOnly` holds the reported audits and why, and `AllowedFinding.notRun` the
ones a device skips, everywhere or on the screens it names; the reported counts are in [`harness-debt.md`](../harness-debt.md). A
reported audit that doesn't finish in XCTest's time, as contrast sometimes doesn't on a busy iPad,
is listed in the report and doesn't fail the test; any other audit that doesn't finish fails it. The Dynamic Type and text-clipped audits sweep the app
through every text size and report text they lose track of, so text that SwiftUI lays out again
(a List's rows and headers, a Form's labels) or redraws (a clock) can be reported though it grows
and fits; each such entry says which, and the largest-size pass's screenshot shows it whole.

## Allowed findings

Every finding a test lets pass is an entry in `AllowedFinding.list`
(`apps/ios/UITests/Accessibility/AccessibilityAuditExceptions.swift`), the one list
[`exceptions.md`](exceptions.md) names for the audits. An entry names its audit, the screens it is
on (the names the walks give them), the devices and text sizes, why it is allowed, and one element:

- by its identifier, or its identifier's prefix for one kind of element, such as a linked word
  (`watch.cue.`), or a prefix and a part, where the prefix also names a card's buttons (`word`);
- by its label, or a few labels with one reason, where the element has no identifier; or
- as a count of findings the audit can't attach to any element (`unnamed`), which XCTest then
  reports with no element. An entry allows that many on each of its screens and no more. Most
  are text under the bars, so a walk auditing the lower part of a long screen first drags its
  element to one height (`audit(_:placing:in:)`), which makes the count the same every run.

An entry is never added to make a test pass: fix the screen, and allow a finding only for a reason
a person checking the screen would accept. A finding the list doesn't allow fails the test, and an
unnamed finding is also recorded as XCTest's own issue. An entry that matched nothing is listed
under **Allowed but unneeded** in the report, not failed, since a sweep through the sizes can find
a little more or less on a busy machine; remove an entry that no device's run uses.

## What the audits can't check

The audits read the accessibility tree and the screen; they don't use VoiceOver. VoiceOver's
order and announcements, and the largest text size on a real device, are checked by a person on
an iPhone, from the checklist in the pull request that changes them.
