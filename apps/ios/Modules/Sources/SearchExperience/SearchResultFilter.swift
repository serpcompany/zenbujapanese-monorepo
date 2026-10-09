import Foundation

enum SearchResultFilter: String, CaseIterable, Hashable, Sendable {
  case all
  case known
  case unknown

  static let storageKey = "search.result-filter.v1"

  var title: String {
    switch self {
    case .all: "All"
    case .known: "Known"
    case .unknown: "Unknown"
    }
  }

  var statusSuffix: String? {
    self == .all ? nil : "1 filter"
  }
}

enum SearchResultFiltering {
  static func filtered(
    _ entries: [DictionaryEntry],
    by filter: SearchResultFilter,
    isKnown: (LanguageReferenceID) -> Bool
  ) -> [DictionaryEntry] {
    guard filter != .all else { return entries }
    return entries.filter { isKnown($0.id) == (filter == .known) }
  }

  static func hiddenCountTitle(_ count: Int) -> String {
    count == 1 ? "1 word hidden by filter" : "\(count) words hidden by filter"
  }

  static func announcement(shownCount: Int) -> String {
    shownCount == 1 ? "1 word shown" : "\(shownCount) words shown"
  }
}
