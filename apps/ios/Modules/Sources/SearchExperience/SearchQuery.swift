import Foundation

struct SearchQuery: Hashable, Sendable {
  let value: String

  init(_ rawValue: String) {
    value = rawValue.precomposedStringWithCompatibilityMapping
      .lowercased()
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
  }

  var isEmpty: Bool { value.isEmpty }
  var isASCII: Bool { value.unicodeScalars.allSatisfy(\.isASCII) }
  var isJapaneseOnly: Bool { !isEmpty && japaneseSegments == [self] }
  var isSingleKanji: Bool { KanjiCharacter(value) != nil }
  var isMixedScript: Bool {
    !japaneseSegments.isEmpty
      && value.unicodeScalars.contains { $0.isASCII && CharacterSet.letters.contains($0) }
  }

  var japaneseSegments: [SearchQuery] {
    var segments: [String] = []
    var current = ""
    for character in value {
      if character.unicodeScalars.allSatisfy(Self.isJapanese) {
        current.append(character)
      } else if !current.isEmpty {
        segments.append(current)
        current = ""
      }
    }
    if !current.isEmpty { segments.append(current) }
    return segments.map(SearchQuery.init)
  }

  var deinflectedCandidates: [SearchQuery] {
    guard isASCII else { return [] }
    var candidates: [SearchQuery] = []
    func append(_ candidate: String) {
      let query = SearchQuery(candidate)
      guard query != self, !candidates.contains(query) else { return }
      candidates.append(query)
    }
    func replaceSuffix(_ suffix: String, with endings: [String]) {
      guard value.hasSuffix(suffix), value.count > suffix.count else { return }
      let stem = String(value.dropLast(suffix.count))
      for ending in endings {
        append(stem + ending)
      }
    }

    // Irregulars remain first because their regular-looking alternatives are
    // valid words too (for example, kita can also be the past of kiru).
    if value == "shita" || value == "shite" { append("suru") }
    if value == "kita" || value == "kite" { append("kuru") }
    if value == "itta" || value == "itte" { append("iku") }

    // Romaji does not retain enough information to identify one base verb for
    // every godan sound change, so return each legitimate dictionary-form
    // candidate. Lookup combines and de-duplicates the forms that exist.
    replaceSuffix("shita", with: ["su"])
    replaceSuffix("shite", with: ["su"])
    replaceSuffix("tta", with: ["u", "tsu", "ru"])
    replaceSuffix("tte", with: ["u", "tsu", "ru"])
    replaceSuffix("nda", with: ["mu", "bu", "nu"])
    replaceSuffix("nde", with: ["mu", "bu", "nu"])
    replaceSuffix("ita", with: ["ku"])
    replaceSuffix("ite", with: ["ku"])
    replaceSuffix("ida", with: ["gu"])
    replaceSuffix("ide", with: ["gu"])
    // A heard or typed -sete form has a high-confidence ichidan base in -seru.
    // Keep the neighboring -su lexical family as additional dictionary results:
    // makasete resolves to 任せる while still exposing distinct 任す / 負かす.
    replaceSuffix("sete", with: ["seru", "su"])
    replaceSuffix("ta", with: ["ru"])
    replaceSuffix("te", with: ["ru"])
    return candidates
  }

  private static func isJapanese(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x3005, 0x3040...0x30FF, 0x3400...0x4DBF, 0x4E00...0x9FFF:
      true
    default:
      false
    }
  }
}

struct LiteralSearchQueryPolicy: Sendable {
  static let referenceCompatible = LiteralSearchQueryPolicy(
    replacements: [SearchQuery("mondai"): SearchQuery("monday")]
  )

  private let replacements: [SearchQuery: SearchQuery]

  func literalQuery(for query: SearchQuery) -> SearchQuery {
    replacements[query] ?? query
  }
}
