import Foundation

struct SearchResultFilter: Hashable, Sendable, RawRepresentable {
  var hidesKnownWords = false
  var dictionaryFamilies: Set<String> = []

  static let none = SearchResultFilter()
  static let storageKey = "search.result-filter.v1"
  static let allWordsTitle = "All Words"
  static let hideKnownWordsTitle = "Hide Known Words"
  static let unknownWordsTitle = "Unknown Words"
  private static let separator: Character = "|"
  private static let hideKnownToken = "hide-known"
  private static let dictionaryPrefix = "in:"

  init() {}

  init?(rawValue: String) {
    for token in rawValue.split(separator: Self.separator).map(String.init) {
      switch token {
      case Self.hideKnownToken:
        hidesKnownWords = true
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
    let known = hidesKnownWords ? [Self.hideKnownToken] : []
    let dictionaries = dictionaryFamilies.sorted().map { Self.dictionaryPrefix + $0 }
    return (known + dictionaries).joined(separator: String(Self.separator))
  }

  var count: Int {
    (hidesKnownWords ? 1 : 0) + dictionaryFamilies.count
  }

  var isOn: Bool { count > 0 }

  func checking(_ family: String, _ isOn: Bool) -> SearchResultFilter {
    var filter = self
    if isOn {
      filter.dictionaryFamilies.insert(family)
    } else {
      filter.dictionaryFamilies.remove(family)
    }
    return filter
  }

  func keeping(_ dictionaries: [FrequencyPackDisclosure]) -> SearchResultFilter {
    var filter = self
    filter.dictionaryFamilies.formIntersection(dictionaries.map(\.id.family))
    return filter
  }

  func summary(dictionaries: [FrequencyPackDisclosure]) -> String {
    let names = dictionaries.filter { dictionaryFamilies.contains($0.id.family) }.map(\.sortName)
    let dictionaryPart = names.isEmpty ? nil : "in \(names.joined(separator: ", "))"
    switch (hidesKnownWords, dictionaryPart) {
    case (false, nil): return Self.allWordsTitle
    case (false, let part?): return part.prefix(1).uppercased() + part.dropFirst()
    case (true, nil): return Self.unknownWordsTitle
    case (true, let part?): return "Unknown, \(part)"
    }
  }

  var statusSuffix: String? {
    switch count {
    case 0: nil
    case 1: "1 filter"
    default: "\(count) filters"
    }
  }
}

enum SearchResultFiltering {
  static func applied(
    _ filter: SearchResultFilter, dictionaries: [FrequencyPackDisclosure]?,
    ranks: [LanguageReferenceID: FrequencyRanks]
  ) -> SearchResultFilter {
    let readable = (dictionaries ?? []).filter { dictionary in
      ranks.values.contains { entryRanks in
        entryRanks.contains { result in
          if case .unavailable = result { return false }
          return result.pack?.id.family == dictionary.id.family
        }
      }
    }
    return filter.keeping(readable)
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
      if filter.hidesKnownWords, isKnown(entry.id) { return false }
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
