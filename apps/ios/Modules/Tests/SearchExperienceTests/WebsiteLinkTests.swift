import Foundation
import Testing

@testable import SearchExperience

@Suite("zenbujapanese.com links")
struct WebsiteLinkTests {
  private func route(_ string: String) async throws -> WebsiteLinkRoute {
    await LookupClient.live.websiteRoute(try #require(URL(string: string)))
  }

  @Test("a word URL opens Word Detail for its JMdict entry number, however it's written")
  func wordLinks() async throws {
    for url in [
      "https://zenbujapanese.com/dictionary/見る-1259290/",
      "https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/",
      "https://zenbujapanese.com/dictionary/見る-1259290",
      "https://ZenbuJapanese.com/dictionary/見る-1259290/?utm_source=tomodachi#examples",
      "https://zenbujapanese.com/dictionary/見る-1259290/conjugations/plain/past/",
      "https://zenbujapanese.com/dictionary/1259290/",
      "https://zenbujapanese.com/dictionary/a-b-1259290/",
    ] {
      guard case .open(.word(let entry, nil)) = try await route(url) else {
        Issue.record("\(url) doesn't open Word Detail")
        continue
      }
      #expect(entry.id.rawValue == "7f490a9c9c0da94f4e9474f4efe74be1", "\(url)")
      #expect(entry.headword == "見る", "\(url)")
    }
  }

  @Test("a word the bundled dictionary lacks searches its slug, or opens home without one")
  func missingWordRoute() async throws {
    #expect(
      try await route("https://zenbujapanese.com/dictionary/見る-999999999/") == .search("見る"))
    #expect(try await route("https://zenbujapanese.com/dictionary/a-b-999999999/") == .search("a-b"))
    #expect(try await route("https://zenbujapanese.com/dictionary/999999999/") == .home)
  }

  @Test("a search URL searches its query, decoded once")
  func searchLinks() async throws {
    for (url, query) in [
      ("https://zenbujapanese.com/dictionary/search/iru/", "iru"),
      ("https://zenbujapanese.com/dictionary/search/見る/", "見る"),
      ("https://zenbujapanese.com/dictionary/search/to%20eat/", "to eat"),
      ("https://zenbujapanese.com/dictionary/search/a%2Fb/", "a/b"),
      ("https://zenbujapanese.com/dictionary/search/%2E%2E%2E/", "..."),
      ("https://zenbujapanese.com/dictionary/search/100%25/", "100%"),
      ("https://zenbujapanese.com/dictionary/search/iru/examples/", "iru"),
    ] {
      #expect(try await route(url) == .search(query), "\(url)")
    }
  }

  @Test("a kanji URL opens that exact character, never a normalized one")
  func kanjiLinks() async throws {
    #expect(
      try await route("https://zenbujapanese.com/dictionary/kanji/%E8%A6%8B/")
        == .open(.kanji(try #require(KanjiCharacter("見")), nil)))
    let compatibilityIdeograph = try #require(KanjiCharacter("\u{F928}"))
    guard
      case .open(.kanji(let opened, nil)) = try await route(
        "https://zenbujapanese.com/dictionary/kanji/%EF%A4%A8/")
    else {
      Issue.record("a compatibility ideograph's URL doesn't open Kanji Detail")
      return
    }
    #expect(opened.scalar == compatibilityIdeograph.scalar)
  }

  @Test("any other URL opens the app's home")
  func otherLinks() async throws {
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
      #expect(try await route(url) == .home, "\(url)")
    }
  }

  @Test("a link's route opens on Search's stack, or searches, whatever tab it came from")
  func routesApplyToSearch() throws {
    let mi = try #require(KanjiCharacter("見"))
    let ki = try #require(KanjiCharacter("木"))
    var searchPath: [SearchExperienceRoute] = [.kanji(ki, nil)]
    var query = "ki"

    WebsiteLinkRoute.open(.kanji(mi, nil)).apply(to: &searchPath, query: &query)
    #expect(searchPath == [.kanji(ki, nil), .kanji(mi, nil)])
    #expect(query == "ki")

    WebsiteLinkRoute.search("iru").apply(to: &searchPath, query: &query)
    #expect(searchPath.isEmpty)
    #expect(query == "iru")

    searchPath = [.kanji(mi, nil)]
    WebsiteLinkRoute.home.apply(to: &searchPath, query: &query)
    #expect(searchPath.isEmpty)
    #expect(query == "iru")
  }
}
