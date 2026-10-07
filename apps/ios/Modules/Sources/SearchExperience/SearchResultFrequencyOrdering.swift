import Foundation

struct SearchFrequencyTaskID: Hashable {
  let entryIDs: [LanguageReferenceID]
  let refreshID: Int
}

struct SearchFrequencyLoadState {
  private(set) var activeRequest: SearchFrequencyTaskID?
  private(set) var results: [LanguageReferenceID: FrequencyRanks] = [:]

  mutating func begin(_ request: SearchFrequencyTaskID) {
    activeRequest = request
    results = [:]
  }

  @discardableResult
  mutating func commit(
    _ results: [LanguageReferenceID: FrequencyRanks],
    for request: SearchFrequencyTaskID
  ) -> Bool {
    guard activeRequest == request else { return false }
    self.results = results
    return true
  }
}

struct SearchFrequencyResponse: Sendable {
  let request: SearchFrequencyTaskID
  let results: [LanguageReferenceID: FrequencyRanks]
}

enum SearchFrequencyLoader {
  static func load(
    _ request: SearchFrequencyTaskID,
    using capability: FrequencyCapability
  ) async throws -> SearchFrequencyResponse {
    let results = try await capability.evidence(for: request.entryIDs)
    try Task.checkCancellation()
    return SearchFrequencyResponse(request: request, results: results)
  }
}

enum ResultRank {
  case result(position: Int, count: Int)
  case discovered(position: Int, count: Int)

  var accessibilityValue: String {
    switch self {
    case .result(let position, let count): "Result \(position) of \(count)"
    case .discovered(let position, let count): "Discovered word \(position) of \(count)"
    }
  }
}

enum SearchResultFrequencyOrdering {
  static func ordered(
    _ results: LookupSearchResults,
    entries: [DictionaryEntry]? = nil,
    ranks: [LanguageReferenceID: FrequencyRanks]
  ) -> [DictionaryEntry] {
    let entries = entries ?? results.entries
    return entries.enumerated().sorted { lhs, rhs in
      let lhsRelevance = results.relevance(for: lhs.element)
      let rhsRelevance = results.relevance(for: rhs.element)
      if lhsRelevance != rhsRelevance { return lhsRelevance < rhsRelevance }
      let lhsRanks = ranks[lhs.element.id] ?? []
      let rhsRanks = ranks[rhs.element.id] ?? []
      let lhsTier = lhsRanks.lazy.compactMap(\.tier).first
      let rhsTier = rhsRanks.lazy.compactMap(\.tier).first
      if lhsTier != rhsTier {
        guard let lhsTier else { return false }
        guard let rhsTier else { return true }
        return lhsTier > rhsTier
      }
      for index in 0..<max(lhsRanks.count, rhsRanks.count) {
        let lhsValue = lhsRanks.indices.contains(index) ? lhsRanks[index].sortValue : nil
        let rhsValue = rhsRanks.indices.contains(index) ? rhsRanks[index].sortValue : nil
        switch (lhsValue, rhsValue) {
        case let (.some(left), .some(right)) where left != right:
          return left < right
        case (.some, .none):
          return true
        case (.none, .some):
          return false
        default:
          continue
        }
      }
      let lhsFallback = results.fallbackOrder(for: lhs.element)
      let rhsFallback = results.fallbackOrder(for: rhs.element)
      if lhsFallback != rhsFallback { return lhsFallback < rhsFallback }
      return lhs.element.id.rawValue < rhs.element.id.rawValue
    }.map(\.element)
  }
}
