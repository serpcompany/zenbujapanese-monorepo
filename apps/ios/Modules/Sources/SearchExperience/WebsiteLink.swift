import CryptoKit
import Foundation

enum WebsiteLink: Equatable {
  case word(jmdictEntryNumber: Int, slug: String)
  case search(String)
  case kanji(KanjiCharacter)
  case home

  static let host = "zenbujapanese.com"

  init(_ url: URL) {
    guard url.host()?.lowercased() == Self.host else {
      self = .home
      return
    }
    let segments = url.path(percentEncoded: true)
      .split(separator: "/")
      .map { $0.removingPercentEncoding ?? String($0) }
    self = Self.dictionaryPage(segments) ?? .home
  }

  func route(using lookupClient: LookupClient) async -> WebsiteLinkRoute {
    switch self {
    case .word(let jmdictEntryNumber, let slug):
      let id = LanguageReferenceID(jmdictEntryNumber: jmdictEntryNumber)
      if let entry = try? await lookupClient.entry(id) {
        return .open(.word(entry, nil))
      }
      return slug.isEmpty ? .home : .search(slug)
    case .search(let query):
      return .search(query)
    case .kanji(let character):
      return .open(.kanji(character, nil))
    case .home:
      return .home
    }
  }

  private static func dictionaryPage(_ segments: [String]) -> WebsiteLink? {
    guard segments.count >= 2, segments[0] == "dictionary" else { return nil }
    let page = segments.count >= 3 ? segments[2] : nil
    switch segments[1] {
    case "search":
      guard let query = page?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty
      else { return nil }
      return .search(query)
    case "kanji":
      return page.flatMap(KanjiCharacter.init).map(WebsiteLink.kanji)
    default:
      return word(segments[1])
    }
  }

  private static func word(_ segment: String) -> WebsiteLink? {
    let dash = segment.lastIndex(of: "-")
    let slug = dash.map { segment[..<$0] } ?? ""
    let number = dash.map { segment[segment.index(after: $0)...] } ?? segment[...]
    guard !number.isEmpty, number.allSatisfy({ $0.isASCII && $0.isNumber }),
      let jmdictEntryNumber = Int(number)
    else { return nil }
    return .word(jmdictEntryNumber: jmdictEntryNumber, slug: String(slug))
  }
}

enum WebsiteLinkRoute: Equatable {
  case open(SearchExperienceRoute)
  case search(String)
  case home
}

extension LanguageReferenceID {
  private static let jmdictSourceIdentity = "edrdg.jmdict"

  init(jmdictEntryNumber: Int) {
    let sourceRecord = Data("\(Self.jmdictSourceIdentity)\0\(jmdictEntryNumber)".utf8)
    self.init(rawValue: SHA256.hash(data: sourceRecord).prefix(16).hexString)
  }
}
