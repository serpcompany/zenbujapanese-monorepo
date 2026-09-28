import Foundation
import Testing

@testable import SearchExperience

@Suite struct KanjiReadingSplitterTests {
  @Test(arguments: [
    ("弱肉強食", "じゃくにくきょうしょく", ["じゃく", "にく", "きょう", "しょく"]),
    ("記者会見", "きしゃかいけん", ["き", "しゃ", "かい", "けん"]),
    ("学校", "がっこう", ["がっ", "こう"]),
    ("人々", "ひとびと", ["ひと", "びと"]),
  ])
  func splitsEachKanjisReading(kanji: String, reading: String, expected: [String]) {
    #expect(KanjiReadingSplitter.split(kanji, reading: reading) == expected)
  }

  @Test(arguments: [("大人", "おとな"), ("今日", "きょう"), ("一日", "ついたち")])
  func irregularReadingsStayWhole(kanji: String, reading: String) {
    #expect(KanjiReadingSplitter.split(kanji, reading: reading) == nil)
    #expect(
      JapaneseRubyAnnotation.segments(surface: kanji, reading: reading)
        == [JapaneseRubySegment(base: kanji, reading: reading)])
  }

  @Test func mixedWordsSplitOnlyTheirKanjiRuns() {
    #expect(
      JapaneseRubyAnnotation.segments(surface: "食べ物", reading: "たべもの")
        == [
          JapaneseRubySegment(base: "食", reading: "た"),
          JapaneseRubySegment(base: "べ", reading: nil),
          JapaneseRubySegment(base: "物", reading: "もの"),
        ])
  }

}
