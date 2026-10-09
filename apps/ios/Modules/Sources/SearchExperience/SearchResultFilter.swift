import Foundation

enum KnownWordFilter: String, CaseIterable, Hashable, Sendable {
  case all
  case known
  case unknown

  var title: String {
    switch self {
    case .all: SearchResultFilter.allTitle
    case .known: "Known"
    case .unknown: "Unknown"
    }
  }
}

struct SearchResultFilter: Hashable, Sendable, RawRepresentable {
  var words = KnownWordFilter.all
  var dictionaryFamily: String?

  static let none = SearchResultFilter()
  static let storageKey = "search.result-filter.v1"
  static let allTitle = "All"
  private static let separator: Character = "|"
  private static let dictionaryPrefix = "in:"

  init() {}

  init?(rawValue: String) {
    for token in rawValue.split(separator: Self.separator).map(String.init) {
      if let words = KnownWordFilter(rawValue: token), words != .all, self.words == .all {
        self.words = words
      } else if token.hasPrefix(Self.dictionaryPrefix), dictionaryFamily == nil {
        let family = String(token.dropFirst(Self.dictionaryPrefix.count))
        guard !family.isEmpty else { return nil }
        dictionaryFamily = family
      } else {
        return nil
      }
    }
  }

  var rawValue: String {
    let words = words == .all ? [] : [words.rawValue]
    let dictionary = dictionaryFamily.map { [Self.dictionaryPrefix + $0] } ?? []
    return (words + dictionary).joined(separator: String(Self.separator))
  }

  var count: Int {
    (words == .all ? 0 : 1) + (dictionaryFamily == nil ? 0 : 1)
  }

  func keeping(_ dictionaries: [FrequencyPackDisclosure]) -> SearchResultFilter {
    guard let dictionaryFamily, !dictionaries.contains(where: { $0.id.family == dictionaryFamily })
    else { return self }
    var filter = self
    filter.dictionaryFamily = nil
    return filter
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

  static func forgetsDictionary(
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
      if filter.words != .all, isKnown(entry.id) != (filter.words == .known) { return false }
      guard let family = filter.dictionaryFamily else { return true }
      return ranks[entry.id]?.contains { result in
        result.pack?.id.family == family && result.sortValue != nil
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
