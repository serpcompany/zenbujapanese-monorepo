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
