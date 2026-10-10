import Foundation
import Testing

@testable import SearchExperience

@Suite("Furigana")
struct JapaneseRubyTests {
  private func segment(
    _ base: String, _ reading: String? = nil, _ kanjiReadings: [String]? = nil
  ) -> JapaneseRubySegment {
    JapaneseRubySegment(base: base, reading: reading, kanjiReadings: kanjiReadings)
  }

  @Test(
    "a compound's reading splits over its kanji when only one split fits",
    arguments: [
      ("弱肉強食", "じゃくにくきょうしょく", ["じゃく", "にく", "きょう", "しょく"]),
      ("記者会見", "きしゃかいけん", ["き", "しゃ", "かい", "けん"]),
      ("学校", "がっこう", ["がっ", "こう"]),
      ("人々", "ひとびと", ["ひと", "びと"]),
    ])
  func splitsEachKanjisReading(kanji: String, reading: String, expected: [String]) {
    #expect(
      JapaneseRuby(surface: kanji, reading: reading).segments
        == [segment(kanji, reading, expected)])
  }

  @Test(
    "an irregular reading stays whole",
    arguments: [("大人", "おとな"), ("今日", "きょう"), ("一日", "ついたち")])
  func irregularReadingsStayWhole(kanji: String, reading: String) {
    #expect(JapaneseRuby(surface: kanji, reading: reading).segments == [segment(kanji, reading)])
  }

  @Test("a word with kana between its kanji reads each kanji run apart")
  func mixedWordsSplitOnlyTheirKanjiRuns() {
    #expect(
      JapaneseRuby(surface: "食べ物", reading: "たべもの").segments
        == [segment("食", "た"), segment("べ"), segment("物", "もの")])
  }

  @Test("a word without kanji, or one whose reading doesn't fit, has no furigana")
  func plainWords() {
    #expect(JapaneseRuby(surface: "たべもの", reading: "たべもの").segments == [segment("たべもの")])
    #expect(JapaneseRuby(surface: "カフェ", reading: "かふぇ").segments == [segment("カフェ")])
    #expect(
      JapaneseRuby(surface: "食べ物", reading: "のみもの").segments
        == [segment("食"), segment("べ"), segment("物")])
  }

  @Test("the same word is read from the core once")
  func remembersAWord() {
    let core = PresentationCore(kanji: { KanjiFiles.bundled })
    let first = core.rubySegments(surface: "学校", reading: "がっこう")
    #expect(first == [segment("学校", "がっこう", ["がっ", "こう"])])
    #expect(core.rubySegments(surface: "学校", reading: "がっこう") == first)
  }

  @Test("without the kanji files a word still reads, unsplit")
  func withoutKanjiFiles() {
    let core = PresentationCore(kanji: { nil })
    #expect(core.rubySegments(surface: "学校", reading: "がっこう") == [segment("学校")])
  }

  @Test("the bundled kanji files hold each kanji, its structure, and each element")
  func bundledKanjiFiles() throws {
    let files = try #require(KanjiFiles.bundled)
    let day = try #require(files.entry("日"))
    let entry = try #require(
      try JSONSerialization.jsonObject(with: Data(day.dropLast())) as? [String: Any])
    #expect(entry["character"] as? String == "日")
    #expect(entry["strokeCount"] as? Int == 4)
    #expect(entry["meanings"] as? [String] == ["day", "sun", "Japan", "counter for days"])
    #expect(day.last == 0)
    #expect(files.entry("あ") == nil)
    #expect(files.structure("校") != nil)
    #expect(files.element("木") != nil)
    let sources = try #require(
      try JSONSerialization.jsonObject(with: Data(files.sources.dropLast())) as? [String: Any])
    #expect(sources["metadataSourceIdentity"] as? String == "edrdg.kanjidic2")
    #expect(sources["componentSourceIdentity"] as? String == "edrdg.kradfile")
    #expect(sources["schema"] as? String == "zenbu.kanji-elements.v1")
    let elements = try #require(sources["elements"] as? [String: String])
    #expect(elements["structureSourceIdentity"] == "kanjium")
    #expect(elements["metadataSourceIdentity"] == "edrdg.kanjidic2")
    #expect(elements["snapshot"]?.isEmpty == false)
    #expect(elements["metadataSourceSnapshot"]?.isEmpty == false)
  }
}
