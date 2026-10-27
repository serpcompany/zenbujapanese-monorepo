# The app's accessibility audits

The UI tests run Apple's accessibility audit, XCUITest's `performAccessibilityAudit`, on every
screen the product docs list, on the iPhone, the iPad, and the Mac. How the UI tests are run, and
the harnesses they launch the app with, are in [`ios.md`](ios.md), Tests on every platform; how a
test waits is in [`ios-ui-tests.md`](ios-ui-tests.md).

## What runs

Five classes in `apps/ios/UITests/Accessibility/` walk the app, `SearchAuditUITests`,
`TranslateAuditUITests`, `PlayerAuditUITests`, and `AccountAuditUITests` one tab each and
`ShareSheetAuditUITests` the share sheet's card on the iPhone and iPad, with three tests apiece:

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
On the iPhone and iPad, `AccountAuditUITests` also signs in to the stand-in account: with
`ZENBU_ACCOUNT_STAND_IN_KEPT=1` for the Media Library holding a photo from another device, the
signed-in Profile, and Zenbu Account, and, after saving a photo on a word, with
`ZENBU_ACCOUNT_STAND_IN_REFUSES` for Zenbu Account's notes on a photo refused as too many and on
photos waiting for storage ([`ios-account-sync.md`](ios-account-sync.md)). Each test attaches
**Accessibility findings**: the screens it audited, the findings not allowed,
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
| Element detection | iPad: Image's sources, a frequency rank's details, Add to List, a word's photo, Handwriting, Radicals, a frequency dictionary's details, Stroke Order, Sign In, Delete Account, Report a Problem (as written, with an email that isn't an address, its details, and sent), and the subscription's paywall and Delete Account with an App Store subscription, before and after deleting, each at the top and scrolled | Not run: each shows a sheet or alert over a page that stays dimmed but legible behind it, and element detection reads that page's text from the screen as text VoiceOver can't reach. VoiceOver rightly skips it while the sheet is up, so there is no element to name. The iPhone audits the same sheets, and finds nothing behind them |
| Dynamic Type | iPhone: Image's sources | Not run: the Image alert is Apple's, and the system rebuilds it as the audit steps into the accessibility sizes, so the audit loses what it found and can't name it. Apple sizes and scrolls its alerts itself |
| Dynamic Type | iPhone: Image Search's text | Not run: the Text view sets its text one size larger than the device's, by design, so the audit always reports it, and its list lays every row out again at each size, so the audit often loses what it found and reports it with no element, which no allowance can match. The largest-size pass shows the text whole, and the text-clipped audit still runs there |

`AllowedFinding.reportedOnly` holds the reported audits and why, and `AllowedFinding.notRun` the
ones a device skips, everywhere or on the screens it names; the reported counts are in [`harness-debt.md`](../harness-debt.md). A
reported audit that doesn't finish in XCTest's time, as contrast sometimes doesn't on a busy iPad,
is listed in the report and doesn't fail the test; any other audit that doesn't finish fails it. The Dynamic Type and text-clipped audits sweep the app
through every text size and report text they lose track of, so text that SwiftUI lays out again
(a List's rows and headers, a Form's labels) or redraws (a clock) can be reported though it grows
and fits; each such entry says which, and the largest-size pass's screenshot shows it whole.

The Translate harness's silence prompt counts down on the harness's clock (`ScriptedClock`,
[`translate.md`](translate.md), Simulator harness), and a number changing during that sweep lays
the card out again. So the Translate audit holds that clock while it audits the prompt
(`holdingTheConversationClock`): it posts the Darwin notice
`com.zenbujapanese.dictionary.uitests.translate-hold-clock`, waits for the harness's answer,
`…translate-clock-held`, and posts `…translate-release-clock` after, which starts the clock again
from where it stopped.

On a page scrolled down to a section, that sweep reflows everything above it and slides the
section's text under the bars, where the audit loses it and can't name the element. So the sections
that sit low on their pages, Word Detail's kanji, a word's note, Kanji Detail's readings, the
Account page's about part (Help & Support, Report a Problem, the crash reports switch, and the links
under them), and at the largest size the Account page's rows below the profile (`library`, Media
Library to Frequency Dictionaries), get those two audits on their own. `ZENBU_ONLY_SECTION`, a
Debug-only harness (`LaunchHarness.onlySections`), opens the page with only the sections it names
(Word Detail's examples under its meanings are one, `meaning-example`, named with `meaning`, the
section that holds them, and audited on 日本's page), at the page's top, and the walk audits them
there (`AuditPart.textSizes`). The page scrolled to the section keeps every other audit
(`AuditPart.allButTextSizes`). On the iPhone the walk also opens a caption's word sheet at full
height, so the Player page isn't showing behind it.

Account's rows show why (#912). Scrolled to Translations at the largest size, the sweep reported
Lists, Translations, and both counts as not following the text size, and Lists and Translations as
clipped, in each of five runs, calm Mac or busy, once with no element for Translations. From the
page's top it reported none of them, and with the rows alone at the top, only the two clipped
titles, in each of four. Both titles and counts grow at every size, from 20 points tall at the
default size to 63 at the largest, and show whole at each, the titles wrapping under their icons as
the page's other rows do; so the clipped titles are allowed as text that scales.

The subscription's screens, Zenbu Account in each state the stand-ins show
([`ios-subscription.md`](ios-subscription.md), Test it), the paywall, and Delete Account with an App
Store subscription, fit on the screen whole at the default size, where the sweep takes them
through every size from the page's top. At the largest size the walk audits each page's top with
every audit, and the part below it scrolled into place without those two.

The share sheet's card is drawn by the share extension, in a process of its own, and the audit
reads only the app's: in the share sheet it finds nothing on the card, not even the contrast
findings every screen of the app has. So `ShareSheetAuditUITests` opens the same card, the
extension's `ShareCardScene`, full screen inside the app (`ZENBU_SHARE_CARD_IN_APP=1`,
[`ios-share-sheet.md`](ios-share-sheet.md), Tests), for a sentence and for a photo.

## Allowed findings

Every finding a test lets pass is an entry in `AllowedFinding.list`
(`apps/ios/UITests/Accessibility/AccessibilityAuditExceptions.swift`), the one list
[`exceptions.md`](exceptions.md) names for the audits. An entry names its audit, the screens it is
on (the names the walks give them), the devices and text sizes, why it is allowed, and one element:

- by its identifier, or its identifier's prefix for one kind of element, such as a linked word
  (`watch.cue.`), or a prefix and a part, where the prefix also names a card's buttons (`word`); or
- by its label, or a few labels with one reason, where the element has no identifier.

A finding the audit can't attach to any element is never allowed: it fails the test and is also
recorded as XCTest's own issue. A walk auditing the lower part of a long screen first drags its
element to one height (`audit(_:placing:in:)`), so the same rows are on screen every run.

An entry is never added to make a test pass: fix the screen, and allow a finding only for a reason
a person checking the screen would accept. A finding the list doesn't allow fails the test. An
entry that matched nothing is listed under **Allowed but unneeded** in the report, not failed,
since a sweep through the sizes can find a little more or less on a busy machine; remove an entry
that no device's run uses.

## What the audits can't check

The audits read the accessibility tree and the screen; they don't use VoiceOver. VoiceOver's
order and announcements, and the largest text size on a real device, are checked by a person on
an iPhone, from the checklist in the pull request that changes them. They read only the app's own
process, so the share sheet's card is audited inside the app rather than in the sheet. The card
for a word isn't audited yet: on the iPhone, the Dynamic Type sweep from the default size loses its
headword's furigana, kanji, and pitch kana without naming them, four findings for 駅 and six for
食べる, though it names the same pieces from the largest size, and the same headline on 駅's page
in the app loses nothing ([`harness-debt.md`](../harness-debt.md)).
