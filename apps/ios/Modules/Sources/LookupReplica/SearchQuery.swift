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
    !japaneseSegments.isEmpty && value.unicodeScalars.contains { $0.isASCII && CharacterSet.letters.contains($0) }
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
    if value == "shita" { return [SearchQuery("suru")] }
    if value == "kita" { return [SearchQuery("kuru")] }
    guard value.hasSuffix("ta"), value.count > 3 else { return [] }
    return [SearchQuery(String(value.dropLast(2)) + "ru")]
  }

  private static func isJapanese(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x3040...0x30FF, 0x3400...0x4DBF, 0x4E00...0x9FFF:
      true
    default:
      false
    }
  }
}

struct RomajiRefinement: Hashable, Sendable {
  let literalEnglishQuery: SearchQuery
  let japaneseReading: SearchQuery
}

struct RomajiRefinementPolicy: Sendable {
  static let captured = RomajiRefinementPolicy(
    refinements: [
      SearchQuery("mondai"): RomajiRefinement(
        literalEnglishQuery: SearchQuery("monday"),
        japaneseReading: SearchQuery("もんだい")
      ),
      SearchQuery("nihon"): RomajiRefinement(
        literalEnglishQuery: SearchQuery("nihon"),
        japaneseReading: SearchQuery("にほん")
      ),
    ]
  )

  private let refinements: [SearchQuery: RomajiRefinement]

  func refinement(for query: SearchQuery) -> RomajiRefinement? {
    refinements[query]
  }
}
