import Foundation
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

  @Test(
    "a word sends its text with the URL of its page on the website, which opens it again",
    arguments: [
      ("7f490a9c9c0da94f4e9474f4efe74be1", "%E8%A6%8B%E3%82%8B-1259290"),
      ("176f4e451cc248ec386ac35f98801f36", "%E9%96%BB%E9%AD%94-1573970"),
      ("fc99db6b36d7725f21e054e1a4f745e7", "%E9%96%BB%E9%AD%94-1573970"),
    ])
  func wordLink(id: String, segment: String) async throws {
    let entry = try #require(try await LookupClient.live.entry(LanguageReferenceID(rawValue: id)))
    let page = try #require(WordPage(entry))
    let shared = SharedPage(word: entry, page: page)
    #expect(shared.title == entry.headword)
    #expect(shared.text == page.shareText)
    let url = try #require(shared.url)
    #expect(url.absoluteString == "https://zenbujapanese.com/dictionary/\(segment)/")
    guard case .open(.word(let opened, nil)) = await LookupClient.live.websiteRoute(url) else {
      Issue.record("\(url) doesn't open Word Detail")
      return
    }
    #expect(opened == entry)
  }

  @Test("a word the website has no page for sends its text alone")
  func wordWithoutLink() {
    let entry = DictionaryEntry.fixture(id: "sore", headword: "それ")
    #expect(
      SharedPage(word: entry, page: WordPage(entry))
        == SharedPage(title: "それ", text: "それ", url: nil))
  }

  @Test(
    "a kanji sends its text with the URL of its search on the website, which searches it again",
    arguments: [("日", "日", "%E6%97%A5"), ("\u{F928}", "廊", "%E5%BB%8A")])
  func kanjiLink(kanji: String, query: String, segment: String) async throws {
    let character = try #require(KanjiCharacter(kanji))
    let page = try KanjiLookupClient.live(lookupClient: .live).page(character, [], nil)
    let shared = SharedPage(kanji: character, page: page)
    #expect(shared.title == kanji)
    #expect(shared.text == page.shareText)
    let url = try #require(shared.url)
    #expect(url.absoluteString == "https://zenbujapanese.com/dictionary/search/\(segment)/")
    #expect(await LookupClient.live.websiteRoute(url) == .search(query))
  }

  @Test("a kanji whose page hasn't loaded sends itself alone")
  func kanjiBeforeItsPage() throws {
    let character = try #require(KanjiCharacter("日"))
    #expect(SharedPage(kanji: character, page: nil) == SharedPage(title: "日", text: "日", url: nil))
  }
}
