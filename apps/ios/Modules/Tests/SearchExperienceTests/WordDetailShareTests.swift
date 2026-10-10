import Testing

@testable import SearchExperience

@Suite("What Share sends")
struct WordDetailShareTests {
  @Test("a word sends its headword with its reading, then its numbered meanings")
  func word() async throws {
    let results = try await LookupClient.live.search(SearchQuery("japan"))
    let japan = try #require(results.entries.first { $0.headword == "日本" })
    let text = try #require(WordPage(japan)?.shareText)
    let lines = text.split(separator: "\n").map(String.init)
    #expect(lines.first == "日本【\(japan.reading)】")
    #expect(lines.count == japan.senses.count + 1)
    #expect(lines.dropFirst().first?.hasPrefix("1. ") == true)
  }

  @Test("a word written in kana sends no reading in brackets")
  func kanaWord() {
    #expect(WordPage(DictionaryEntry.fixture(id: "sore", headword: "それ"))?.shareText == "それ")
  }

  @Test("a kanji sends its readings and meanings, or only itself without a reference")
  func kanji() throws {
    let client = KanjiLookupClient.live(lookupClient: .live)
    let text = try client.page(try #require(KanjiCharacter("日")), [], nil).shareText
    #expect(text.hasPrefix("日【"))
    #expect(text.localizedCaseInsensitiveContains("day"))
    #expect(try client.page(try #require(KanjiCharacter("亲")), [], nil).shareText == "亲")
  }
}
