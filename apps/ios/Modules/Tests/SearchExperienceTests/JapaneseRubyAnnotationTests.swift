import XCTest

@testable import SearchExperience

final class JapaneseRubyAnnotationTests: XCTestCase {
  @MainActor
  func testReadingAidPreferencesDefaultToFuriganaOnAndRomajiOff() throws {
    let suiteName = "ReadingAidPreferencesTests.defaults.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let preferences = ReadingAidPreferences(defaults: defaults, processArguments: [])

    XCTAssertTrue(preferences.showsFurigana)
    XCTAssertFalse(preferences.showsRomaji)
  }

  @MainActor
  func testReadingAidPreferencesPersistIndependentChoicesAcrossColdRelaunch() throws {
    let suiteName = "ReadingAidPreferencesTests.persistence.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let firstLaunch = ReadingAidPreferences(defaults: defaults, processArguments: [])
    firstLaunch.showsFurigana = false
    firstLaunch.showsRomaji = true

    let coldRelaunch = ReadingAidPreferences(defaults: defaults, processArguments: [])
    XCTAssertFalse(coldRelaunch.showsFurigana)
    XCTAssertTrue(coldRelaunch.showsRomaji)
  }

  @MainActor
  func testReadingAidTestResetRunsOnceWithoutUndoingVisiblePreferenceChanges() throws {
    let suiteName = "ReadingAidPreferencesTests.reset.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let arguments = ["-ResetReadingAidPreferences"]

    let initialComposition = ReadingAidPreferences(
      defaults: defaults,
      processArguments: arguments
    )
    initialComposition.showsFurigana = false

    let recomposedRoot = ReadingAidPreferences(
      defaults: defaults,
      processArguments: arguments
    )
    XCTAssertFalse(recomposedRoot.showsFurigana)
  }

  // These fixed expectations are the owner-reviewed Foundation/ICU orthographic
  // candidate. They are authored literals and are never derived from production output at runtime.
  func testAppleRomajiUsesTrustedReadingsAndRejectsRawKanji() {
    XCTAssertEqual(AppleJapaneseRomanization.romanizeTrustedReading("トウキョウ"), "toukyou")
    XCTAssertEqual(AppleJapaneseRomanization.romanizeTrustedReading("ガッコウ"), "gakkou")
    XCTAssertEqual(AppleJapaneseRomanization.romanizeTrustedReading("スーパー"), "sūpā")
    XCTAssertEqual(AppleJapaneseRomanization.romanizeTrustedReading("シンヨウ"), "shin'you")
    XCTAssertNil(AppleJapaneseRomanization.romanizeTrustedReading("日本語"))
  }

  func testAppleRomajiBuildsOneCompleteSentenceOrAbstains() {
    let complete = [
      JapaneseTextToken(id: 0, surface: "今日", entry: nil, reading: "キョウ"),
      JapaneseTextToken(id: 1, surface: "は", entry: nil, reading: "ハ"),
      JapaneseTextToken(id: 2, surface: "いい", entry: nil, reading: "イイ"),
      JapaneseTextToken(id: 3, surface: "天気", entry: nil, reading: "テンキ"),
      JapaneseTextToken(id: 4, surface: "です", entry: nil, reading: "デス"),
      JapaneseTextToken(id: 5, surface: "。", entry: nil, reading: "。"),
    ]
    XCTAssertEqual(
      AppleJapaneseRomanization.romanizeCompleteSentence(complete),
      "kyou ha ii tenki desu。"
    )

    let incomplete = [
      JapaneseTextToken(id: 0, surface: "未知語", entry: nil, reading: nil),
      JapaneseTextToken(id: 1, surface: "。", entry: nil, reading: "。"),
    ]
    XCTAssertNil(AppleJapaneseRomanization.romanizeCompleteSentence(incomplete))
  }

  func testAppleRomajiPreservesExistingWhitespaceAndMixedLatinNumbers() {
    let mixed = [
      JapaneseTextToken(id: 0, surface: "ZENBU2026", entry: nil, reading: nil),
      JapaneseTextToken(id: 1, surface: " ", entry: nil, reading: nil),
      JapaneseTextToken(id: 2, surface: "で", entry: nil, reading: "デ"),
      JapaneseTextToken(id: 3, surface: "す", entry: nil, reading: "ス"),
      JapaneseTextToken(id: 4, surface: "。", entry: nil, reading: "。"),
    ]

    XCTAssertEqual(
      AppleJapaneseRomanization.romanizeCompleteSentence(mixed),
      "ZENBU2026 de su。"
    )
  }

  func testSentenceLayoutClassifiesUnicodePunctuationWithoutTreatingDecimalTextAsPunctuation() {
    XCTAssertEqual("日本語".japaneseTokenLineBreakBehavior, .normal)
    XCTAssertEqual("。".japaneseTokenLineBreakBehavior, .attachesToPrevious)
    XCTAssertEqual("」".japaneseTokenLineBreakBehavior, .attachesToPrevious)
    XCTAssertEqual("「".japaneseTokenLineBreakBehavior, .attachesToNext)
    XCTAssertEqual("3.14".japaneseTokenLineBreakBehavior, .normal)
  }

  func testSentenceLayoutKeepsClosingPunctuationWithItsPrecedingToken() {
    let result = JapaneseTokenLineLayout.arrange(
      items: [
        .init(size: CGSize(width: 30, height: 20), lastTextBaseline: 15, breakBehavior: .normal),
        .init(size: CGSize(width: 15, height: 20), lastTextBaseline: 15, breakBehavior: .normal),
        .init(
          size: CGSize(width: 10, height: 20),
          lastTextBaseline: 15,
          breakBehavior: .attachesToPrevious
        ),
      ],
      availableWidth: 50,
      itemSpacing: 0,
      lineSpacing: 3
    )

    XCTAssertEqual(result.origins[0], CGPoint(x: 0, y: 0))
    XCTAssertGreaterThan(result.origins[1].y, result.origins[0].y)
    XCTAssertEqual(result.origins[1].y, result.origins[2].y)
    XCTAssertEqual(result.origins[2].x, 15)
  }

  func testSentenceLayoutKeepsOpeningPunctuationWithItsFollowingToken() {
    let result = JapaneseTokenLineLayout.arrange(
      items: [
        .init(size: CGSize(width: 30, height: 20), lastTextBaseline: 15, breakBehavior: .normal),
        .init(
          size: CGSize(width: 10, height: 20),
          lastTextBaseline: 15,
          breakBehavior: .attachesToNext
        ),
        .init(size: CGSize(width: 15, height: 20), lastTextBaseline: 15, breakBehavior: .normal),
      ],
      availableWidth: 35,
      itemSpacing: 0,
      lineSpacing: 3
    )

    XCTAssertGreaterThan(result.origins[1].y, result.origins[0].y)
    XCTAssertEqual(result.origins[1].y, result.origins[2].y)
    XCTAssertEqual(result.origins[2].x, 10)
  }

  func testSentenceLayoutAlignsMixedFuriganaAndPlainTextByBaseBaseline() {
    let items = [
      JapaneseTokenLineLayout.Item(
        size: CGSize(width: 30, height: 40),
        lastTextBaseline: 34,
        breakBehavior: .normal
      ),
      JapaneseTokenLineLayout.Item(
        size: CGSize(width: 15, height: 20),
        lastTextBaseline: 14,
        breakBehavior: .normal
      ),
    ]
    let result = JapaneseTokenLineLayout.arrange(
      items: items,
      availableWidth: 100,
      itemSpacing: 0,
      lineSpacing: 3
    )

    XCTAssertEqual(result.origins[0].x, 0)
    XCTAssertEqual(result.origins[1].x, 30, "Source-adjacent tokens must not gain whitespace")
    XCTAssertEqual(
      result.origins[0].y + items[0].lastTextBaseline,
      result.origins[1].y + items[1].lastTextBaseline
    )
  }

  func testSentenceLayoutRemainsDeterministicForLongTokenStreams() {
    let items = (0..<500).map { _ in
      JapaneseTokenLineLayout.Item(
        size: CGSize(width: 10, height: 20),
        lastTextBaseline: 15,
        breakBehavior: .normal
      )
    }
    let first = JapaneseTokenLineLayout.arrange(
      items: items,
      availableWidth: 100,
      itemSpacing: 0,
      lineSpacing: 2
    )
    let second = JapaneseTokenLineLayout.arrange(
      items: items,
      availableWidth: 100,
      itemSpacing: 0,
      lineSpacing: 2
    )

    XCTAssertEqual(first.origins, second.origins)
    XCTAssertEqual(first.size, second.size)
    XCTAssertEqual(first.origins.count, 500)
    XCTAssertEqual(first.size.height, 1_098)
  }

  func testMixedKanjiKanaWordAnnotatesOnlyTheKanjiBearingSpan() {
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "女らしい", reading: "おんならしい"),
      [
        JapaneseRubySegment(base: "女", reading: "おんな"),
        JapaneseRubySegment(base: "らしい", reading: nil),
      ]
    )
  }

  func testOkuriganaAndKanaPrefixesAnchorKanjiReadings() {
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "食べる", reading: "たべる"),
      [
        JapaneseRubySegment(base: "食", reading: "た"),
        JapaneseRubySegment(base: "べる", reading: nil),
      ]
    )
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "お祝い", reading: "おいわい"),
      [
        JapaneseRubySegment(base: "お", reading: nil),
        JapaneseRubySegment(base: "祝", reading: "いわ"),
        JapaneseRubySegment(base: "い", reading: nil),
      ]
    )
  }

  func testMultipleKanjiRunsUseEachVisibleKanaAnchor() {
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "取り扱う", reading: "とりあつかう"),
      [
        JapaneseRubySegment(base: "取", reading: "と"),
        JapaneseRubySegment(base: "り", reading: nil),
        JapaneseRubySegment(base: "扱", reading: "あつか"),
        JapaneseRubySegment(base: "う", reading: nil),
      ]
    )
  }

  func testAllKanjiAndKanaOnlyWordsKeepSimpleRendering() {
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "今日", reading: "きょう"),
      [JapaneseRubySegment(base: "今日", reading: "きょう")]
    )
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "こんにちは", reading: "こんにちは"),
      [JapaneseRubySegment(base: "こんにちは", reading: nil)]
    )
  }

  func testUnalignableMixedWordOmitsRubyInsteadOfAnnotatingTheWholeWord() {
    XCTAssertEqual(
      JapaneseRubyAnnotation.segments(surface: "女らしい", reading: "おんなっぽい"),
      [
        JapaneseRubySegment(base: "女", reading: nil),
        JapaneseRubySegment(base: "らしい", reading: nil),
      ]
    )
  }
}
