import Foundation

enum FrequencySortDirection: String, CaseIterable, Hashable, Sendable {
  case mostCommonFirst = "most-common-first"
  case leastCommonFirst = "least-common-first"

  var title: String {
    switch self {
    case .mostCommonFirst: "Most Common First"
    case .leastCommonFirst: "Least Common First"
    }
  }

  var shortTitle: String {
    switch self {
    case .mostCommonFirst: "Most Common"
    case .leastCommonFirst: "Least Common"
    }
  }
}

enum KnownWordSortDirection: String, CaseIterable, Hashable, Sendable {
  case knownFirst = "known-first"
  case unknownFirst = "unknown-first"

  var title: String {
    switch self {
    case .knownFirst: "Known First"
    case .unknownFirst: "Unknown First"
    }
  }
}

enum SearchResultSortKey: Hashable, Sendable {
  case relevance
  case frequency(family: String)
  case knownWords

  var initialSort: SearchResultSort {
    switch self {
    case .relevance: .relevance
    case .frequency(let family): .frequency(family: family, .mostCommonFirst)
    case .knownWords: .knownWords(.knownFirst)
    }
  }
}

enum SearchResultSort: Hashable, Sendable, RawRepresentable {
  case relevance
  case frequency(family: String, FrequencySortDirection)
  case knownWords(KnownWordSortDirection)

  static let storageKey = "search.result-sort.v1"
  private static let separator: Character = "|"

  init?(rawValue: String) {
    let parts = rawValue.split(separator: Self.separator).map(String.init)
    switch (parts.first, parts.count) {
    case ("default", 1):
      self = .relevance
    case ("frequency", 3):
      guard let direction = FrequencySortDirection(rawValue: parts[2]) else { return nil }
      self = .frequency(family: parts[1], direction)
    case ("known-words", 2):
      guard let direction = KnownWordSortDirection(rawValue: parts[1]) else { return nil }
      self = .knownWords(direction)
    default:
      return nil
    }
  }

  var rawValue: String {
    switch self {
    case .relevance: "default"
    case .frequency(let family, let direction): "frequency|\(family)|\(direction.rawValue)"
    case .knownWords(let direction): "known-words|\(direction.rawValue)"
    }
  }

  var key: SearchResultSortKey {
    switch self {
    case .relevance: .relevance
    case .frequency(let family, _): .frequency(family: family)
    case .knownWords: .knownWords
    }
  }

  static let relevanceTitle = "Default"
  static let knownWordsTitle = "Known Words"

  func summary(dictionaries: [FrequencyPackDisclosure]) -> String {
    switch self {
    case .relevance:
      Self.relevanceTitle
    case .frequency(let family, let direction):
      "\(Self.name(of: family, in: dictionaries)), \(direction.shortTitle)"
    case .knownWords(let direction):
      "\(Self.knownWordsTitle), \(direction.title)"
    }
  }

  func status(dictionaries: [FrequencyPackDisclosure]) -> String {
    "Sorted by \(summary(dictionaries: dictionaries))"
  }

  func announcement(dictionaries: [FrequencyPackDisclosure]) -> String {
    switch self {
    case .relevance:
      "Sorted by default order"
    case .frequency(let family, let direction):
      "Sorted by \(Self.name(of: family, in: dictionaries)), \(direction.title.lowercased())"
    case .knownWords(let direction):
      "Sorted by known words, \(direction.title.lowercased())"
    }
  }

  private static func name(
    of family: String, in dictionaries: [FrequencyPackDisclosure]
  ) -> String {
    dictionaries.first { $0.id.family == family }?.sortName ?? "Frequency"
  }
}

enum SearchResultSortOrdering {
  static func dictionaries(
    in ranks: [LanguageReferenceID: FrequencyRanks]
  ) -> [FrequencyPackDisclosure]? {
    guard let entryRanks = ranks.values.first else { return nil }
    let packs = entryRanks.compactMap(\.pack)
    return packs.count == entryRanks.count ? packs : nil
  }

  static func applied(
    _ sort: SearchResultSort, dictionaries: [FrequencyPackDisclosure]?
  ) -> SearchResultSort {
    guard case .frequency(let family, _) = sort else { return sort }
    let isEnabled = dictionaries?.contains { $0.id.family == family } ?? false
    return isEnabled ? sort : .relevance
  }

  static func forgetsChoice(
    _ sort: SearchResultSort, dictionaries: [FrequencyPackDisclosure]?
  ) -> Bool {
    dictionaries != nil && applied(sort, dictionaries: dictionaries) != sort
  }

  static func ordered(
    _ entries: [DictionaryEntry],
    by sort: SearchResultSort,
    ranks: [LanguageReferenceID: FrequencyRanks],
    isKnown: (LanguageReferenceID) -> Bool
  ) -> [DictionaryEntry] {
    switch sort {
    case .relevance:
      return entries
    case .frequency(let family, let direction):
      return stablySorted(entries) { entry in
        let result = ranks[entry.id]?.first { $0.pack?.id.family == family }
        guard let value = result?.sortValue else { return [1] }
        return [0, direction == .mostCommonFirst ? value : -value]
      }
    case .knownWords(let direction):
      return stablySorted(entries) { entry in
        [isKnown(entry.id) == (direction == .knownFirst) ? 0 : 1]
      }
    }
  }

  static func chipRanks(_ ranks: FrequencyRanks?, for sort: SearchResultSort) -> FrequencyRanks? {
    guard case .frequency(let family, _) = sort, let ranks else { return ranks }
    let isSorted: (FrequencyLookupResult) -> Bool = { $0.pack?.id.family == family }
    return ranks.filter(isSorted) + ranks.filter { !isSorted($0) }
  }

  private static func stablySorted(
    _ entries: [DictionaryEntry], by key: (DictionaryEntry) -> [Int]
  ) -> [DictionaryEntry] {
    entries.enumerated()
      .map { (key: key($0.element) + [$0.offset], entry: $0.element) }
      .sorted { $0.key.lexicographicallyPrecedes($1.key) }
      .map(\.entry)
  }
}
