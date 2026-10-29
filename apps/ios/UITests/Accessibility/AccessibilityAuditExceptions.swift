import XCTest

struct AllowedFinding {
  enum Element {
    case identifier(String)
    case identifiedBy(prefix: String)
    case word(prefix: String, inside: [String])
    case label(String)
    case labels([String])

    func names(_ finding: AuditFinding) -> Bool {
      guard finding.elementType != nil else { return false }
      return switch self {
      case .identifier(let identifier): finding.identifier == identifier
      case .identifiedBy(let prefix): finding.identifier.hasPrefix(prefix)
      case .word(let prefix, let inside):
        finding.identifier.hasPrefix(prefix) && inside.contains { finding.identifier.contains($0) }
      case .label(let label): finding.identifier.isEmpty && finding.label == label
      case .labels(let labels): finding.identifier.isEmpty && labels.contains(finding.label)
      }
    }
  }

  let kind: AuditKind
  let element: Element
  let screens: [String]
  let devices: Set<TestDevice.Kind>
  let sizes: Set<TextSize>
  let reason: String

  func excuses(_ finding: AuditFinding, on device: TestDevice.Kind, in pass: AuditPass) -> Bool {
    kind == finding.kind && applies(to: finding.screen, on: device, in: pass) && element.names(finding)
  }

  func applies(to screen: String, on device: TestDevice.Kind, in pass: AuditPass) -> Bool {
    screens.contains(screen) && devices.contains(device) && sizes.contains(pass.size)
  }

  static let reportedOnly: [AuditKind: (devices: Set<TestDevice.Kind>, reason: String)] = [
    .contrast: ([.phone, .pad, .mac], Why.contrast),
    .elementDescription: ([.mac], Why.swiftUIOnTheMac),
    .action: ([.mac], Why.swiftUIOnTheMac),
    .parentChild: ([.mac], Why.swiftUIOnTheMac),
  ]

  struct Exclusion {
    let kind: AuditKind
    let devices: Set<TestDevice.Kind>
    let screens: [String]?
    let reason: String

    func covers(_ kind: AuditKind, on screen: String, _ device: TestDevice.Kind) -> Bool {
      self.kind == kind && devices.contains(device) && screens.map { $0.contains(screen) } ?? true
    }
  }

  static let notRun = [
    Exclusion(kind: .dynamicType, devices: [.pad], screens: nil, reason: Why.floatingTabBar),
    Exclusion(kind: .textClipped, devices: [.pad], screens: nil, reason: Why.floatingTabBar),
    Exclusion(kind: .elementDetection, devices: [.pad], screens: iPadSheets, reason: Why.behindSheet),
    Exclusion(kind: .dynamicType, devices: [.phone], screens: ["Image's sources"], reason: Why.imageAlert),
    Exclusion(kind: .dynamicType, devices: [.phone], screens: ["Image Search's text"], reason: Why.largerText),
  ]

  static let list =
    systemControls + linkedWords + textThatScales + playerControls + clocks + previews + design + chartDays
}

private let touch: Set<TestDevice.Kind> = [.phone, .pad]
private let chartDays = [
  allow(
    .hitRegion, .identifiedBy(prefix: "progress.new-words.bar."),
    on: ["Progress, a month of new words", "Progress, its end"], [.phone], because: Why.monthBar),
]
private let iPadSheets = [
  "Image's sources", "A frequency rank's details", "Add to List", "A word's photo", "Handwriting", "Radicals",
  "A frequency dictionary's details", "Stroke Order", "Sign In", "Delete Account", "Subscribe", "Subscribe, its plans",
  "Subscribe, its end", deletingWithAnAppStoreOne, "Delete Account, its App Store subscription",
  deletedWithAnAppStoreOne, "Deleted, its App Store subscription",
] + problemReports + ["Report a Problem, sent"]
private let shareCards = ["A shared sentence's card", "A shared photo's card"]
private let subscriptionStates = [
  "no subscription", "an App Store subscription", "a website subscription", "both stores", "a payment retried",
  "a first payment pending",
].map { "Zenbu Account, \($0)" }
private let syncWaiting = ["no subscription", "a payment retried", "a first payment pending"].map {
  "Zenbu Account, \($0)"
}
private let managedByApple = ["an App Store subscription", "both stores", "a payment retried"].map {
  "Zenbu Account, \($0)"
}
private let deletingWithAnAppStoreOne = "Delete Account, with an App Store subscription"
private let deletedWithAnAppStoreOne = "Deleted, with an App Store subscription"
private let deletingAndDeleted = [deletingWithAnAppStoreOne, deletedWithAnAppStoreOne]
private let zenbuAccountNotes = [
  "Zenbu Account, a photo refused as too many", "Zenbu Account, photos waiting for storage",
]
private let problemReportsEditing = ["Report a Problem", "Report a Problem, an email that isn't an address"]
private let problemReports = problemReportsEditing + ["Report a Problem, its details"]
private let bothSizes: Set<TextSize> = [.standard, .largest]

private func allow(
  _ kind: AuditKind, _ element: AllowedFinding.Element, on screens: [String],
  _ devices: Set<TestDevice.Kind> = touch, _ sizes: Set<TextSize> = bothSizes, because reason: String
) -> AllowedFinding {
  AllowedFinding(
    kind: kind, element: element, screens: screens, devices: devices, sizes: sizes, reason: reason)
}

private enum Why {
  static let contrast =
    "Its findings are the system's secondary and tertiary text styles, the tint on Liquid Glass, and text under the bars' scroll edge. Raising them recolors the whole app, a design decision; the counts are in harness-debt.md"
  static let swiftUIOnTheMac =
    "On the Mac these audits report SwiftUI's own AppKit elements: the unnamed groups it makes for stacks and sections, a List's outline, a NavigationLink row's role, and a Picker's pop-up. The app's code creates none of them by name; the counts are in harness-debt.md"
  static let barButton =
    "A bar button: the system draws its title, which stops growing at a size of its own and shows in the Large Content Viewer on a long press, as in Apple's apps"
  static let imageAlert =
    "The Image alert is Apple's: the system draws its title, message, and three buttons, and rebuilds the alert as the audit steps into the accessibility sizes, so the audit loses what it found and can't name it. Apple sizes and scrolls its alerts itself"
  static let emailField =
    "An email field is one line, as Apple's are, since an address doesn't wrap: at the largest sizes the system ends its prompt with an ellipsis, and VoiceOver reads it whole. At the default size the field shows its text whole and the audit still reads it as cut"
  static let searchField =
    "The search field is the system's and draws its own prompt; at the largest sizes the app already shortens the prompt to Look Up, or to Search in Player"
  static let floatingTabBar =
    "On the iPad these audits step the text size while the system's floating tab bar lays itself out, and it loops in its own layout until the app stops responding: a sample of the hung app shows its main thread in _UIFloatingTabBar's layoutSubviews, under the audit's _axAuditCheckDynamicTextSupport, with none of the app's code. The iPhone runs both on the same views, and the iPad's other audits still run at the largest size"
  static let clearButton =
    "The search field's clear button is the system's: on the iPad the field sits in the toolbar, where the system draws its clear button 20 points wide"
  static let behindSheet =
    "On the iPad a sheet or alert floats over the page, which stays dimmed but legible behind it, and element detection reads that page's text from the screen as text VoiceOver can't reach. VoiceOver rightly skips it while the sheet is up, so there is no element to name. The iPhone audits the same sheets, and element detection finds nothing behind them there"
  static let inlineWord =
    "A word linked inside a sentence is as large as the text it is part of: WCAG 2.5.8's inline exception. Every word of the sentence is a link, side by side"
  static let photoWord =
    "Image Search outlines each word where the photo shows it, at the size it is printed. The Text view lists the same words at the text size"
  static let scales =
    "It follows the text size: the largest-size pass shows it whole. The audit's sweep through the sizes misreads text that SwiftUI lays out again as the size changes, such as a List's rows and headers, a Form's labels, and an empty state"
  static let clock =
    "Text redrawn as a clock or countdown runs, which the audit's sweep through the sizes misreads; it follows the text size, as the largest-size pass shows"
  static let preview =
    "A one-line preview of a longer text that the next screen shows whole, as Mail's and Messages' lists do"
  static let cappedControls =
    "Player's control bar stays at the largest standard size at the accessibility sizes, so it keeps to one line, and pressing and holding a button shows it larger (product docs, Player)"
  static let headword =
    "A long headword shrinks one size to keep its reading beside the pitch accent, as the product docs say; at the accessibility sizes it is full size on a line of its own"
  static let monthBar =
    "With dates on the x axis, Swift Charts grouped the bars two to an element, so VoiceOver read two-day ranges; each bar is its own element now, 12 points wide on an iPhone, and a tap selects by its position across the chart"
  static let largerText =
    "Image Search's Text view sets its text one size larger than the device's, so the audit always reports it as missing the device's size, though it grows with it, as the largest-size pass shows. Its list lays every row out again at each size the audit steps through, so the audit often loses the text it found and reports it with no element to name, which no allowance can match. The text-clipped audit still runs there"
}

private let systemControls = [
  allow(.dynamicType, .identifier("frequency-detail.done"), on: ["A frequency rank's details"], because: Why.barButton),
  allow(.dynamicType, .identifier("frequency-pack.detail.done"), on: ["A frequency dictionary's details"], because: Why.barButton),
  allow(.dynamicType, .identifier("stroke-order.close"), on: ["Stroke Order"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-list-picker.done"), on: ["Add to List"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-detail.image-attachment-done"), on: ["A word's photo"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-detail.image-attachment-remove"), on: ["A word's photo"], because: Why.barButton),
  allow(
    .dynamicType, .identifier("delete-account.cancel"), on: ["Delete Account", deletingWithAnAppStoreOne],
    [.phone, .pad], because: Why.barButton),
  allow(.dynamicType, .identifier("delete-account.done"), on: [deletedWithAnAppStoreOne], [.phone], because: Why.barButton),
  allow(.dynamicType, .identifier("paywall.close"), on: ["Subscribe"], [.phone], because: Why.barButton),
  allow(.dynamicType, .identifier("share-card.done"), on: shareCards, because: Why.barButton),
  allow(.dynamicType, .identifier("problem-report.send"), on: problemReports, because: Why.barButton),
  allow(.dynamicType, .identifier("problem-report.done"), on: ["Report a Problem, sent"], because: Why.barButton),
  allow(.textClipped, .label("Look Up"), on: ["Recent lookups"], because: Why.searchField),
  allow(.textClipped, .label("Search"), on: ["Player's Recent"], because: Why.searchField),
  allow(.textClipped, .identifier("problem-report.email"), on: problemReportsEditing, because: Why.emailField),
  allow(
    .hitRegion, .label("Clear text"),
    on: ["Look Up's results", "Results filtered to none", "No matches", "Discovered Words"], [.pad], [.standard],
    because: Why.clearButton),
]

private let linkedWords = [
  allow(.hitRegion, .identifiedBy(prefix: "translate.pane.ja."), on: ["Two Panes"], because: Why.inlineWord),
  allow(
    .hitRegion, .word(prefix: "translate.sentence.", inside: [".source.", ".translation."]),
    on: ["A paused conversation", "A saved conversation", "Listening, paused"], because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "translate.typed.result."), on: ["A typed translation", "The word sheet"],
    because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "watch.cue."), on: ["A video", "A video its owner won't share"],
    because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "watch.cue."), on: ["A caption's word"], [.pad], because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "image-text.line."), on: ["Image Search"], because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "image-text.paragraph."), on: ["Image Search's text"], because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "conjugations.example-token."), on: ["A conjugated form"],
    because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "word-detail.example-token."), on: ["Word Detail", "A word's note"],
    because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "word-detail.meaning-example-token."), on: ["Word Detail"],
    because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "image-text.region."), on: ["Image Search"], because: Why.photoWord),
]

private let textThatScales = [
  allow(
    .dynamicType, .labels(["Source", "Version", "JLPT Level", "Status", "Storage"]),
    on: ["A frequency rank's details", "A frequency dictionary's details"], because: Why.scales),
  allow(.dynamicType, .identifier("frequency-detail.manage"), on: ["A frequency rank's details"], because: Why.scales),
  allow(
    .dynamicType,
    .labels([
      "Apple Translation", "Translate Player Captions With", "Translation Language", "English", "YouTube",
      "Show Furigana", "Show Word Meanings", "Hide Furigana on Known Words",
    ]), on: ["Reading Aids"], because: Why.scales),
  allow(
    .dynamicType, .labels(["Learning", "Lists", "1", "Translations", "0", "Progress"]), on: ["Account"],
    because: Why.scales),
  allow(.dynamicType, .identifier("account.progress.see"), on: ["Account"], because: Why.scales),
  allow(
    .dynamicType,
    .labels([
      "TODAY", "0 of 20 new words", "20 more to reach today’s goal", "M", "T", "W", "F", "S", "Daily Goal",
      "20 new words",
    ]), on: ["Account"], because: Why.scales),
  allow(
    .dynamicType, .labels(["Today", "Yesterday", "1 word", "3 words"]), on: ["Known words by date"], touch,
    [.standard], because: Why.scales),
  allow(.dynamicType, .label("Send Crash Reports"), on: ["Account, its about rows"], because: Why.scales),
  allow(
    .textClipped, .label("Send Crash Reports"), on: ["Account, its about rows"], touch, [.standard],
    because: Why.scales),
  allow(
    .dynamicType,
    .label(
      "When Zenbu crashes, freezes, or hits an error, such as a failed sync or download, it sends a report to its developers through Sentry: the app and system versions, the device's model and state (such as memory in use), a random ID for this install, and where in the app's code it happened. Crash reports never include your searches, words, sentences, notes, photos, conversations, or account details."
    ),
    on: ["Account, its about rows"], touch, [.standard], because: Why.scales),
  allow(
    .textClipped,
    .labels([
      "Translations", "Sign In to Sync",
      "Known words, lists, notes, photos, profile photo, settings, recent lookups, watch history, and bookmarked translations, on all your devices",
    ]),
    on: ["Account"], because: Why.scales),
  allow(
    .textClipped, .labels(["Learning", "Lists", "Daily Goal", "Progress"]), on: ["Account"], touch, [.standard],
    because: Why.scales),
  allow(
    .textClipped, .labels(["Media Library", "Known Words", "Learning"]), on: ["Account's library rows, alone"], [.phone],
    [.largest], because: Why.scales),
  allow(
    .textClipped, .labels(["Lists", "Translations"]), on: ["Account's collection rows, alone"], [.phone], [.largest],
    because: Why.scales),
  allow(.textClipped, .label("Daily Lists"), on: ["Lists, with daily lists"], [.phone], because: Why.scales),
  allow(
    .textClipped, .labels(["Reading Aids", "Frequency Dictionaries"]), on: ["Account's settings rows, alone"], [.phone],
    [.largest], because: Why.scales),
  allow(
    .dynamicType,
    .label(
      "Signing out keeps your profile, known words, lists, watch history, translations, notes, and media on this iPhone."
    ),
    on: ["Zenbu Account"] + zenbuAccountNotes, [.phone], because: Why.scales),
  allow(.dynamicType, .identifier("zenbu-account.sync-now"), on: subscriptionStates + zenbuAccountNotes, [.phone], because: Why.scales),
  allow(.dynamicType, .identifier("zenbu-account.sync-waits"), on: syncWaiting, [.phone], because: Why.scales),
  allow(.dynamicType, .label("Waiting to Sync"), on: syncWaiting + zenbuAccountNotes, [.phone], because: Why.scales),
  allow(
    .dynamicType, .identifier("zenbu-account.photos-wait"), on: ["Zenbu Account, photos waiting for storage"],
    [.phone], because: Why.scales),
  allow(
    .dynamicType,
    .label(
      "Your Zenbu account holds as many photos as it can, so 1 stays on this iPhone. Delete some in the Media Library, and it syncs the next time Zenbu opens."
    ),
    on: ["Zenbu Account, a photo refused as too many"], [.phone], because: Why.scales),
  allow(
    .dynamicType, .label("Managed by the Apple Account that bought it."), on: managedByApple, [.phone],
    because: Why.scales),
  allow(
    .dynamicType, .identifier("subscription.manage"), on: ["Zenbu Account, a payment retried"], [.phone],
    because: Why.scales),
  allow(
    .dynamicType, .identifier("subscription.paying-twice"), on: ["Zenbu Account, both stores"], [.phone],
    because: Why.scales),
  allow(.dynamicType, .identifier("paywall.terms"), on: ["Subscribe"], [.phone], because: Why.scales),
  allow(.dynamicType, .label("Privacy Policy"), on: ["Subscribe"], [.phone], because: Why.scales),
  allow(
    .dynamicType, .identifier("delete-account.app-store-subscription"), on: deletingAndDeleted, [.phone],
    because: Why.scales),
  allow(
    .dynamicType, .identifier("delete-account.manage-subscription"), on: deletingAndDeleted, [.phone],
    because: Why.scales),
  allow(
    .dynamicType,
    .label(
      "Zenbu syncs your profile, known words, lists, notes, photos, settings, recent lookups, watch history, and bookmarked translations after each change and when it opens. They also stay on this iPhone, and work offline."
    ),
    on: zenbuAccountNotes, [.phone], because: Why.scales),
  allow(
    .dynamicType,
    .label(
      "This iPhone keeps your known words, lists, watch history, translations, notes, and media, and Zenbu keeps working signed out."
    ),
    on: ["Delete Account"], [.phone], because: Why.scales),
  allow(
    .dynamicType,
    .labels(
      ["Included with your report"]
        + ["iPhone", "iPad"].map {
          "Sentry also adds technical details about this \($0)'s state, such as memory in use and Low Power Mode. No conversations, searches, lists, or photos are attached."
        }), on: problemReportsEditing, touch, [.standard], because: Why.scales),
  allow(.dynamicType, .label("READINGS"), on: ["Kanji Detail"], because: Why.scales),
  allow(.dynamicType, .label("Linked on-readings: ショウ, コウ, トウ, カン"), on: ["A kanji's element"], because: Why.scales),
  allow(.dynamicType, .identifier("word-detail.alternative.にっぽん"), on: ["Word Detail"], because: Why.scales),
  allow(
    .dynamicType, .identifier("word-detail.alternative.驛"), on: ["A caption's word"], touch, [.standard],
    because: Why.scales),
  allow(.textClipped, .label("Add Note"), on: ["A word's note, alone"], because: Why.scales),
  allow(.dynamicType, .labels(["1 Stroke"] + (2...17).map { "\($0) Strokes" }), on: ["Radicals"], because: Why.scales),
  allow(.dynamicType, .label("Jump to Latest"), on: ["A paused conversation"], because: Why.scales),
  allow(.textClipped, .identifiedBy(prefix: "word-detail.entry."), on: ["The word sheet"], because: Why.scales),
  allow(.textClipped, .label("MEANING"), on: ["The word sheet"], because: Why.scales),
  allow(
    .textClipped, .labels(["New List"]), on: ["Add to List"], because: Why.scales),
  allow(.textClipped, .identifiedBy(prefix: "word-list-picker.list."), on: ["Add to List"], because: Why.scales),
  allow(.textClipped, .label("japan"), on: ["Recent lookups"], because: Why.scales),
  allow(.dynamicType, .identifiedBy(prefix: "translate.pane."), on: ["Two Panes"], because: Why.scales),
  allow(
    .dynamicType, .identifier("watch.captions-unavailable"), on: ["A video without Japanese captions"],
    because: Why.scales),
  allow(
    .textClipped, .identifier("watch.captions-unavailable"), on: ["A video without Japanese captions"],
    because: Why.scales),
]

private let playerControls = [
  allow(
    .dynamicType, .label("1×"), on: ["A video", "A video without Japanese captions", "A video its owner won't share"],
    because: Why.cappedControls)
]

private let clocks = [
  allow(
    .dynamicType, .labels(["0:00 / 0:12", "0:00 / 0:00"]),
    on: ["A video", "A video without Japanese captions", "A video its owner won't share"], because: Why.clock),
  allow(.dynamicType, .label("0:12"), on: ["Player's Recent"], because: Why.clock),
]

private let previews = [
  allow(.textClipped, .identifier("translate.history.row.preview"), on: ["Translations"], because: Why.preview)
]

private let design = [
  allow(.dynamicType, .labels(["た", "食", "べる"]), on: ["A conjugated form"], because: Why.headword),
]
