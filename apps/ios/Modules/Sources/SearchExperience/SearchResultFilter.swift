import Foundation

struct SearchResultFilter: Hashable, Sendable, RawRepresentable {
  var knownWords = false
  var unknownWords = false
  var dictionaryFamilies: Set<String> = []

  static let none = SearchResultFilter()
  static let storageKey = "search.result-filter.v1"
  static let allWordsTitle = "All Words"
  static let knownWordsTitle = "Known Words"
  static let unknownWordsTitle = "Unknown Words"
  private static let separator: Character = "|"
  private static let knownToken = "known"
  private static let unknownToken = "unknown"
  private static let dictionaryPrefix = "in:"

  init() {}

  init?(rawValue: String) {
    for token in rawValue.split(separator: Self.separator).map(String.init) {
      switch token {
      case Self.knownToken:
        knownWords = true
      case Self.unknownToken:
        unknownWords = true
      case let token where token.hasPrefix(Self.dictionaryPrefix):
        let family = String(token.dropFirst(Self.dictionaryPrefix.count))
        guard !family.isEmpty else { return nil }
        dictionaryFamilies.insert(family)
      default:
        return nil
      }
    }
  }

  var rawValue: String {
    let known = knownWords ? [Self.knownToken] : []
    let unknown = unknownWords ? [Self.unknownToken] : []
    let dictionaries = dictionaryFamilies.sorted().map { Self.dictionaryPrefix + $0 }
    return (known + unknown + dictionaries).joined(separator: String(Self.separator))
  }

  var count: Int {
    (knownWords ? 1 : 0) + (unknownWords ? 1 : 0) + dictionaryFamilies.count
  }

  var isOn: Bool { count > 0 }

  func keeping(_ dictionaries: [FrequencyPackDisclosure]) -> SearchResultFilter {
    var filter = self
    filter.dictionaryFamilies.formIntersection(dictionaries.map(\.id.family))
    return filter
  }

  func summary(dictionaries: [FrequencyPackDisclosure]) -> String {
    let names = dictionaries.filter { dictionaryFamilies.contains($0.id.family) }.map(\.sortName)
    let dictionaryPart = names.isEmpty ? nil : "in \(names.joined(separator: ", "))"
    switch (knownStatus, dictionaryPart) {
    case (nil, nil): return Self.allWordsTitle
    case (nil, let part?): return part.prefix(1).uppercased() + part.dropFirst()
    case (let known?, nil): return known ? Self.knownWordsTitle : Self.unknownWordsTitle
    case (let known?, let part?): return "\(known ? "Known" : "Unknown"), \(part)"
    }
  }

  var statusSuffix: String? {
    switch count {
    case 0: nil
    case 1: "1 filter"
    default: "\(count) filters"
    }
  }

  fileprivate var knownStatus: Bool? {
    knownWords == unknownWords ? nil : knownWords
  }
}

enum SearchResultFiltering {
  static func applied(
    _ filter: SearchResultFilter, dictionaries: [FrequencyPackDisclosure]?
  ) -> SearchResultFilter {
    filter.keeping(dictionaries ?? [])
  }

  static func forgetsDictionaries(
    _ filter: SearchResultFilter, dictionaries: [FrequencyPackDisclosure]?
  ) -> Bool {
    guard let dictionaries else { return false }
    return filter.keeping(dictionaries) != filter
  }

  static func filtered(
    _ entries: [DictionaryEntry],
    by filter: SearchResultFilter,
    ranks: [LanguageReferenceID: FrequencyRanks],
    isKnown: (LanguageReferenceID) -> Bool
  ) -> [DictionaryEntry] {
    entries.filter { entry in
      if let known = filter.knownStatus, isKnown(entry.id) != known { return false }
      guard !filter.dictionaryFamilies.isEmpty else { return true }
      return ranks[entry.id]?.contains { result in
        guard let family = result.pack?.id.family else { return false }
        return filter.dictionaryFamilies.contains(family) && result.sortValue != nil
      } ?? false
    }
  }

  static func hiddenCountTitle(_ count: Int) -> String {
    count == 1 ? "1 word hidden by filter" : "\(count) words hidden by filter"
  }

  static func announcement(shownCount: Int) -> String {
    shownCount == 1 ? "1 word shown" : "\(shownCount) words shown"
  }
}
