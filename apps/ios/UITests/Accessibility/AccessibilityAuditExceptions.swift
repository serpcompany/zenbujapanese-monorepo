import XCTest

struct AllowedFinding {
  enum Element {
    case identifier(String)
    case identifiedBy(prefix: String)
    case label(String)
    case labels([String])
    case unnamed(Int)

    func names(_ finding: AuditFinding) -> Bool {
      switch self {
      case .identifier(let identifier): finding.identifier == identifier
      case .identifiedBy(let prefix): finding.identifier.hasPrefix(prefix)
      case .label(let label): finding.identifier.isEmpty && finding.label == label
      case .labels(let labels): finding.identifier.isEmpty && labels.contains(finding.label)
      case .unnamed: finding.elementType == nil
      }
    }

    var limit: Int? {
      if case .unnamed(let count) = self { count } else { nil }
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

  static let notRun: [AuditKind: (devices: Set<TestDevice.Kind>, reason: String)] = [
    .dynamicType: ([.pad], Why.floatingTabBar),
    .textClipped: ([.pad], Why.floatingTabBar),
  ]

  static let list =
    systemControls + linkedWords + textThatScales + playerControls + clocks + previews + design
}

private let touch: Set<TestDevice.Kind> = [.phone, .pad]
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
  static let alert =
    "The Image alert is the system's alert: the system draws its title, message, and three buttons, caps their size, and lets the alert scroll"
  static let searchField =
    "The search field is the system's and draws its own prompt; at the largest sizes the app already shortens the prompt to Search"
  static let floatingTabBar =
    "On the iPad these audits step the text size while the system's floating tab bar lays itself out, and it loops in its own layout until the app stops responding: a sample of the hung app shows its main thread in _UIFloatingTabBar's layoutSubviews, under the audit's _axAuditCheckDynamicTextSupport, with none of the app's code. The iPhone runs both on the same views, and the iPad's other audits still run at the largest size"
  static let clearButton =
    "The search field's clear button is the system's: on the iPad the field sits in the toolbar, where the system draws its clear button 20 points wide"
  static let behindSheet =
    "Text behind an open sheet, which VoiceOver rightly skips while the sheet is up. The audit can't name it"
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
  static let scrolls =
    "Text that runs past the edge of a view that scrolls, so the rest of it is a scroll away"
  static let underTheBar =
    "Text scrolled under the navigation bar's or the tab bar's glass, which still shows through it; the audit can't name it, and it is whole once scrolled into view"
  static let placedPage =
    "Text on a page the walk scrolled to: as the audit's sweep through the sizes reflows the page, text moves under the bars' glass or off the screen, and the audit can't name it. The walk puts the page at the same spot every run, so the count holds, and the screenshot at the largest size shows the text whole"
  static let cappedControls =
    "Player's control bar stays at the largest standard size at the accessibility sizes, so it keeps to one line, and pressing and holding a button shows it larger (product docs, Player)"
  static let headword =
    "A long headword shrinks one size to keep its reading beside the pitch accent, as the product docs say; at the accessibility sizes it is full size on a line of its own"
  static let largerText =
    "Image Search's Text view sets its text one size larger than the device's, so the audit sees it miss the device's size; it grows with it"
}

private let systemControls = [
  allow(.dynamicType, .identifier("frequency-detail.done"), on: ["A frequency rank's details"], because: Why.barButton),
  allow(.dynamicType, .identifier("frequency-pack.detail.done"), on: ["A frequency dictionary's details"], because: Why.barButton),
  allow(.dynamicType, .identifier("stroke-order.close"), on: ["Stroke Order"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-list-picker.done"), on: ["Add to List"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-detail.image-attachment-done"), on: ["A word's photo"], because: Why.barButton),
  allow(.dynamicType, .identifier("word-detail.image-attachment-remove"), on: ["A word's photo"], because: Why.barButton),
  allow(.dynamicType, .identifier("delete-account.cancel"), on: ["Delete Account"], [.phone, .pad], because: Why.barButton),
  allow(.dynamicType, .labels(["Image", "Then tap any word to look it up."]), on: ["Image's sources"], because: Why.alert),
  allow(.dynamicType, .unnamed(3), on: ["Image's sources"], because: Why.alert),
  allow(.elementDetection, .unnamed(3), on: ["Image's sources"], [.pad], [.standard], because: Why.alert),
  allow(.elementDetection, .unnamed(8), on: ["Image's sources"], [.pad], [.largest], because: Why.alert),
  allow(.textClipped, .label("Search"), on: ["Recent searches", "Player's Recent"], because: Why.searchField),
  allow(.textClipped, .label("Search YouTube or paste a link"), on: ["Player"], because: Why.searchField),
  allow(
    .hitRegion, .label("Clear text"),
    on: ["Search's results", "Results filtered to none", "No matches", "Discovered Words"], [.pad], [.standard],
    because: Why.clearButton),
  allow(
    .elementDetection, .unnamed(8),
    on: ["A frequency rank's details"], [.pad], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(5), on: ["Add to List"], [.pad], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(4), on: ["A word's photo"], [.pad], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(3), on: ["Handwriting", "Radicals"], [.pad], because: Why.behindSheet),
  allow(
    .elementDetection, .unnamed(9), on: ["A frequency dictionary's details"], [.pad], [.standard],
    because: Why.behindSheet),
  allow(
    .elementDetection, .unnamed(4), on: ["A frequency dictionary's details"], [.pad], [.largest],
    because: Why.behindSheet),
  allow(.elementDetection, .unnamed(7), on: ["Stroke Order"], [.pad], [.standard], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(2), on: ["Stroke Order"], [.pad], [.largest], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(8), on: ["Sign In"], [.pad], [.standard], because: Why.behindSheet),
  allow(.elementDetection, .unnamed(7), on: ["Delete Account"], [.pad], [.standard], because: Why.behindSheet),
]

private let linkedWords = [
  allow(.hitRegion, .identifiedBy(prefix: "translate.pane.ja."), on: ["Two Panes"], because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "translate.sentence."),
    on: ["A paused conversation", "A saved conversation", "Listening, paused"], because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "translate.typed.result."), on: ["A typed translation", "The word sheet"],
    because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "watch.cue."),
    on: ["A video", "A caption's word", "A video its owner won't share"], because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "image-text.line."), on: ["Image Search"], because: Why.inlineWord),
  allow(.hitRegion, .identifiedBy(prefix: "image-text.paragraph."), on: ["Image Search's text"], because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "conjugations.example-token."), on: ["A conjugated form"],
    because: Why.inlineWord),
  allow(
    .hitRegion, .identifiedBy(prefix: "word-detail.example-token."), on: ["Word Detail", "A word's note"],
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
  allow(.dynamicType, .labels(["Translations", "0"]), on: ["Account", "Account, at its end"], because: Why.scales),
  allow(
    .textClipped,
    .labels(["Translations", "Sign In to Sync", "Known words, lists, watch history, and bookmarks, on all your devices"]),
    on: ["Account", "Account, at its end", "Account, its rows"], because: Why.scales),
  allow(
    .dynamicType,
    .label("Signing out keeps your known words, lists, watch history, translations, notes, and media on this iPhone."),
    on: ["Zenbu Account"], [.phone], because: Why.scales),
  allow(.dynamicType, .label("READINGS"), on: ["Kanji Detail"], because: Why.scales),
  allow(.dynamicType, .label("Linked on-readings: ショウ, コウ, トウ, カン"), on: ["A kanji's element"], because: Why.scales),
  allow(.dynamicType, .identifier("word-detail.alternative.にっぽん"), on: ["Word Detail"], because: Why.scales),
  allow(.dynamicType, .labels(["Add Note", "Add to List"]), on: ["Word Detail"], because: Why.scales),
  allow(
    .textClipped, .labels(["Add Note", "Add to List"]), on: ["A word's note", "Word Detail, its kanji"],
    because: Why.scales),
  allow(.dynamicType, .identifiedBy(prefix: "radical.stroke."), on: ["Radicals"], because: Why.scales),
  allow(.dynamicType, .label("Jump to Latest"), on: ["A paused conversation"], because: Why.scales),
  allow(
    .dynamicType, .identifiedBy(prefix: "word-detail.entry."), on: ["The word sheet", "A caption's word"],
    because: Why.scales),
  allow(
    .textClipped, .identifiedBy(prefix: "word-detail.entry."), on: ["The word sheet", "A caption's word"],
    because: Why.scales),
  allow(.dynamicType, .label("MEANING"), on: ["The word sheet", "A caption's word"], because: Why.scales),
  allow(.textClipped, .label("MEANING"), on: ["The word sheet", "A caption's word"], because: Why.scales),
  allow(.textClipped, .unnamed(1), on: ["A caption's word"], because: Why.scrolls),
  allow(
    .textClipped, .labels(["New List"]), on: ["Add to List"], because: Why.scales),
  allow(.textClipped, .identifiedBy(prefix: "word-list-picker.list."), on: ["Add to List"], because: Why.scales),
  allow(.textClipped, .label("japan"), on: ["Recent searches"], because: Why.scales),
  allow(.dynamicType, .identifiedBy(prefix: "translate.pane."), on: ["Two Panes"], because: Why.scales),
  allow(
    .dynamicType, .identifier("watch.captions-unavailable"), on: ["A video without Japanese captions"],
    because: Why.scales),
  allow(
    .textClipped, .identifier("watch.captions-unavailable"), on: ["A video without Japanese captions"],
    because: Why.scales),
  allow(
    .dynamicType, .labels(["Video Unavailable", "The video's owner doesn't allow it to play in other apps."]),
    on: ["A video its owner won't share"], because: Why.scales),
  allow(
    .textClipped, .label("The video's owner doesn't allow it to play in other apps."),
    on: ["A video its owner won't share"], because: Why.scales),
  allow(.textClipped, .unnamed(2), on: ["A video its owner won't share"], because: Why.underTheBar),
  allow(.dynamicType, .unnamed(10), on: ["Word Detail, its kanji"], because: Why.placedPage),
  allow(.dynamicType, .unnamed(2), on: ["A word's note"], touch, [.standard], because: Why.placedPage),
  allow(.dynamicType, .unnamed(6), on: ["A word's note"], touch, [.largest], because: Why.placedPage),
  allow(.textClipped, .unnamed(3), on: ["Kanji Detail, its readings"], touch, [.largest], because: Why.placedPage),
]

private let videoScreens = [
  "A video", "A caption's word", "A video without Japanese captions", "A video its owner won't share",
]

private let playerControls =
  ["watch.previous", "watch.play-pause", "watch.next", "watch.repeat", "watch.speed"].map { control in
    allow(.dynamicType, .identifier(control), on: videoScreens, because: Why.cappedControls)
  } + [allow(.dynamicType, .label("1×"), on: videoScreens, because: Why.cappedControls)]

private let clocks = [
  allow(
    .dynamicType, .labels(["0:00 / 0:12", "0:00 / 0:00"]),
    on: ["A video", "A video without Japanese captions", "A video its owner won't share"], because: Why.clock),
  allow(.dynamicType, .label("0:12"), on: ["Player's Recent"], because: Why.clock),
  allow(.dynamicType, .identifiedBy(prefix: "translate.still-there"), on: ["The silence prompt"], because: Why.clock),
  allow(.textClipped, .identifiedBy(prefix: "translate.still-there"), on: ["The silence prompt"], because: Why.clock),
  allow(.textClipped, .unnamed(4), on: ["The silence prompt"], because: Why.scrolls),
]

private let previews = [
  allow(.textClipped, .identifier("translate.history.row.preview"), on: ["Translations"], because: Why.preview)
]

private let design = [
  allow(.dynamicType, .labels(["た", "食", "べる"]), on: ["A conjugated form"], because: Why.headword),
  allow(
    .dynamicType,
    .labels(["えき", "く", "ちか", "の", "ほんや", "まいあさ", "みます", "本屋", "毎朝", "近", "飲", "駅"]),
    on: ["Image Search's text"], because: Why.largerText),
]
