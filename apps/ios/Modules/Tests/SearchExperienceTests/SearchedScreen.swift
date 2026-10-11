import Foundation

@testable import SearchExperience

struct SearchedScreen {
  let results: LookupSearchResults
  let items: [DictionaryCoreSearchResults.Item]
  let screen: ResultsScreen
  let frequency: LearnerFrequency?

  static func search(
    _ text: String,
    frequency capability: FrequencyCapability? = nil,
    sort: String = ResultsLearner.defaultSort,
    filter: String = ResultsLearner.noFilter,
    known: [LanguageReferenceID] = [],
    fromRadicals: Bool = false
  ) async throws -> SearchedScreen {
    let query = SearchQuery(text)
    let examples = ExampleSentenceClient.live
    let results = try await LookupClient.live.search(query)
    var request = ResultsScreenRequest(
      query: query,
      results: results.listed,
      exampleCount: await examples.count(query, results),
      learner: ResultsLearner(
        sort: sort, filter: filter, known: known.map(\.rawValue), fromRadicals: fromRadicals))
    var screen = try await request.screen()
    if let capability, case .results(let loading) = screen {
      try await request.loadFrequency(for: loading, using: capability)
      screen = try await request.screen()
    }
    return SearchedScreen(
      results: results,
      items: try await LanguageReferenceData.shared.coreSearch(query.value).items,
      screen: screen,
      frequency: request.learner.frequency)
  }

  var list: ResultsList {
    get throws {
      guard case .results(let list) = screen else { throw SearchedScreenError.noResults }
      return list
    }
  }

  var headwords: [String] {
    get throws { try list.rows.map { try entry($0.id).headword } }
  }

  func entry(_ id: String) throws -> DictionaryEntry {
    guard let entry = results.entries.first(where: { $0.id.rawValue == id }) else {
      throw SearchedScreenError.unlistedEntry(id)
    }
    return entry
  }

  func entry(written headword: String) throws -> DictionaryEntry {
    guard let entry = results.entries.first(where: { $0.headword == headword }) else {
      throw SearchedScreenError.unlistedEntry(headword)
    }
    return entry
  }

  func relevance(of headword: String) throws -> Int {
    let id = try entry(written: headword).id.rawValue
    guard let item = items.first(where: { $0.id == id }) else {
      throw SearchedScreenError.unlistedEntry(headword)
    }
    return item.relevance
  }

  func place(of headword: String) throws -> Int {
    let id = try entry(written: headword).id.rawValue
    guard let place = try list.rows.firstIndex(where: { $0.id == id }) else {
      throw SearchedScreenError.unlistedEntry(headword)
    }
    return place
  }
}

extension ResultsScreenRequest {
  mutating func loadFrequency(
    for list: ResultsList, using capability: FrequencyCapability
  ) async throws {
    let ids = list.frequencyEntries.map(LanguageReferenceID.init(rawValue:))
    let ranks = try await SearchFrequencyLoader.load(
      SearchFrequencyTaskID(entryIDs: ids, refreshID: 0), using: capability
    ).results
    learner.frequency = LearnerFrequency(ranks, for: ids)
  }
}

enum SearchedScreenError: Error {
  case noResults
  case unlistedEntry(String)
}

extension FrequencyCapability {
  static let fixturePack = FrequencyPackDisclosure.fixture(id: "fixture", displayName: "Fixture")

  static func ranking(
    _ ranks: [String: Int], in pack: FrequencyPackDisclosure = fixturePack,
    of headwords: @escaping @Sendable (LanguageReferenceID) -> String?
  ) -> FrequencyCapability {
    FrequencyCapability { ids in
      Dictionary(
        uniqueKeysWithValues: ids.map { id in
          let rank = headwords(id).flatMap { ranks[$0] }
          let result: FrequencyLookupResult =
            rank.map {
              .evidence(.fixture(pack: pack, languageReferenceID: id, rank: $0))
            } ?? .noEvidence(pack: pack)
          return (id, [result])
        })
    }
  }
}
