import Testing

@testable import SearchExperience

@Suite("What Share sends")
struct WordDetailShareTests {
  @Test("a word sends its headword with its reading, then its numbered meanings")
  func word() async throws {
    let results = try await LookupClient.live.search(SearchQuery("japan"))
    let japan = try #require(results.entries.first { $0.headword == "日本" })
    let lines = japan.shareText.split(separator: "\n").map(String.init)
    #expect(lines.first == "日本【\(japan.reading)】")
    #expect(lines.count == japan.senses.count + 1)
    #expect(lines.dropFirst().first?.hasPrefix("1. ") == true)
  }

  @Test("a word written in kana sends no reading in brackets")
  func kanaWord() {
    #expect(DictionaryEntry.fixture(id: "sore", headword: "それ").shareText == "それ")
  }

  @Test("a kanji sends its readings and meanings, or only itself without a reference")
  func kanji() async throws {
    let day = try #require(KanjiCharacter("日"))
    let reference = try await KanjiLookupClient.live(lookupClient: .live).entry(day)
    let text = KanjiReferenceEntry.shareText(for: day, reference: reference)
    #expect(text.hasPrefix("日【"))
    #expect(text.localizedCaseInsensitiveContains("day"))
    #expect(KanjiReferenceEntry.shareText(for: day, reference: nil) == "日")
  }
}
