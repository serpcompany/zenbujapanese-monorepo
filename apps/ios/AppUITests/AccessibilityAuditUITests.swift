import UIKit
import XCTest

private struct AuditException: CustomStringConvertible {
  let auditType: XCUIAccessibilityAuditType
  let identifier: String

  init(_ auditType: XCUIAccessibilityAuditType, identifier: String) {
    self.auditType = auditType
    self.identifier = identifier
  }

  @MainActor
  func matches(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
    guard issue.auditType == auditType else { return false }
    return issue.element?.identifier == identifier
  }

  var description: String {
    "\(auditType.rawValue):\(identifier)"
  }
}

final class AccessibilityAuditUITests: XCTestCase {
  @MainActor
  func testYouHierarchyRemainsReachableAtLargestAccessibilityTextSize() throws {
    let app = launchApp(
      appearance: .light,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    XCTAssertTrue(app.tabBars.buttons["tab.you"].waitForExistence(timeout: 3))
    app.tabBars.buttons["tab.you"].tap()

    let list = app.collectionViews["you.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Your Content"].exists)
    XCTAssertTrue(app.staticTexts["Preferences"].exists)
    XCTAssertTrue(app.buttons["you.media-library"].isHittable)
    let readingAids = app.buttons["you.reading-aids"]
    XCTAssertTrue(readingAids.exists)
    XCTAssertTrue(readingAids.isHittable)
    XCTAssertTrue(readingAids.label.contains("Reading Aids"))

    let frequencyDictionaries = app.buttons["you.frequency-dictionaries"]
    for _ in 0..<4 where !frequencyDictionaries.isHittable {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(frequencyDictionaries.isHittable)
    let japaneseAnalysis = app.buttons["you.japanese-analysis"]
    for _ in 0..<4 where !japaneseAnalysis.isHittable {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(japaneseAnalysis.isHittable)

    let credits = app.buttons["you.credits"]
    for _ in 0..<4 where !credits.isHittable {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(credits.isHittable)
    XCTAssertGreaterThanOrEqual(credits.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(credits.frame.maxX, app.frame.maxX)
    retainScreenshot(named: "You hierarchy at Accessibility XXXL")
  }

  @MainActor
  func testJapaneseTextAnalysisManagementRemainsReachableAtLargestAccessibilityTextSize() throws {
    let app = launchApp(
      appearance: .light,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    XCTAssertTrue(app.tabBars.buttons["tab.you"].waitForExistence(timeout: 3))
    app.tabBars.buttons["tab.you"].tap()
    let destination = app.buttons["you.japanese-analysis"]
    XCTAssertTrue(destination.waitForExistence(timeout: 3))
    destination.tap()
    let list = app.collectionViews["language-technology-packs.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 3))
    let availability = app.staticTexts["Availability, Included with Zenbu"]
    for _ in 0..<8 where !availability.exists {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(availability.exists)
    let offline = app.staticTexts["Offline use, Works Offline"]
    for _ in 0..<8 where !offline.exists {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(offline.exists)
    let contribution = app.staticTexts["Installed contribution, 217.5 MB"]
    for _ in 0..<8 where !contribution.exists {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(contribution.exists)
    XCTAssertFalse(app.buttons["language-technology-pack.download.sudachi-core-ja-20260723"].exists)
    XCTAssertFalse(app.buttons["language-technology-pack.remove.sudachi-core-ja-20260723"].exists)
  }

  @MainActor
  func testLongWordIdentityUsesSecondaryReadingAtLargestAccessibilityTextSize() throws {
    try verifyLongWordIdentityAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testLongPartOfSpeechRemainsCompleteAtDefaultTextSize() throws {
    let expected = "Godan Verb · Auxiliary Verb · Intransitive Verb · Transitive Verb"
    let (app, detail) = try launchWordDetail(
      query: "仕る",
      resultLabelPrefix: "仕る, つかまつる",
      appearance: .light
    )
    let conjugations = app.buttons["word-detail.conjugations"]
    for _ in 0..<4 where !conjugations.exists || !conjugations.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(conjugations.isHittable)
    let partOfSpeech = app.staticTexts[
      "word-detail.entry.7a719ec3441746ac068296d7b42321e3"
    ]
    XCTAssertTrue(partOfSpeech.exists)
    XCTAssertEqual(partOfSpeech.label, expected)
    XCTAssertGreaterThan(partOfSpeech.frame.height, 0)
    XCTAssertGreaterThanOrEqual(partOfSpeech.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(partOfSpeech.frame.maxX, app.frame.maxX)
    XCTAssertTrue(app.staticTexts["View Conjugations"].exists)
    retainElementScreenshot(conjugations, named: "Long part of speech default size")
  }

  @MainActor
  func testInlineWordDetailCurrentEntryUsesSystemAccentAndSemanticEmphasis() throws {
    try verifyInlineWordDetailCurrentEntry(
      appearance: .light,
      accessibilityXXXL: false
    )
  }

  @MainActor
  func testInlineWordDetailCurrentEntryAppearanceAndSizeMatrix() throws {
    for appearance in [XCUIDevice.Appearance.light, .dark] {
      for accessibilityXXXL in [false, true] {
        if appearance == .light, !accessibilityXXXL { continue }
        try verifyInlineWordDetailCurrentEntry(
          appearance: appearance,
          accessibilityXXXL: accessibilityXXXL
        )
      }
    }
  }

  @MainActor
  func testInlineWordDetailOtherLinkedWordRetainsPrimaryTextTreatment() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: .light)
    try submitSearch("見る", in: app)
    let primaryResult = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(primaryResult.waitForExistence(timeout: 3))
    primaryResult.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    let currentToken = app.buttons["word-detail.example-token.0.0.見る"]
    for _ in 0..<12 where !currentToken.exists || !currentToken.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    let otherLinkedToken = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "word-detail.example-token.0.",
        "明らか, あきらか"
      )
    ).firstMatch
    XCTAssertTrue(currentToken.waitForExistence(timeout: 3))
    XCTAssertTrue(otherLinkedToken.waitForExistence(timeout: 3))
    XCTAssertTrue(containsSystemBluePixels(in: currentToken.screenshot()))
    XCTAssertFalse(containsSystemBluePixels(in: otherLinkedToken.screenshot()))
    XCTAssertEqual(otherLinkedToken.value as? String, "")
    XCTAssertFalse(otherLinkedToken.isSelected)
    retainElementScreenshot(currentToken, named: "Current 見る token")
    retainElementScreenshot(otherLinkedToken, named: "Neutral 明らか token")
  }

  @MainActor
  func testRelatedWordUsesNeutralTextAndPreservesNativeNavigation() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let (app, detail) = try launchWordDetail(
      query: "見る",
      resultLabelPrefix: "見る, みる",
      appearance: .light
    )
    let related = app.buttons["word-detail.related.見える"]
    for _ in 0..<12 where !related.exists || !related.isHittable {
      detail.swipeUp(velocity: .slow)
    }

    XCTAssertTrue(related.waitForExistence(timeout: 3))
    XCTAssertTrue(related.isHittable)
    XCTAssertGreaterThanOrEqual(related.frame.height, 44)
    XCTAssertGreaterThanOrEqual(related.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(related.frame.maxX, app.frame.maxX)
    XCTAssertEqual(
      related.label,
      "見える  みえる, Related intransitive verb · to be seen, to be visible, to be in sight"
    )
    let primary = app.staticTexts["word-detail.related-primary.見える"]
    let support = app.staticTexts["word-detail.related-support.見える"]
    XCTAssertTrue(primary.exists)
    XCTAssertTrue(support.exists)
    XCTAssertLessThan(primary.frame.maxY, support.frame.minY)
    XCTAssertTrue(containsSystemPrimaryTextPixels(in: primary.screenshot(), appearance: .light))
    XCTAssertTrue(containsSystemSecondaryTextPixels(in: support.screenshot(), appearance: .light))
    XCTAssertFalse(containsSystemPrimaryTextPixels(in: support.screenshot(), appearance: .light))
    XCTAssertFalse(
      containsSystemBluePixels(in: related.screenshot()),
      "Related Word content should use system-primary and system-secondary text, not action tint."
    )
    retainElementScreenshot(related, named: "Neutral Related Word row")

    related.tap()
    let relatedDetail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(relatedDetail.waitForExistence(timeout: 3))
    let relatedNavigation = app.navigationBars["見える"]
    guard relatedNavigation.waitForExistence(timeout: 3) else {
      return XCTFail("Related Word should open the matching Word Detail destination.")
    }
    relatedNavigation.buttons.firstMatch.tap()
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    XCTAssertTrue(related.waitForExistence(timeout: 3))
  }

  @MainActor
  func testRelatedWordRemainsNeutralInDarkAppearance() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let (app, detail) = try launchWordDetail(
      query: "見る",
      resultLabelPrefix: "見る, みる",
      appearance: .dark
    )
    let related = app.buttons["word-detail.related.見える"]
    for _ in 0..<12 where !related.exists || !related.isHittable {
      detail.swipeUp(velocity: .slow)
    }

    XCTAssertTrue(related.waitForExistence(timeout: 3))
    XCTAssertTrue(related.isHittable)
    XCTAssertGreaterThanOrEqual(related.frame.height, 44)
    let primary = app.staticTexts["word-detail.related-primary.見える"]
    let support = app.staticTexts["word-detail.related-support.見える"]
    XCTAssertTrue(primary.exists)
    XCTAssertTrue(support.exists)
    XCTAssertTrue(containsSystemPrimaryTextPixels(in: primary.screenshot(), appearance: .dark))
    XCTAssertTrue(containsSystemSecondaryTextPixels(in: support.screenshot(), appearance: .dark))
    XCTAssertFalse(containsSystemPrimaryTextPixels(in: support.screenshot(), appearance: .dark))
    XCTAssertFalse(containsSystemBluePixels(in: related.screenshot()))
    retainElementScreenshot(related, named: "Neutral Related Word row - dark")
  }

  @MainActor
  func testInlineWordDetailAmbiguousCandidateRemainsNeutralAndSelectable() throws {
    let (app, detail) = try launchWordDetail(
      query: "見る",
      resultLabelPrefix: "見る, みる",
      appearance: .light
    )
    let row = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "見ることは信ずることなり。, Seeing is believing.")
    ).firstMatch
    for _ in 0..<12 where !row.exists || !row.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(row.waitForExistence(timeout: 3))
    let candidate = row.descendants(matching: .button).matching(
      NSPredicate(format: "label == %@", "こと, choose dictionary entry")
    ).firstMatch

    XCTAssertTrue(candidate.waitForExistence(timeout: 3))
    XCTAssertTrue(candidate.isHittable)
    XCTAssertEqual(candidate.value as? String, "")
    XCTAssertFalse(candidate.isSelected)
    XCTAssertTrue(candidate.label.hasPrefix("こと"))
    XCTAssertFalse(
      containsSystemBluePixels(in: candidate.screenshot()),
      "An unresolved candidate is sentence content, so it should stay neutral until selected."
    )
    retainElementScreenshot(candidate, named: "Neutral ambiguous sentence token")

    candidate.tap()
    let choice = app.buttons["こと (こと) — particle indicating a command"]
    XCTAssertTrue(choice.waitForExistence(timeout: 3))
    choice.tap()
    XCTAssertTrue(app.descendants(matching: .any)["ruby.こと.こと"].waitForExistence(timeout: 3))
    let back = app.navigationBars.buttons.firstMatch
    XCTAssertTrue(back.waitForExistence(timeout: 3))
    back.tap()
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    RepresentativeExampleSentences.reachElement(candidate, in: detail, app: app)
    XCTAssertTrue(candidate.isHittable)
  }

  @MainActor
  func testReducedInlineAnalysisDoesNotAccentAnySentenceText() throws {
    let (app, detail) = try launchWordDetail(
      query: "問題",
      resultLabelPrefix: "問題, もんだい",
      appearance: .light,
      additionalArguments: [
        "-ResetLanguageTechnologyPacks", "-UseReducedJapaneseAnalysis",
      ]
    )
    let firstToken = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "word-detail.example-token.")
    ).firstMatch
    for _ in 0..<12 where !firstToken.exists || !firstToken.isHittable {
      detail.swipeUp(velocity: .slow)
    }

    XCTAssertTrue(app.staticTexts["word-detail.reduced-analysis"].exists)
    XCTAssertTrue(firstToken.waitForExistence(timeout: 3))
    XCTAssertEqual(firstToken.value as? String, "")
    XCTAssertFalse(firstToken.isSelected)
    XCTAssertFalse(containsSystemBluePixels(in: firstToken.screenshot()))
    XCTAssertEqual(
      app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH %@", "word-detail.example-token.")
      ).count,
      0
    )
    retainElementScreenshot(firstToken, named: "Neutral reduced-analysis sentence")
  }

  @MainActor
  func testMultipleCurrentEntryOccurrencesAreTheOnlyAccentedSentenceTokens() throws {
    let (app, detail) = try launchWordDetail(
      query: "来る",
      resultLabelPrefix: "来る, くる, to come",
      appearance: .light
    )
    let row = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "来る日も来る日も雨だった。, It rained day after day.")
    ).firstMatch
    for _ in 0..<20 where !row.exists || !row.isHittable {
      detail.swipeUp(velocity: .fast)
    }
    XCTAssertTrue(row.waitForExistence(timeout: 3))
    let currentOccurrences = row.descendants(matching: .button).matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@ AND value == %@",
        "word-detail.example-token.",
        "来る, くる",
        "Current word"
      )
    )

    XCTAssertEqual(currentOccurrences.count, 2)
    for occurrence in currentOccurrences.allElementsBoundByIndex {
      XCTAssertEqual(occurrence.value as? String, "Current word")
      XCTAssertTrue(occurrence.isSelected)
      XCTAssertTrue(containsSystemBluePixels(in: occurrence.screenshot()))
    }
    let otherTokens = row.descendants(matching: .any).matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND value != %@",
        "word-detail.example-token.",
        "Current word"
      )
    )
    XCTAssertGreaterThan(otherTokens.count, 0)
    for token in otherTokens.allElementsBoundByIndex {
      XCTAssertNotEqual(token.value as? String, "Current word")
      XCTAssertFalse(token.isSelected)
      XCTAssertFalse(containsSystemBluePixels(in: token.screenshot()))
    }
    retainElementScreenshot(
      row,
      named: "Two current-word occurrences with neutral surrounding tokens"
    )
  }

  @MainActor
  func testFullAnalysisKeepsNoCurrentAndLongMixedScriptSentencesSelective() throws {
    let (app, detail) = try launchWordDetail(
      query: "見る",
      resultLabelPrefix: "見る, みる",
      appearance: .light,
      additionalArguments: ["-Issue246WordDetailExampleFixtures"]
    )

    let noCurrentRow = app.descendants(matching: .any).matching(
      NSPredicate(
        format: "label == %@",
        "水は見る見るうちに橋げたのところまで達した。, The water came up to the bridge girder in a second."
      )
    ).firstMatch
    for _ in 0..<12 where !noCurrentRow.exists || !noCurrentRow.isHittable {
      detail.swipeUp(velocity: .fast)
    }
    XCTAssertTrue(noCurrentRow.waitForExistence(timeout: 3))
    let noCurrentTokens = noCurrentRow.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "word-detail.example-token.")
    ).allElementsBoundByIndex
    XCTAssertGreaterThan(noCurrentTokens.count, 1)
    XCTAssertGreaterThan(noCurrentTokens.filter { $0.elementType == .button }.count, 0)
    for token in noCurrentTokens {
      XCTAssertNotEqual(token.value as? String, "Current word")
      XCTAssertFalse(token.isSelected)
      XCTAssertFalse(containsSystemBluePixels(in: token.screenshot()))
    }
    retainElementScreenshot(noCurrentRow, named: "Full-analysis sentence without current entry")

    let longRow = app.descendants(matching: .any).matching(
      NSPredicate(
        format: "label == %@",
        "REM睡眠中の脳波は起きている時と同じ脳波であり、夢を見るステージです。, The brain waves during REM sleep are the same as when awake, and it's the stage when you have dreams."
      )
    ).firstMatch
    for _ in 0..<4 where !longRow.exists || !longRow.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(longRow.waitForExistence(timeout: 3))
    let longTokens = longRow.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "word-detail.example-token.")
    ).allElementsBoundByIndex
    let current = longTokens.filter { $0.value as? String == "Current word" }
    XCTAssertEqual(current.count, 1)
    guard let currentToken = current.first else { return }
    XCTAssertTrue(currentToken.isSelected)
    XCTAssertTrue(containsSystemBluePixels(in: currentToken.screenshot()))
    for token in longTokens where token.value as? String != "Current word" {
      XCTAssertFalse(token.isSelected)
      XCTAssertFalse(containsSystemBluePixels(in: token.screenshot()))
    }
    for token in longTokens {
      XCTAssertGreaterThan(token.frame.width, 0)
      XCTAssertGreaterThan(token.frame.height, 0)
      XCTAssertGreaterThanOrEqual(token.frame.minX, app.frame.minX)
      XCTAssertLessThanOrEqual(token.frame.maxX, app.frame.maxX)
    }
    retainElementScreenshot(longRow, named: "Selective current word in long mixed-script sentence")
  }

  @MainActor
  func testInlineWordDetailInflectedSurfaceUsesCanonicalCurrentEntryPresentation() throws {
    let (app, detail) = try launchWordDetail(
      query: "食べる",
      resultLabelPrefix: "食べる, たべる",
      appearance: .light
    )
    let inflectedToken = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "word-detail.example-token.20.",
        "食べ, たべる"
      )
    ).firstMatch
    for _ in 0..<32 where !inflectedToken.exists || !inflectedToken.isHittable {
      detail.swipeUp(velocity: .fast)
    }
    XCTAssertTrue(inflectedToken.waitForExistence(timeout: 3))
    XCTAssertEqual(inflectedToken.value as? String, "Current word")
    XCTAssertTrue(inflectedToken.isSelected)
    XCTAssertTrue(containsSystemBluePixels(in: inflectedToken.screenshot()))
    XCTAssertGreaterThanOrEqual(inflectedToken.frame.width, 44)
    XCTAssertGreaterThanOrEqual(inflectedToken.frame.height, 44)
    retainElementScreenshot(inflectedToken, named: "Inflected current 食べ token")
  }

  @MainActor
  func testInlineWordDetailAlternateWrittenFormUsesCurrentEntryPresentation() throws {
    let (app, detail) = try launchWordDetail(
      query: "○",
      resultLabelPrefix: "○, まる",
      appearance: .light
    )
    let alternateToken = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "word-detail.example-token.2.",
        "〇, まる"
      )
    ).firstMatch
    for _ in 0..<12 where !alternateToken.exists || !alternateToken.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(alternateToken.waitForExistence(timeout: 3))
    XCTAssertEqual(alternateToken.value as? String, "Current word")
    XCTAssertTrue(alternateToken.isSelected)
    XCTAssertTrue(containsSystemBluePixels(in: alternateToken.screenshot()))
    XCTAssertGreaterThanOrEqual(alternateToken.frame.width, 44)
    XCTAssertGreaterThanOrEqual(alternateToken.frame.height, 44)
    retainElementScreenshot(alternateToken, named: "Alternate current 〇 token")
  }

  @MainActor
  private func verifyInlineWordDetailCurrentEntry(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: accessibilityXXXL
        ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        : []
    )
    try submitSearch("いる", in: app)
    let primaryResult = app.buttons.matching(
      NSPredicate(format: "value BEGINSWITH %@", "Best match 1")
    ).firstMatch
    XCTAssertTrue(primaryResult.waitForExistence(timeout: 3))
    primaryResult.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    let currentToken = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "word-detail.example-token.",
        "要る, いる"
      )
    ).firstMatch
    for _ in 0..<12 where !currentToken.exists || !currentToken.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(currentToken.waitForExistence(timeout: 3))
    XCTAssertTrue(currentToken.isHittable)
    XCTAssertGreaterThanOrEqual(currentToken.frame.width, 44)
    XCTAssertGreaterThanOrEqual(currentToken.frame.height, 44)
    XCTAssertEqual(currentToken.value as? String, "Current word")
    XCTAssertTrue(currentToken.isSelected)
    XCTAssertTrue(
      containsSystemBluePixels(in: currentToken.screenshot()),
      "Only the current app-owned entry token should use the system accent."
    )
    retainElementScreenshot(
      currentToken,
      named:
        "Current 要る token - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")"
    )

  }

  @MainActor
  func testActiveFrequencyDictionaryUsesSystemSelectionSemantics() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .light,
      additionalArguments: ["-ResetFrequencyPacks"]
    )
    XCTAssertTrue(app.tabBars.buttons["tab.you"].waitForExistence(timeout: 3))
    app.tabBars.buttons["tab.you"].tap()
    app.buttons["you.frequency-dictionaries"].tap()

    let activeStatus = app.descendants(matching: .any)[
      "frequency-pack.status.zenbu.tubelex.youtube.ja.unidic-3.1"
    ]
    XCTAssertTrue(activeStatus.waitForExistence(timeout: 3))
    XCTAssertEqual(activeStatus.label, "Status, Active")
    XCTAssertEqual(activeStatus.value as? String, "Selected frequency dictionary")
    XCTAssertTrue(
      containsSystemBluePixels(in: activeStatus.screenshot()),
      "An active frequency dictionary is a current selection and must use the system accent."
    )
  }

  @MainActor
  func testFrequencyDownloadFailureUsesErrorSemanticsAndKeepsRetryOrdinary() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .light,
      additionalArguments: ["-ResetFrequencyPacks", "-FrequencyPackChecksumFailure"]
    )
    app.tabBars.buttons["tab.you"].tap()
    app.buttons["you.frequency-dictionaries"].tap()
    let list = app.collectionViews["frequency-packs.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 3))
    let download = app.buttons[
      "frequency-pack.download.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    for _ in 0..<8 where !download.isHittable { list.swipeUp() }
    XCTAssertTrue(download.isHittable)
    download.tap()

    let failure = app.descendants(matching: .any)[
      "frequency-pack.failure.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertTrue(failure.waitForExistence(timeout: 4))
    XCTAssertEqual(failure.label, "Download failed")
    XCTAssertEqual(failure.value as? String, "Downloaded file failed checksum validation.")
    XCTAssertTrue(
      containsRedPixels(in: failure.screenshot()),
      "A serious validation failure must use the system error color in addition to text and icon."
    )

    let retry = app.buttons[
      "frequency-pack.download.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertEqual(retry.label, "Retry")
    XCTAssertFalse(
      containsRedPixels(in: retry.screenshot()),
      "Retry is an ordinary recovery action and must retain the system accent."
    )
  }

  @MainActor
  func testVerifiedFrequencyDownloadBecomesNeutralInstalledChoice() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .light,
      additionalArguments: ["-ResetFrequencyPacks"]
    )
    app.tabBars.buttons["tab.you"].tap()
    app.buttons["you.frequency-dictionaries"].tap()
    let list = app.collectionViews["frequency-packs.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 3))
    let download = app.buttons[
      "frequency-pack.download.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    for _ in 0..<8 where !download.isHittable { list.swipeUp() }
    XCTAssertTrue(download.isHittable)
    download.tap()

    let verified = app.descendants(matching: .any)[
      "frequency-pack.verified.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertTrue(verified.waitForExistence(timeout: 90))
    XCTAssertEqual(verified.label, "Verified")
    XCTAssertEqual(verified.value as? String, "Download and checksum verified")
    XCTAssertTrue(
      containsGreenPixels(in: verified.screenshot()),
      "Verified completion must use system green in addition to its label and symbol."
    )

    let installed = app.descendants(matching: .any)[
      "frequency-pack.status.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertEqual(installed.label, "Status, Installed")
    XCTAssertEqual(installed.value as? String, "Not selected")

    let use = app.buttons[
      "frequency-pack.activate.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertTrue(use.isHittable)
    XCTAssertEqual(use.label, "Use This Dictionary")
    XCTAssertTrue(containsSystemBluePixels(in: use.screenshot()))
    XCTAssertFalse(containsRedPixels(in: use.screenshot()))

    let remove = app.buttons[
      "frequency-pack.remove.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertTrue(remove.isHittable)
    XCTAssertEqual(remove.label, "Remove Pack")
    XCTAssertTrue(containsRedPixels(in: remove.screenshot()))
    remove.tap()
    XCTAssertTrue(verified.waitForNonExistence(timeout: 3))

    let available = app.descendants(matching: .any)[
      "frequency-pack.status.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    XCTAssertTrue(available.waitForExistence(timeout: 3))
    XCTAssertEqual(available.label, "Status, Available")
    XCTAssertEqual(available.value as? String, "Not installed")
  }

  @MainActor
  func testOrdinaryActionsDoNotShareTheSystemDestructiveColor() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    var app = launchApp(appearance: .light, additionalArguments: ["-ResetRecentSearches"])
    let searchTab = app.tabBars.buttons["Search"]
    XCTAssertTrue(searchTab.waitForExistence(timeout: 3))
    XCTAssertFalse(
      containsRedPixels(in: searchTab.screenshot()),
      "An ordinary selected tab must not share the system destructive color."
    )

    try submitSearch("日本", in: app)
    app.terminate()
    app = launchApp(appearance: .light)
    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    recentSearch.swipeLeft()
    let delete = app.buttons["Delete"]
    XCTAssertTrue(delete.waitForExistence(timeout: 3))
    XCTAssertTrue(
      containsRedPixels(in: delete.screenshot()),
      "A destructive Delete action must retain the system destructive color."
    )
    app.terminate()

    try stageImageTextFixture(appearance: .light)
    app = launchApp(
      appearance: .light,
      additionalArguments: [
        "-StartImageTextFixtures", "fixture-clear-horizontal.png",
      ]
    )
    let translate = app.buttons["image-text.translate"]
    XCTAssertTrue(translate.waitForExistence(timeout: 20))
    XCTAssertFalse(
      containsRedPixels(in: translate.screenshot()),
      "Translate is an ordinary prominent action and must use the system accent."
    )
    let close = app.buttons["image-text.close"]
    XCTAssertTrue(close.isHittable)
    XCTAssertFalse(
      containsRedPixels(in: close.screenshot()),
      "Close is an ordinary cancellation action and must use the system accent."
    )
  }

  @MainActor
  func testStrokeOrderStepActionsUseDirectionalSymbols() throws {
    let app = launchApp(appearance: .light)
    try submitSearch("山", in: app)
    let mountain = app.buttons["result.kanji-primary.山"]
    XCTAssertTrue(mountain.waitForExistence(timeout: 4))
    mountain.tap()
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 4))
    strokeOrder.tap()

    let next = app.buttons["stroke-order.next"]
    XCTAssertTrue(next.waitForExistence(timeout: 3))
    XCTAssertTrue(next.isHittable)
    XCTAssertLessThan(
      foregroundPixelFraction(in: next.screenshot()),
      0.34,
      "A one-step action needs a directional stroke symbol, not a filled skip-to-end media glyph."
    )
    next.tap()
    let previous = app.buttons["stroke-order.previous"]
    XCTAssertTrue(previous.isEnabled)
    previous.tap()
    XCTAssertEqual(app.descendants(matching: .any)["stroke-order.progress"].label, "Stroke 1 of 3")
  }

  @MainActor
  func testLightRepresentativeExampleSentenceLayoutsRemainReadableAndOperable() throws {
    try auditRepresentativeExampleSentences(appearance: .light, accessibilityXXXL: false)
  }

  @MainActor
  func testSharedReadingAidSentenceLayoutWrapsNaturallyAtLargestAccessibilityTextSize() throws {
    defer {
      let cleanup = launchApp(
        appearance: .light,
        additionalArguments: ["-ResetReadingAidPreferences"]
      )
      cleanup.terminate()
    }
    let app = launchApp(
      appearance: .dark,
      additionalArguments: [
        "-ResetReadingAidPreferences",
        "-Issue246WordDetailExampleFixtures",
        "-UIPreferredContentSizeCategoryName",
        "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    app.tabBars.buttons["tab.you"].tap()
    app.buttons["you.reading-aids"].tap()
    let showRomaji = app.switches["reading-aids.show-romaji"]
    XCTAssertTrue(showRomaji.waitForExistence(timeout: 3))
    showRomaji.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    let romajiEnabled = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "1"),
      object: showRomaji
    )
    XCTAssertEqual(XCTWaiter.wait(for: [romajiEnabled], timeout: 2), .completed)
    app.tabBars.buttons["Search"].tap()
    try submitSearch("見る", in: app)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    let prefix = "word-detail.example-token.0."
    let first = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", prefix)
    ).firstMatch
    RepresentativeExampleSentences.reachElement(first, in: detail, app: app)
    let tokens = RepresentativeExampleSentences.orderedTokens(prefix: prefix, in: app)
    XCTAssertEqual(
      RepresentativeExampleSentences.reconstructedSentence(from: tokens, prefix: prefix),
      "水は見る見るうちに橋げたのところまで達した。"
    )
    let visualLines = Dictionary(grouping: tokens) { Int($0.frame.maxY.rounded()) }
    XCTAssertLessThan(
      visualLines.count,
      tokens.count,
      "Largest text must retain natural multi-token Japanese lines instead of one token per row"
    )
    for token in tokens {
      XCTAssertGreaterThanOrEqual(token.frame.minX, detail.frame.minX)
      XCTAssertLessThanOrEqual(token.frame.maxX, detail.frame.maxX)
    }
    let terminalPunctuation = try XCTUnwrap(tokens.last)
    let precedingToken = try XCTUnwrap(tokens.dropLast().last)
    XCTAssertEqual(
      terminalPunctuation.frame.maxY,
      precedingToken.frame.maxY,
      accuracy: 1,
      "Japanese terminal punctuation must wrap with the preceding token"
    )
    let romaji = app.descendants(matching: .any)["word-detail.example-token.0.romaji"]
    XCTAssertTrue(romaji.exists)
    XCTAssertTrue(romaji.label.hasPrefix("Romaji, "))
    let english = app.staticTexts["word-detail.example-english.0"]
    XCTAssertTrue(english.exists)
    XCTAssertGreaterThanOrEqual(romaji.frame.minX, detail.frame.minX)
    XCTAssertLessThanOrEqual(romaji.frame.maxX, detail.frame.maxX)
    XCTAssertGreaterThan(english.frame.minY, romaji.frame.maxY)
    try performAudit(
      in: app,
      named: "Shared Reading Aid sentence layout - dark accessibility XXXL",
      types: .dynamicType.union(.textClipped).union(.hitRegion)
    )
  }

  @MainActor
  func testSharedFuriganaSentenceLayoutKeepsExactInlineHitRegionInventory() throws {
    let (app, detail) = try launchWordDetail(
      query: "taberu",
      resultLabelPrefix: "食べる, たべる",
      appearance: .light,
      additionalArguments: ["-Issue253SentenceLayoutFixtures"]
    )
    let firstToken = app.descendants(matching: .any).matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@",
        "word-detail.example-token.0."
      )
    ).firstMatch
    RepresentativeExampleSentences.reachElement(firstToken, in: detail, app: app)
    retainScreenshot(named: "Shared Furigana sentence layout - exact hit regions")
    try app.performAccessibilityAudit(for: .hitRegion)
  }

  @MainActor
  func testDarkRepresentativeExampleSentenceLayoutsRemainReadableAndOperableAtAccessibilityXXXL()
    throws
  {
    try auditRepresentativeExampleSentences(appearance: .dark, accessibilityXXXL: true)
  }

  @MainActor
  func testDarkRepresentativeExampleSentenceLayoutsRemainReadableAndOperableAtDefaultSize()
    throws
  {
    try auditRepresentativeExampleSentences(appearance: .dark, accessibilityXXXL: false)
  }

  @MainActor
  func testLightRepresentativeExampleSentenceLayoutsRemainReadableAndOperableAtAccessibilityXXXL()
    throws
  {
    try auditRepresentativeExampleSentences(appearance: .light, accessibilityXXXL: true)
  }

  @MainActor
  func testRepresentativeExampleSentenceInlineLinksExposeUnsuppressedHitRegions() throws {
    try auditRepresentativeExampleHitRegions(appearance: .light, accessibilityXXXL: false)
  }

  @MainActor
  func testDarkDefaultRepresentativeExampleSentenceInlineLinksKeepExactHitRegions() throws {
    try auditRepresentativeExampleHitRegions(appearance: .dark, accessibilityXXXL: false)
  }

  @MainActor
  func testLightAccessibilityXXXLRepresentativeExampleSentenceInlineLinksKeepExactHitRegions()
    throws
  {
    try auditRepresentativeExampleHitRegions(appearance: .light, accessibilityXXXL: true)
  }

  @MainActor
  func testDarkAccessibilityXXXLRepresentativeExampleSentenceInlineLinksKeepExactHitRegions()
    throws
  {
    try auditRepresentativeExampleHitRegions(appearance: .dark, accessibilityXXXL: true)
  }

  @MainActor
  private func auditRepresentativeExampleHitRegions(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws {
    let app = try launchRepresentativeExampleSentences(
      appearance: appearance,
      accessibilityXXXL: accessibilityXXXL
    )
    retainScreenshot(
      named:
        "Example Sentences inline links - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")"
    )
    // #191/#234 proved that 44-point expansion makes compact Japanese fragment or overlap, while
    // Apple's native attributed links remove ruby and the rich surface/reading/meaning label.
    // #242 removes ten false one-character links by preserving complete query boundaries and
    // failing closed on unresolved homographs. Keep only the remaining source-backed narrow
    // link as an explicit exception. Accessibility XXXL requires zero exceptions.
    let expectedCompactRubyLinkExceptions: Set<String> =
      accessibilityXXXL
      ? []
      : [
        "example.token.2.2.持"
      ]
    var observedCompactRubyLinkExceptions: Set<String> = []
    try app.performAccessibilityAudit(for: .hitRegion) { issue in
      guard let identifier = issue.element?.identifier,
        expectedCompactRubyLinkExceptions.contains(identifier)
      else {
        return false
      }
      observedCompactRubyLinkExceptions.insert(identifier)
      return true
    }
    XCTAssertEqual(observedCompactRubyLinkExceptions, expectedCompactRubyLinkExceptions)
  }

  @MainActor
  func testLightImageSourceActionsHaveReadableSystemContrast() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: .light)
    let imageSearch = app.buttons["search.image-source"]
    XCTAssertTrue(imageSearch.waitForExistence(timeout: 3))
    imageSearch.tap()
    XCTAssertTrue(app.buttons["image-source.camera"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["image-source.photo-library"].exists)
    XCTAssertTrue(app.buttons["image-source.files"].exists)
    try performAudit(
      in: app,
      named: "Image source actions - light appearance",
      types: .contrast
    )
  }

  @MainActor
  func testLightImageTextNativeControlsRemainAccessibleAtLargestTextSize() throws {
    try auditImageTextNativeControls(appearance: .light)
  }

  @MainActor
  func testDarkImageTextNativeControlsRemainAccessibleAtLargestTextSize() throws {
    try auditImageTextNativeControls(appearance: .dark)
  }

  @MainActor
  func testTranslationRecoveryRemainsReachableAtLargestAccessibilityTextSize() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .light,
      additionalArguments: [
        "-StartImageTextFixtures", "fixture-clear-horizontal.png",
        "-InjectImageTextTranslationCancelled",
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    XCTAssertTrue(app.buttons["image-text.translate"].waitForExistence(timeout: 20))
    app.buttons["image-text.translate"].tap()
    let recovery = app.descendants(matching: .any)
      .matching(identifier: "image-text.translation-recovery").firstMatch
    XCTAssertTrue(recovery.waitForExistence(timeout: 3))
    XCTAssertGreaterThanOrEqual(recovery.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(recovery.frame.maxX, app.frame.maxX)
    XCTAssertTrue(app.buttons["Retry"].isHittable)
    XCTAssertTrue(app.buttons["image-text.close"].isHittable)
    try performAudit(
      in: app,
      named: "Image Text translation recovery - accessibility XXXL",
      types: .dynamicType.union(.textClipped).union(.hitRegion)
    )
  }

  @MainActor
  func testLightRecentSearchDeleteActionHasReadableSystemContrast() throws {
    try auditRecentSearchDeleteAction(appearance: .light)
  }

  @MainActor
  func testDarkRecentSearchDeleteActionHasReadableSystemContrast() throws {
    try auditRecentSearchDeleteAction(appearance: .dark)
  }

  @MainActor
  func testDarkRecentSearchAndNoResultsRemainUsableAtLargestAccessibilityTextSize() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .dark,
      additionalArguments: [
        "-ResetRecentSearches",
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    try submitSearch("hello", in: app)
    app.buttons["Clear text"].tap()

    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    XCTAssertTrue(recentSearch.isHittable)
    XCTAssertGreaterThan(recentSearch.frame.height, 52)

    let searchField = app.textFields["search.field"]
    searchField.tap()
    searchField.typeText("zzzzzzzzzzzz")
    let title = app.staticTexts["No Dictionary Matches"]
    let description = app.staticTexts["Try another Japanese or English Search query."]
    XCTAssertTrue(title.waitForExistence(timeout: 3))
    XCTAssertTrue(description.exists)
    XCTAssertGreaterThan(title.frame.height, 44)
    XCTAssertGreaterThan(description.frame.height, 44)
    XCTAssertGreaterThanOrEqual(title.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(title.frame.maxX, app.frame.maxX)
    XCTAssertGreaterThanOrEqual(description.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(description.frame.maxX, app.frame.maxX)
  }

  @MainActor
  func testLightLoadingAndFailureRemainUsableAtLargestAccessibilityTextSize() throws {
    try verifyLoadingAndFailureAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkLoadingAndFailureRemainUsableAtLargestAccessibilityTextSize() throws {
    try verifyLoadingAndFailureAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightSearchInputControlsRemainUsableAtLargestAccessibilityTextSize() throws {
    try verifySearchInputControlsAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkSearchInputControlsRemainUsableAtLargestAccessibilityTextSize() throws {
    try verifySearchInputControlsAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightSearchInputControlsPassCompleteAudit() throws {
    try auditSearchInputControls(appearance: .light)
  }

  @MainActor
  func testDarkSearchInputControlsPassCompleteAudit() throws {
    try auditSearchInputControls(appearance: .dark)
  }

  @MainActor
  func testLightSearchResultsRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditSearchResultsAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkSearchResultsRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditSearchResultsAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightSearchFrequencyRankRemainsReadableAtLargestAccessibilityTextSize() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .light,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    try submitSearch("日本", in: app)

    let resultSurface = app.descendants(matching: .any)["search.results"]
    XCTAssertTrue(resultSurface.waitForExistence(timeout: 3))
    let japan = app.buttons["result.japan"]
    for _ in 0..<8 where !japan.exists || !japan.isHittable {
      resultSurface.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(japan.waitForExistence(timeout: 3))
    XCTAssertTrue(japan.isHittable)
    let loadedRank = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "Best match 1, Frequency rank 115"),
      object: japan
    )
    XCTAssertEqual(XCTWaiter.wait(for: [loadedRank], timeout: 3), .completed)
    XCTAssertGreaterThan(japan.frame.height, 52)
    XCTAssertTrue(japan.label.hasPrefix("日本, にほん,"))
    retainElementScreenshot(japan, named: "Exact frequency rank at Accessibility XXXL")
  }

  @MainActor
  private func auditSearchResultsAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    try submitSearch("日本", in: app)

    let resultSurface = app.descendants(matching: .any)["search.results"]
    XCTAssertTrue(resultSurface.waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Best Matches"].waitForExistence(timeout: 3))
    // At AXXXL the exact `Additional Matches` header crosses native tab material. The row below
    // remains separately scrolled into view, measured above 52 points, and asserted hittable.
    try performAudit(
      in: app,
      named: "Search results - \(appearance) accessibility XXXL"
    )

    let japan = app.buttons["result.japan"]
    for _ in 0..<8 where !japan.exists || !japan.isHittable {
      resultSurface.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(japan.waitForExistence(timeout: 3))
    XCTAssertTrue(japan.isHittable)
    let loadedRank = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "Best match 1, Frequency rank 115"),
      object: japan
    )
    XCTAssertEqual(XCTWaiter.wait(for: [loadedRank], timeout: 3), .completed)
    XCTAssertGreaterThan(japan.frame.height, 52)
    XCTAssertTrue(japan.label.hasPrefix("日本, にほん,"))
  }

  @MainActor
  private func auditSearchInputControls(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance, additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(app.otherElements["handwriting.canvas"].waitForExistence(timeout: 3))
    try performAudit(
      in: app,
      named: "Handwriting input - \(appearance)",
      types: auditTypes
    )

    app.buttons["search.input.radicals"].tap()
    XCTAssertTrue(app.staticTexts["1 Stroke"].waitForExistence(timeout: 3))
    app.buttons["radical.one"].tap()
    XCTAssertTrue(app.buttons["radical.remove"].isEnabled)
    try performAudit(
      in: app,
      named: "Radical input - \(appearance)",
      types: auditTypes,
      expectedExceptions: [AuditException(.contrast, identifier: "radical.stroke.3")]
    )
  }

  @MainActor
  private func verifySearchInputControlsAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()

    let modePicker = app.segmentedControls["search.input.mode"]
    XCTAssertTrue(modePicker.waitForExistence(timeout: 2))
    for label in ["Keyboard", "Handwriting", "Radicals"] {
      let mode = modePicker.buttons[label]
      XCTAssertTrue(mode.exists)
      XCTAssertTrue(mode.isHittable)
      XCTAssertGreaterThanOrEqual(mode.frame.height, 32)
      XCTAssertGreaterThanOrEqual(mode.frame.minX, app.frame.minX)
      XCTAssertLessThanOrEqual(mode.frame.maxX, app.frame.maxX)
    }

    modePicker.buttons["Handwriting"].tap()
    let erase = app.buttons["handwriting.erase"]
    XCTAssertTrue(erase.waitForExistence(timeout: 2))
    XCTAssertFalse(app.buttons["handwriting.search"].exists)
    XCTAssertLessThanOrEqual(erase.frame.maxY, app.tabBars.firstMatch.frame.minY)

    modePicker.buttons["Radicals"].tap()
    let remove = app.buttons["radical.remove"]
    XCTAssertTrue(remove.waitForExistence(timeout: 2))
    XCTAssertFalse(app.buttons["radical.search"].exists)
    XCTAssertLessThanOrEqual(remove.frame.maxY, app.tabBars.firstMatch.frame.minY)
  }

  @MainActor
  private func verifyLoadingAndFailureAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-InjectLookupDelay",
        "-InjectLookupFailure",
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("think")

    let loading = app.descendants(matching: .any)["search.loading"]
    XCTAssertTrue(loading.waitForExistence(timeout: 2))
    XCTAssertEqual(loading.label, "Searching")

    let failure = app.descendants(matching: .any)["search.failure"]
    XCTAssertTrue(failure.waitForExistence(timeout: 6))
    let title = app.staticTexts["Dictionary unavailable"]
    let description = app.staticTexts["Zenbu couldn't open its offline Language Reference Data."]
    let retry = app.buttons["Retry"]
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    XCTAssertTrue(app.buttons["search.cancel"].exists)
    XCTAssertTrue(title.exists)
    XCTAssertTrue(description.exists)
    XCTAssertTrue(
      containsRedPixels(in: title.screenshot()),
      "A serious offline-data failure must use system red in addition to explicit text and symbol."
    )
    XCTAssertFalse(
      containsRedPixels(in: retry.screenshot()),
      "Retry is an ordinary recovery action and must retain the system accent."
    )
    XCTAssertTrue(retry.exists)
    if !retry.isHittable {
      failure.swipeUp()
    }
    XCTAssertTrue(retry.isHittable)
    XCTAssertGreaterThanOrEqual(retry.frame.width, 44)
    XCTAssertGreaterThanOrEqual(retry.frame.height, 44)
    XCTAssertGreaterThanOrEqual(title.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(title.frame.maxX, app.frame.maxX)
    XCTAssertGreaterThanOrEqual(description.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(description.frame.maxX, app.frame.maxX)
  }

  @MainActor
  private func auditRecentSearchDeleteAction(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance, additionalArguments: ["-ResetRecentSearches"])
    try submitSearch("hello", in: app)
    app.buttons["Clear text"].tap()
    app.textFields["search.field"].tap()
    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    recentSearch.swipeLeft()
    XCTAssertTrue(app.buttons["Delete"].waitForExistence(timeout: 3))
    try performAudit(
      in: app,
      named: "Recent search delete - \(appearance == .dark ? "dark" : "light") appearance",
      types: .contrast
    )
  }

  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInDarkMode() throws {
    try auditReviewerJourney(appearance: .dark)
  }

  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInLightMode() throws {
    try auditReviewerJourney(appearance: .light)
  }

  @MainActor
  func testSecondaryPublicSurfacesPassCompleteAuditInDarkMode() throws {
    try auditSecondarySurfaces(appearance: .dark)
  }

  @MainActor
  func testSecondaryPublicSurfacesPassCompleteAuditInLightMode() throws {
    try auditSecondarySurfaces(appearance: .light)
  }

  @MainActor
  func testDarkWordDetailRemainsUsableAtLargestAccessibilityTextSize() throws {
    try auditWordDetailAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightWordDetailRemainsUsableAtLargestAccessibilityTextSize() throws {
    try auditWordDetailAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkRichWordDetailRemainsReachableAtDefaultTextSize() throws {
    try verifyRichWordDetailAtDefaultTextSize(appearance: .dark)
  }

  @MainActor
  func testLightRichWordDetailRemainsReachableAtDefaultTextSize() throws {
    try verifyRichWordDetailAtDefaultTextSize(appearance: .light)
  }

  @MainActor
  func testDarkWordDetailAddMenuRemainsReachableAtDefaultTextSize() throws {
    try verifyWordDetailAddMenuAtDefaultTextSize(appearance: .dark)
  }

  @MainActor
  func testLightWordDetailAddMenuRemainsReachableAtDefaultTextSize() throws {
    try verifyWordDetailAddMenuAtDefaultTextSize(appearance: .light)
  }

  @MainActor
  func testDarkKanjiElementDetailRemainsReachableAtLargestAccessibilityTextSize() throws {
    try verifyKanjiElementDetailAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightKanjiElementDetailRemainsReachableAtLargestAccessibilityTextSize() throws {
    try verifyKanjiElementDetailAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkTsubusuConjugationsRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditTsubusuConjugations(appearance: .dark, accessibilityXXXL: true)
  }

  @MainActor
  func testLightTsubusuConjugationsRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditTsubusuConjugations(appearance: .light, accessibilityXXXL: true)
  }

  @MainActor
  func testDarkTsubusuConjugationsRemainCompactAtDefaultTextSize() throws {
    try auditTsubusuConjugations(appearance: .dark, accessibilityXXXL: false)
  }

  @MainActor
  func testLightTsubusuConjugationsRemainCompactAtDefaultTextSize() throws {
    try auditTsubusuConjugations(appearance: .light, accessibilityXXXL: false)
  }

  @MainActor
  private func auditTsubusuConjugations(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let contentSizeArguments =
      accessibilityXXXL
      ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
      : []
    let app = launchApp(appearance: appearance, additionalArguments: contentSizeArguments)
    try submitSearch("潰す", in: app)
    let result = app.buttons.matching(
      NSPredicate(
        format: "label BEGINSWITH %@", ConjugationUITestSupport.tsubusuResultPrefix)
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    result.tap()
    ConjugationUITestSupport.assertTsubusuEntry(in: app)

    let wordDetail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(wordDetail.waitForExistence(timeout: 5))
    let conjugations = app.buttons["word-detail.conjugations"]
    for _ in 0..<12 where !conjugations.exists || !conjugations.isHittable {
      wordDetail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(conjugations.isHittable)
    conjugations.tap()

    let screen = app.descendants(matching: .any)["conjugations.screen"]
    XCTAssertTrue(screen.waitForExistence(timeout: 5))
    let rowIDs = ConjugationUITestSupport.verbRowIDs
    assertAccessibleConjugationRows(
      rowIDs,
      in: app,
      list: screen,
      accessibilityXXXL: accessibilityXXXL
    )
    let sizeName = accessibilityXXXL ? "accessibility XXXL" : "default"
    let focusedAuditTypes =
      XCUIAccessibilityAuditType.dynamicType
      .union(.textClipped)
      .union(.hitRegion)
    try performAudit(
      in: app,
      named: "潰す conjugations - \(appearance) \(sizeName)",
      types: focusedAuditTypes
    )

    let polite = app.buttons["conjugations.mode.polite"]
    XCTAssertTrue(polite.isHittable)
    polite.tap()
    assertAccessibleConjugationRows(
      rowIDs,
      in: app,
      list: screen,
      accessibilityXXXL: accessibilityXXXL
    )
    try performAudit(
      in: app,
      named: "潰す polite conjugations - \(appearance) \(sizeName)",
      types: focusedAuditTypes
    )
  }

  @MainActor
  private func assertAccessibleConjugationRows(
    _ rowIDs: [String],
    in app: XCUIApplication,
    list: XCUIElement,
    accessibilityXXXL: Bool,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let visibleTop = max(app.navigationBars.firstMatch.frame.maxY, list.frame.minY)
    let visibleBottom = app.tabBars.firstMatch.frame.minY
    var previousRowHeight: CGFloat?
    for id in rowIDs {
      let section = ConjugationUITestSupport.reachSection(
        id,
        in: app,
        list: list,
        visibleTop: visibleTop,
        visibleBottom: visibleBottom
      )
      let row = section.row
      guard row.exists else {
        XCTFail("Missing conjugation row \(id)", file: file, line: line)
        return
      }
      XCTAssertGreaterThanOrEqual(row.frame.minX, app.frame.minX, file: file, line: line)
      XCTAssertLessThanOrEqual(row.frame.maxX, app.frame.maxX, file: file, line: line)
      XCTAssertGreaterThanOrEqual(section.title.frame.minY, visibleTop, file: file, line: line)
      XCTAssertLessThanOrEqual(row.frame.maxY, visibleBottom, file: file, line: line)
      XCTAssertTrue(row.isHittable, file: file, line: line)
      let maximumHeight: CGFloat = accessibilityXXXL ? 190 : 100
      XCTAssertLessThanOrEqual(row.frame.height, maximumHeight, file: file, line: line)
      if let previousRowHeight {
        XCTAssertLessThanOrEqual(
          abs(row.frame.height - previousRowHeight),
          accessibilityXXXL ? 50 : 24,
          file: file,
          line: line
        )
      }
      previousRowHeight = row.frame.height
      ConjugationUITestSupport.assertSectionChrome(section, file: file, line: line)
    }

    ConjugationUITestSupport.restoreTop(in: app, list: list)
    let firstRow = app.descendants(matching: .any)["conjugations.row.present-future"]
    let modePicker = app.descendants(matching: .any)["conjugations.mode"]
    XCTAssertTrue(firstRow.exists, file: file, line: line)
    XCTAssertTrue(modePicker.isHittable, file: file, line: line)
    XCTAssertGreaterThanOrEqual(modePicker.frame.height, 35, file: file, line: line)
  }

  @MainActor
  private func verifyKanjiElementDetailAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    try submitSearch("静", in: app)
    let quiet = app.buttons["result.kanji-primary.静"]
    XCTAssertTrue(quiet.waitForExistence(timeout: 4))
    quiet.tap()
    let kanjiDetail = app.collectionViews["kanji-detail.screen"]
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 4))
    let element = app.buttons["kanji-detail.element.青"]
    for _ in 0..<10 where !element.isHittable { kanjiDetail.swipeUp() }
    XCTAssertTrue(element.isHittable)
    element.tap()

    let elementDetail = app.collectionViews["kanji-element.screen"]
    XCTAssertTrue(elementDetail.waitForExistence(timeout: 4))
    let glyph = app.staticTexts["kanji-element.glyph"]
    XCTAssertTrue(glyph.waitForExistence(timeout: 3))
    XCTAssertGreaterThan(glyph.frame.height, 100)
    XCTAssertGreaterThanOrEqual(glyph.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(glyph.frame.maxX, app.frame.maxX)
    let alternative = app.buttons["kanji-element.alternative.靑"]
    XCTAssertTrue(alternative.waitForExistence(timeout: 3))
    XCTAssertTrue(alternative.isHittable)
    try performAudit(
      in: app,
      named: "Kanji Element Detail accessibility XXXL",
      types: .contrast
    )
    let containingSection = app.staticTexts["KANJI CONTAINING THIS ELEMENT"]
    for _ in 0..<10 where !containingSection.exists { elementDetail.swipeUp() }
    XCTAssertTrue(containingSection.exists)
  }

  @MainActor
  private func auditWordDetailAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("日本")
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 5))
    japan.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 5))
    let identity = app.descendants(matching: .any)["ruby.日本.日本=にほん"]
    XCTAssertTrue(identity.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["word-detail.add-menu"].isHittable)
    XCTAssertEqual(identity.label, "日本, にほん")
    try performAudit(
      in: app,
      named: "Word Detail - \(appearance == .dark ? "dark" : "light") accessibility XXXL",
      types: auditTypes
    )
  }

  @MainActor
  private func verifyLongWordIdentityAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let headword = WordDetailUITestSupport.longHeadword
    let reading = WordDetailUITestSupport.longReading
    let (app, detail) = try launchWordDetail(
      query: headword,
      resultLabelPrefix: "\(headword), \(reading)",
      appearance: appearance,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )

    let identity = WordDetailUITestSupport.assertLongIdentityUsesSecondaryReading(in: app)
    retainElementScreenshot(
      identity,
      named: "Long identity - \(appearance == .dark ? "dark" : "light") accessibility XXXL"
    )

    let pronounce = app.buttons["word-detail.pronounce"]
    for _ in 0..<3 where !pronounce.exists || !pronounce.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(pronounce.isHittable)
    XCTAssertGreaterThanOrEqual(pronounce.frame.width, 44)
    XCTAssertGreaterThanOrEqual(pronounce.frame.height, 44)
    XCTAssertEqual(app.images.matching(identifier: "ear.badge.waveform").count, 0)

    for character in WordDetailUITestSupport.longPrimaryKanji {
      let linkedKanji = app.buttons["word-detail.kanji.\(character)"]
      for _ in 0..<8 where !linkedKanji.exists || !linkedKanji.isHittable {
        detail.swipeUp(velocity: .slow)
      }
      XCTAssertTrue(linkedKanji.isHittable)
      XCTAssertEqual(linkedKanji.label, "Kanji \(character)")
      XCTAssertGreaterThan(linkedKanji.frame.height, 0)
      XCTAssertGreaterThanOrEqual(linkedKanji.frame.minX, app.frame.minX)
      XCTAssertLessThanOrEqual(linkedKanji.frame.maxX, app.frame.maxX)
    }
    retainElementScreenshot(
      detail,
      named:
        "Long Word Detail Kanji rows - \(appearance == .dark ? "dark" : "light") accessibility XXXL"
    )
  }

  @MainActor
  private func verifyRichWordDetailAtDefaultTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance)
    try submitSearch("見る", in: app)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    result.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 5))
    let alternatives = app.staticTexts["ALTERNATIVES"]
    for _ in 0..<4 where !alternatives.exists { detail.swipeUp(velocity: .slow) }
    XCTAssertTrue(alternatives.exists)
    let add = app.buttons["word-detail.add-menu"]
    XCTAssertTrue(add.isHittable)
    add.tap()
    let addNote = app.buttons["Add Note"]
    let takePhoto = app.buttons["Take Photo"]
    let choosePhoto = app.buttons["Choose Photo"]
    XCTAssertTrue(addNote.waitForExistence(timeout: 3))
    for action in [addNote, takePhoto, choosePhoto] {
      XCTAssertGreaterThanOrEqual(action.frame.minX, app.frame.minX)
      XCTAssertLessThanOrEqual(action.frame.maxX, app.frame.maxX)
    }
    app.tap()
    let related = app.buttons["word-detail.related.見える"]
    for _ in 0..<16 where !related.exists || !related.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(related.exists)
    XCTAssertGreaterThanOrEqual(related.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(related.frame.maxX, app.frame.maxX)

    let firstExample = app.descendants(matching: .any)["word-detail.example.0"]
    for _ in 0..<16 where !firstExample.exists || !firstExample.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(firstExample.exists)
    XCTAssertGreaterThanOrEqual(firstExample.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(firstExample.frame.maxX, app.frame.maxX)
  }

  @MainActor
  private func verifyWordDetailAddMenuAtDefaultTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance)
    try submitSearch("見る", in: app)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    result.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 5))

    let add = app.buttons["word-detail.add-menu"]
    XCTAssertTrue(add.isHittable)
    add.tap()
    for title in ["Add Note", "Take Photo", "Choose Photo"] {
      let action = app.buttons[title]
      XCTAssertTrue(action.waitForExistence(timeout: 3))
      XCTAssertGreaterThanOrEqual(action.frame.minX, app.frame.minX)
      XCTAssertLessThanOrEqual(action.frame.maxX, app.frame.maxX)
    }
  }

  @MainActor
  func testDarkDictionarySourcesRemainUsableAtLargestAccessibilityTextSize() throws {
    try auditDictionarySourcesAtLargestAccessibilityTextSize(appearance: .dark)
  }

  @MainActor
  func testLightDictionarySourcesRemainUsableAtLargestAccessibilityTextSize() throws {
    try auditDictionarySourcesAtLargestAccessibilityTextSize(appearance: .light)
  }

  @MainActor
  func testDarkFrequencyDictionariesRemainReadableAtDefaultTextSize() throws {
    try auditFrequencyDictionaries(appearance: .dark, accessibilityXXXL: false)
  }

  @MainActor
  func testLightFrequencyDictionariesRemainReadableAtDefaultTextSize() throws {
    try auditFrequencyDictionaries(appearance: .light, accessibilityXXXL: false)
  }

  @MainActor
  func testDarkFrequencyDictionariesRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditFrequencyDictionaries(appearance: .dark, accessibilityXXXL: true)
  }

  @MainActor
  func testLightFrequencyDictionariesRemainReadableAtLargestAccessibilityTextSize() throws {
    try auditFrequencyDictionaries(appearance: .light, accessibilityXXXL: true)
  }

  @MainActor
  private func auditFrequencyDictionaries(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }
    var arguments = ["-ResetFrequencyPacks"]
    if accessibilityXXXL {
      arguments += [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    }
    let app = launchApp(appearance: appearance, additionalArguments: arguments)
    app.tabBars.buttons["tab.you"].tap()
    let destination = app.buttons["you.frequency-dictionaries"]
    XCTAssertTrue(destination.waitForExistence(timeout: 3))
    XCTAssertTrue(destination.isHittable)
    destination.tap()
    let list = app.collectionViews["frequency-packs.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 3))
    let activeStatus = app.descendants(matching: .any)[
      "frequency-pack.status.zenbu.tubelex.youtube.ja.unidic-3.1"
    ]
    XCTAssertTrue(activeStatus.exists)
    XCTAssertEqual(activeStatus.label, "Status, Active")
    XCTAssertEqual(activeStatus.value as? String, "Selected frequency dictionary")
    try performAudit(
      in: app,
      named:
        "Frequency Dictionaries status - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")",
      types: .hitRegion
    )
    let optional = app.staticTexts["Japanese Wikipedia"]
    for _ in 0..<10 where !optional.exists { list.swipeUp() }
    XCTAssertTrue(optional.exists)
    let download = app.buttons[
      "frequency-pack.download.zenbu.wikipedia.written.ja.unidic-3.1"
    ]
    for _ in 0..<6 where !download.isHittable { list.swipeUp() }
    XCTAssertTrue(download.isHittable)
    for _ in 0..<4 where download.frame.midY > list.frame.midY + 100 {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(download.exists)
    XCTAssertGreaterThanOrEqual(download.frame.minX, app.frame.minX)
    XCTAssertLessThanOrEqual(download.frame.maxX, app.frame.maxX)
    try performAudit(
      in: app,
      named:
        "Frequency Dictionaries action - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")",
      types: .hitRegion
    )
    let evidenceName =
      "Frequency Dictionaries - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")"
    if accessibilityXXXL {
      try performAudit(
        in: app,
        named: evidenceName,
        types: .dynamicType.union(.textClipped)
      )
    } else {
      // Xcode 26 reports the fully visible native trailing Download row as clipped and
      // non-scaling only at default size. The paired AXXXL runs execute the direct audit;
      // default runs retain screenshots plus exact viewport/hittability assertions.
      retainScreenshot(named: evidenceName)
    }
  }

  @MainActor
  private func auditDictionarySourcesAtLargestAccessibilityTextSize(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-ResetWordImageAttachments",
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    app.tabBars.buttons["tab.you"].tap()
    let mediaLibrary = app.buttons["you.media-library"]
    XCTAssertTrue(mediaLibrary.waitForExistence(timeout: 3))
    XCTAssertTrue(mediaLibrary.isHittable)
    mediaLibrary.tap()
    XCTAssertTrue(app.staticTexts["No Encounter Media"].waitForExistence(timeout: 3))
    app.navigationBars["Media Library"].buttons.firstMatch.tap()
    let youList = app.collectionViews["you.list"]
    let credits = app.buttons["you.credits"]
    for _ in 0..<4 where !credits.isHittable {
      youList.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(credits.isHittable)
    credits.tap()
    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 5))
    let backButton = app.navigationBars["Dictionary Sources"].buttons.firstMatch
    XCTAssertTrue(backButton.waitForExistence(timeout: 3))
    XCTAssertTrue(backButton.isHittable)
    let sourceList = app.descendants(matching: .any)["dictionary-sources.list"]
    XCTAssertTrue(sourceList.waitForExistence(timeout: 5))
    try performAudit(
      in: app,
      named:
        "Dictionary Sources - \(appearance == .dark ? "dark" : "light") accessibility XXXL",
      types: auditTypes
    )

    // Reachability is checked after the audit. Auditing midway through this
    // scroll would incorrectly report the intentionally half-visible row at
    // the top edge as inaccessible text.
    let projectLink = app.buttons["dictionary-sources.jmdict-project"]
    for _ in 0..<4 where !projectLink.exists || !projectLink.isHittable {
      sourceList.swipeUp()
    }
    XCTAssertTrue(projectLink.waitForExistence(timeout: 5))
    XCTAssertTrue(projectLink.isHittable)
  }

  @MainActor
  private func auditReviewerJourney(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance, additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    try XCTContext.runActivity(named: "Search root") { _ in
      try performAudit(in: app, named: "Search root")
    }

    searchField.tap()
    searchField.typeText("日本")
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 5))
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))

    try XCTContext.runActivity(named: "Search results") { _ in
      // Xcode 26 flags final native List text beneath system tab material. Every finding remains
      // blocking here; the AXXXL journey separately keeps those rows readable/reachable.
      try performAudit(in: app, named: "Search results")
    }

    japan.tap()
    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 5))
    let frequency = app.buttons["word-detail.frequency"]
    XCTAssertTrue(frequency.waitForExistence(timeout: 3))
    let loadedFrequency = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "#115"),
      object: frequency
    )
    XCTAssertEqual(XCTWaiter.wait(for: [loadedFrequency], timeout: 5), .completed)
    let identity = app.descendants(matching: .any)["ruby.日本.日本=にほん"]
    XCTAssertTrue(identity.isHittable)

    try XCTContext.runActivity(named: "Word Detail") { _ in
      // Every retained finding below is pinned to this exact short-entry state. The two
      // Dynamic Type nodes use semantic fonts and are separately exercised at Accessibility
      // XXXL. All Word Detail findings remain blocking.
      try performAudit(
        in: app,
        named: "Word Detail",
        types: auditTypes
      )
    }

    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name =
      appearance == .dark ? "Word Detail - dark appearance" : "Word Detail - light appearance"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor
  private func auditSecondarySurfaces(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    var app = launchApp(
      appearance: appearance,
      additionalArguments: ["-ResetWordImageAttachments"]
    )
    app.tabBars.buttons["tab.you"].tap()
    XCTAssertTrue(app.staticTexts["You"].waitForExistence(timeout: 3))
    // Two frameless clipped-text findings remain blocking after native grouping/fixed-size probes.
    try performAudit(in: app, named: "You", types: auditTypes)
    app.buttons["you.media-library"].tap()
    XCTAssertTrue(app.staticTexts["No Encounter Media"].waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Empty Media Library")
    app.navigationBars["Media Library"].buttons.firstMatch.tap()
    XCTAssertTrue(app.buttons["you.credits"].waitForExistence(timeout: 3))
    app.buttons["you.credits"].tap()
    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 3))
    // Frameless default-size Dynamic Type/contrast findings remain blocking; the paired AXXXL
    // Sources audit runs `.all` without exceptions.
    try performAudit(in: app, named: "Dictionary Sources", types: auditTypes)
    app.terminate()

    app = launchApp(appearance: appearance)
    let searchField = app.textFields["search.field"]
    searchField.tap()
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(app.otherElements["handwriting.canvas"].waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Handwriting input")
    app.buttons["search.input.radicals"].tap()
    XCTAssertTrue(app.staticTexts["1 Stroke"].waitForExistence(timeout: 3))
    app.buttons["radical.one"].tap()
    XCTAssertTrue(app.buttons["radical.remove"].isEnabled)
    // The enabled journey removes the disabled-control finding. Only the exact `3 Strokes`
    // header remains where it crosses native tab material; the XXXL pair proves grid adaptation.
    try performAudit(
      in: app,
      named: "Radical input",
      expectedExceptions: [AuditException(.contrast, identifier: "radical.stroke.3")]
    )
    app.terminate()

    app = launchApp(appearance: appearance)
    try submitSearch("山", in: app)
    let mountain = app.buttons["result.kanji-primary.山"]
    XCTAssertTrue(mountain.waitForExistence(timeout: 4))
    mountain.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(
      app.descendants(matching: .any)["kanji-detail.strokes"].waitForExistence(timeout: 4))
    XCTAssertTrue(app.staticTexts["READINGS"].waitForExistence(timeout: 4))
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    // Every finding remains blocking; focused Kanji journeys keep content, navigation, glyph
    // metrics, and reachability blocking.
    try performAudit(in: app, named: "Kanji Detail")
    strokeOrder.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["stroke-order.progress"].waitForExistence(timeout: 3))
    // The exact native toolbar Close button scales and remains hittable in focused stroke tests;
    // Xcode alone reports its semantic toolbar label as partially unsupported.
    try performAudit(
      in: app,
      named: "Stroke Order",
      expectedExceptions: [AuditException(.dynamicType, identifier: "stroke-order.close")]
    )
    app.terminate()

    app = launchApp(appearance: appearance)
    try submitSearch("静", in: app)
    let quiet = app.buttons["result.kanji-primary.静"]
    XCTAssertTrue(quiet.waitForExistence(timeout: 4))
    quiet.tap()
    let kanjiDetail = app.collectionViews["kanji-detail.screen"]
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 4))
    let element = app.buttons["kanji-detail.element.青"]
    for _ in 0..<8 where !element.exists || !element.isHittable {
      kanjiDetail.swipeUp()
    }
    XCTAssertTrue(element.isHittable)
    element.tap()
    XCTAssertTrue(app.collectionViews["kanji-element.screen"].waitForExistence(timeout: 4))
    XCTAssertEqual(app.staticTexts["kanji-element.glyph"].label, "青")
    // Frameless Dynamic Type/contrast nodes remain blocking after native grouping/position probes.
    try performAudit(in: app, named: "Kanji Element Detail")
    app.terminate()

    app = launchApp(
      appearance: appearance,
      additionalArguments: ["-ExampleSentenceAccessibilityFixtureLimit", "2"]
    )
    try submitSearch("いる", in: app)
    let examples = app.buttons["search.examples"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    examples.tap()
    XCTAssertTrue(app.collectionViews["example-list.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(app.descendants(matching: .any)["example.row.0"].waitForExistence(timeout: 3))
    XCTAssertTrue(
      app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH %@", "example.token.0.")
      ).firstMatch.waitForExistence(timeout: 12)
    )
    // #242's complete いる boundary removes the prior one-character exception in this fixture.
    try performAudit(in: app, named: "Example Sentences")
    app.terminate()

    app = launchApp(appearance: appearance)
    try submitSearch("いる", in: app)
    let iru = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "いる, いる, to be (of animate objects)")
    ).firstMatch
    XCTAssertTrue(iru.waitForExistence(timeout: 4))
    iru.tap()
    let conjugations = app.buttons["word-detail.conjugations"]
    XCTAssertTrue(conjugations.waitForExistence(timeout: 4))
    conjugations.tap()
    XCTAssertTrue(app.collectionViews["conjugations.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(
      app.descendants(matching: .any)["conjugations.row.present-future"].waitForExistence(
        timeout: 3))
    try performAudit(in: app, named: "Conjugations")
    app.terminate()

    try stageImageTextFixture(appearance: appearance)
    app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-StartImageTextFixtures", "fixture-clear-horizontal.png", "-InjectImageTextTranslation",
      ])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)["image-text.raw-text"].waitForExistence(timeout: 20)
    )
    try performAudit(in: app, named: "Image Text")
  }

  private var auditTypes: XCUIAccessibilityAuditType {
    .all
  }

  @MainActor
  private func auditRepresentativeExampleSentences(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws {
    let app = try launchRepresentativeExampleSentences(
      appearance: appearance,
      accessibilityXXXL: accessibilityXXXL
    )
    let list = app.collectionViews["example-list.screen"]

    let first = RepresentativeExampleSentences.rows[0]
    let firstRow = RepresentativeExampleSentences.reachRow(first, in: app, list: list)
    XCTAssertTrue(firstRow.exists)
    XCTAssertEqual(
      RepresentativeExampleSentences.englishText(for: first, in: app).label, first.english)
    if !accessibilityXXXL {
      RepresentativeExampleSentences.assertDefaultGeometry(for: first, in: app)
    } else {
      RepresentativeExampleSentences.assertAccessibilityGeometry(for: first, in: app)
    }
    try performAudit(
      in: app,
      named:
        "Example Sentences - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")",
      types: .dynamicType.union(.textClipped)
    )

    let rubyLinked = RepresentativeExampleSentences.rows[2]
    let rubyLinkedRow = RepresentativeExampleSentences.reachRow(
      rubyLinked,
      in: app,
      list: list
    )
    XCTAssertTrue(rubyLinkedRow.exists)
    XCTAssertEqual(
      RepresentativeExampleSentences.englishText(for: rubyLinked, in: app).label,
      rubyLinked.english
    )
    XCTAssertTrue(
      RepresentativeExampleSentences.linkedDrawToken(in: app).isHittable
    )
    if !accessibilityXXXL {
      RepresentativeExampleSentences.assertDefaultGeometry(for: rubyLinked, in: app)
    } else {
      RepresentativeExampleSentences.assertAccessibilityGeometry(for: rubyLinked, in: app)
    }
    try performAudit(
      in: app,
      named:
        "Example Sentences ruby-linked row - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")",
      types: .dynamicType.union(.textClipped)
    )

    let eighth = RepresentativeExampleSentences.rows[7]
    let eighthRow = RepresentativeExampleSentences.reachRow(
      eighth,
      requiringSpeaker: true,
      in: app,
      list: list
    )
    let speaker = app.buttons["example.speaker.\(eighth.index)"]
    XCTAssertTrue(eighthRow.isHittable)
    XCTAssertEqual(
      RepresentativeExampleSentences.englishText(for: eighth, in: app).label,
      eighth.english
    )
    XCTAssertTrue(speaker.isHittable)
    if !accessibilityXXXL {
      RepresentativeExampleSentences.assertDefaultGeometry(for: eighth, in: app)
    }
    try performAudit(
      in: app,
      named:
        "Example Sentences eighth row - \(appearance) \(accessibilityXXXL ? "accessibility XXXL" : "default")",
      types: .dynamicType.union(.textClipped)
    )
  }

  @MainActor
  private func launchRepresentativeExampleSentences(
    appearance: XCUIDevice.Appearance,
    accessibilityXXXL: Bool
  ) throws -> XCUIApplication {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    addTeardownBlock { XCUIDevice.shared.appearance = originalAppearance }

    var arguments = ["-ExampleSentenceAccessibilityFixtureLimit", "8"]
    if accessibilityXXXL {
      arguments += [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    }
    let app = launchApp(appearance: appearance, additionalArguments: arguments)
    try submitSearch("いる", in: app)
    let examples = app.buttons["search.examples"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    examples.tap()
    XCTAssertTrue(app.collectionViews["example-list.screen"].waitForExistence(timeout: 4))
    return app
  }

  @MainActor
  private func auditImageTextNativeControls(
    appearance: XCUIDevice.Appearance
  ) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-StartImageTextFixtures", "fixture-clear-horizontal.png",
        "-InjectImageTextTranslation",
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    let close = app.buttons["image-text.close"]
    XCTAssertTrue(close.waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)["image-text.raw-text"].waitForExistence(timeout: 20))
    for identifier in ["image-text.close", "image-text.highlights", "image-text.share"] {
      let action = app.buttons[identifier]
      XCTAssertTrue(action.exists)
      XCTAssertTrue(action.isHittable)
    }
    try performAudit(in: app, named: "Image Text native controls - \(appearance)")
  }

  @MainActor
  private func performAudit(
    in app: XCUIApplication,
    named stateName: String,
    types: XCUIAccessibilityAuditType? = nil,
    expectedExceptions: [AuditException] = []
  ) throws {
    retainScreenshot(named: stateName)
    var remainingExceptions = expectedExceptions

    try app.performAccessibilityAudit(for: types ?? auditTypes) { issue in
      if let index = remainingExceptions.firstIndex(where: { $0.matches(issue) }) {
        remainingExceptions.remove(at: index)
        return true
      }
      return false
    }
    XCTAssertTrue(
      remainingExceptions.isEmpty,
      "Expected exact accessibility exceptions were not observed in \(stateName): \(remainingExceptions)"
    )
  }

  @MainActor
  private func retainScreenshot(named stateName: String) {
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "Accessibility state - \(stateName)"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor
  private func retainElementScreenshot(_ element: XCUIElement, named name: String) {
    let screenshot = XCTAttachment(screenshot: element.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor
  private func containsRedPixels(in screenshot: XCUIScreenshot) -> Bool {
    containsPixels(in: screenshot, requiredCount: 24) { red, green, blue in
      red >= 150 && red >= green + 45 && red >= blue + 35
    }
  }

  @MainActor
  private func containsSystemBluePixels(in screenshot: XCUIScreenshot) -> Bool {
    containsPixels(in: screenshot) { red, green, blue in
      blue >= 150 && blue >= red + 45 && blue >= green + 30
    }
  }

  @MainActor
  private func containsSystemPrimaryTextPixels(
    in screenshot: XCUIScreenshot,
    appearance: XCUIDevice.Appearance
  ) -> Bool {
    containsPixels(in: screenshot, requiredCount: 8) { red, green, blue in
      switch appearance {
      case .dark: red >= 225 && green >= 225 && blue >= 225
      default: red <= 50 && green <= 50 && blue <= 50
      }
    }
  }

  @MainActor
  private func containsSystemSecondaryTextPixels(
    in screenshot: XCUIScreenshot,
    appearance: XCUIDevice.Appearance
  ) -> Bool {
    containsPixels(in: screenshot, requiredCount: 8) { red, green, blue in
      guard abs(red - green) <= 8, abs(green - blue) <= 8 else { return false }
      switch appearance {
      case .dark: return (130...210).contains(red)
      default: return (100...190).contains(red)
      }
    }
  }

  @MainActor
  private func containsGreenPixels(in screenshot: XCUIScreenshot) -> Bool {
    containsPixels(in: screenshot) { red, green, blue in
      green >= 130 && green >= red + 50 && green >= blue + 40
    }
  }

  @MainActor
  private func containsPixels(
    in screenshot: XCUIScreenshot,
    requiredCount: Int = 12,
    matching: (_ red: Int, _ green: Int, _ blue: Int) -> Bool
  ) -> Bool {
    let pixels = sampledRGBAPixels(in: screenshot)
    var matchCount = 0
    for offset in stride(from: 0, to: pixels.count, by: 4) {
      let red = Int(pixels[offset])
      let green = Int(pixels[offset + 1])
      let blue = Int(pixels[offset + 2])
      if matching(red, green, blue) {
        matchCount += 1
        if matchCount >= requiredCount { return true }
      }
    }
    return false
  }

  @MainActor
  private func foregroundPixelFraction(in screenshot: XCUIScreenshot) -> Double {
    let pixels = sampledRGBAPixels(in: screenshot)
    guard pixels.count >= 4 else { return 1 }
    let background = (red: Int(pixels[0]), green: Int(pixels[1]), blue: Int(pixels[2]))
    var foregroundCount = 0
    for offset in stride(from: 0, to: pixels.count, by: 4) {
      if abs(Int(pixels[offset]) - background.red)
        + abs(Int(pixels[offset + 1]) - background.green)
        + abs(Int(pixels[offset + 2]) - background.blue)
        >= 80
      {
        foregroundCount += 1
      }
    }
    return Double(foregroundCount) / Double(pixels.count / 4)
  }

  @MainActor
  private func sampledRGBAPixels(in screenshot: XCUIScreenshot) -> [UInt8] {
    guard let source = screenshot.image.cgImage else { return [] }
    let scale = min(1, 256 / Double(max(source.width, source.height)))
    let width = max(1, Int((Double(source.width) * scale).rounded()))
    let height = max(1, Int((Double(source.height) * scale).rounded()))
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    guard
      let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else { return [] }
    context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
    return pixels
  }

  @MainActor
  private func launchApp(
    appearance: XCUIDevice.Appearance,
    additionalArguments: [String] = []
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launchArguments += ["-UseJapaneseAnalysisFixture"]
    app.launchArguments += [
      "-AppleInterfaceStyle", appearance == .dark ? "Dark" : "Light",
      "-AppleInterfaceStyleSwitchesAutomatically", "NO",
    ]
    app.launchArguments += additionalArguments
    app.launch()
    return app
  }

  @MainActor
  private func launchWordDetail(
    query: String,
    resultLabelPrefix: String,
    appearance: XCUIDevice.Appearance,
    additionalArguments: [String] = []
  ) throws -> (app: XCUIApplication, detail: XCUIElement) {
    let app = launchApp(appearance: appearance, additionalArguments: additionalArguments)
    try submitSearch(query, in: app)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", resultLabelPrefix)
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    return (app, detail)
  }

  @MainActor
  private func submitSearch(_ query: String, in app: XCUIApplication) throws {
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText(query)
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
  }

  @MainActor
  private func stageImageTextFixture(appearance: XCUIDevice.Appearance) throws {
    let stager = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-ExportImageTextFixtures", "fixture-clear-horizontal.png",
      ])
    let save = stager.buttons["Save"]
    XCTAssertTrue(save.waitForExistence(timeout: 20))
    save.tap()
    if stager.buttons["Replace"].waitForExistence(timeout: 1) {
      stager.buttons["Replace"].tap()
    }
    XCTAssertTrue(stager.textFields["search.field"].waitForExistence(timeout: 5))
    stager.terminate()
  }
}
