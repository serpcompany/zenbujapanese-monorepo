import XCTest

@testable import SearchExperience

final class JapaneseRubyAnnotationTests: XCTestCase {
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
