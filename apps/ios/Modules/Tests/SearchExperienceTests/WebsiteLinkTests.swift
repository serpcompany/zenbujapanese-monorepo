import Foundation
import Testing

@testable import SearchExperience

@Suite("zenbujapanese.com links")
struct WebsiteLinkTests {
  private func link(_ string: String) throws -> WebsiteLink {
    WebsiteLink(try #require(URL(string: string)))
  }

  @Test("a word URL names the word's JMdict entry number, however it's written")
  func wordLinks() throws {
    let miru = WebsiteLink.word(jmdictEntryNumber: 1_259_290, slug: "見る")
    for url in [
      "https://zenbujapanese.com/dictionary/見る-1259290/",
      "https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/",
      "https://zenbujapanese.com/dictionary/見る-1259290",
      "https://ZenbuJapanese.com/dictionary/見る-1259290/?utm_source=tomodachi#examples",
      "https://zenbujapanese.com/dictionary/見る-1259290/conjugations/plain/past/",
    ] {
      #expect(try link(url) == miru, "\(url)")
    }
    #expect(
      try link("https://zenbujapanese.com/dictionary/1259290/")
        == .word(jmdictEntryNumber: 1_259_290, slug: ""))
    #expect(
      try link("https://zenbujapanese.com/dictionary/a-b-123/")
        == .word(jmdictEntryNumber: 123, slug: "a-b"))
  }

  @Test("a search URL searches its query, decoded once")
  func searchLinks() throws {
    #expect(try link("https://zenbujapanese.com/dictionary/search/iru/") == .search("iru"))
    #expect(try link("https://zenbujapanese.com/dictionary/search/見る/") == .search("見る"))
    #expect(try link("https://zenbujapanese.com/dictionary/search/to%20eat/") == .search("to eat"))
    #expect(try link("https://zenbujapanese.com/dictionary/search/a%2Fb/") == .search("a/b"))
    #expect(try link("https://zenbujapanese.com/dictionary/search/%2E%2E%2E/") == .search("..."))
    #expect(try link("https://zenbujapanese.com/dictionary/search/100%25/") == .search("100%"))
    #expect(try link("https://zenbujapanese.com/dictionary/search/iru/examples/") == .search("iru"))
  }

  @Test("a kanji URL opens that exact character, never a normalized one")
  func kanjiLinks() throws {
    #expect(
      try link("https://zenbujapanese.com/dictionary/kanji/%E8%A6%8B/")
        == .kanji(try #require(KanjiCharacter("見"))))
    let compatibilityIdeograph = try #require(KanjiCharacter("\u{F928}"))
    #expect(
      try link("https://zenbujapanese.com/dictionary/kanji/%EF%A4%A8/")
        == .kanji(compatibilityIdeograph))
  }

  @Test("any other URL opens the app's home")
  func otherLinks() throws {
    for url in [
      "https://example.com/dictionary/見る-1259290/",
      "https://zenbujapanese.com.example.com/dictionary/見る-1259290/",
      "https://zenbujapanese.com/",
      "https://zenbujapanese.com/about/",
      "https://zenbujapanese.com/dictionary/",
      "https://zenbujapanese.com/dictionary/search/",
      "https://zenbujapanese.com/dictionary/search/%20/",
      "https://zenbujapanese.com/dictionary/kanji/",
      "https://zenbujapanese.com/dictionary/kanji/ab/",
      "https://zenbujapanese.com/dictionary/kanji/a/",
      "https://zenbujapanese.com/dictionary/見る/",
      "https://zenbujapanese.com/dictionary/見る-/",
      "https://zenbujapanese.com/dictionary/見る-12a/",
      "https://zenbujapanese.com/dictionary/見る-１２３/",
      "https://zenbujapanese.com/dictionary/見る-99999999999999999999999/",
      "https://zenbujapanese.com/legal/privacy/",
    ] {
      #expect(try link(url) == .home, "\(url)")
    }
  }

  @Test("a JMdict entry number gives the Language Reference ID the importer derives from it")
  func languageReferenceIDs() {
    #expect(
      LanguageReferenceID(jmdictEntryNumber: 1_259_290).rawValue
        == "7f490a9c9c0da94f4e9474f4efe74be1")
    #expect(
      LanguageReferenceID(jmdictEntryNumber: 1_358_280).rawValue
        == "042e07f7052f611fed33ddddf37f55fd")
  }

  @Test("a word URL opens Word Detail for its entry in the bundled dictionary")
  func wordRoute() async throws {
    let route = try await link("https://zenbujapanese.com/dictionary/見る-1259290/")
      .route(using: .live)
    guard case .open(.word(let entry, nil)) = route else {
      Issue.record("\(route) doesn't open Word Detail")
      return
    }
    #expect(entry.id.rawValue == "7f490a9c9c0da94f4e9474f4efe74be1")
    #expect(entry.headword == "見る")
  }

  @Test("a word the bundled dictionary lacks searches its slug, or opens home without one")
  func missingWordRoute() async throws {
    #expect(
      try await link("https://zenbujapanese.com/dictionary/見る-999999999/").route(using: .live)
        == .search("見る"))
    #expect(
      try await link("https://zenbujapanese.com/dictionary/999999999/").route(using: .live)
        == .home)
  }

  @Test("search, kanji, and other URLs route without a lookup")
  func otherRoutes() async throws {
    let kanji = try #require(KanjiCharacter("見"))
    #expect(
      try await link("https://zenbujapanese.com/dictionary/search/iru/").route(using: .live)
        == .search("iru"))
    #expect(
      try await link("https://zenbujapanese.com/dictionary/kanji/見/").route(using: .live)
        == .open(.kanji(kanji, nil)))
    #expect(try await link("https://zenbujapanese.com/").route(using: .live) == .home)
  }
}
