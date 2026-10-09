import Foundation

enum SearchResultSort: Hashable, Sendable, RawRepresentable {
  case relevance
  case frequency(family: String)
  case knownWords

  static let storageKey = "search.result-sort.v1"
  private static let separator: Character = "|"

  init?(rawValue: String) {
    let parts = rawValue.split(separator: Self.separator).map(String.init)
    switch (parts.first, parts.count) {
    case ("default", 1): self = .relevance
    case ("frequency", 2): self = .frequency(family: parts[1])
    case ("known-words", 1): self = .knownWords
    default: return nil
    }
  }

  var rawValue: String {
    switch self {
    case .relevance: "default"
    case .frequency(let family): "frequency|\(family)"
    case .knownWords: "known-words"
    }
  }

  static let relevanceTitle = "Default"
  static let knownWordsTitle = "Known Words"

  func summary(dictionaries: [FrequencyPackDisclosure]) -> String {
    switch self {
    case .relevance: Self.relevanceTitle
    case .frequency(let family): Self.name(of: family, in: dictionaries)
    case .knownWords: Self.knownWordsTitle
    }
  }

  func status(dictionaries: [FrequencyPackDisclosure]) -> String {
    "Sorted by \(summary(dictionaries: dictionaries))"
  }

  func announcement(dictionaries: [FrequencyPackDisclosure]) -> String {
    switch self {
    case .relevance: "Sorted by default order"
    case .frequency(let family): "Sorted by \(Self.name(of: family, in: dictionaries))"
    case .knownWords: "Sorted by known words"
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
    guard case .frequency(let family) = sort else { return sort }
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
    case .frequency(let family):
      return stablySorted(entries) { entry in
        let result = ranks[entry.id]?.first { $0.pack?.id.family == family }
        guard let value = result?.sortValue else { return [1] }
        return [0, value]
      }
    case .knownWords:
      return stablySorted(entries) { entry in [isKnown(entry.id) ? 0 : 1] }
    }
  }

  static func chipRanks(_ ranks: FrequencyRanks?, for sort: SearchResultSort) -> FrequencyRanks? {
    guard case .frequency(let family) = sort, let ranks else { return ranks }
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
