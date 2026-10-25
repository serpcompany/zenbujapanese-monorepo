import Foundation

@testable import SearchExperience

struct SearchedScreen {
  let results: LookupSearchResults
  let items: [DictionaryCoreSearchResults.Item]
  let screen: ResultsScreen

  static func search(
    _ text: String,
    using core: PresentationCore? = nil,
    in data: LanguageReferenceData = .shared,
    sort: String = ResultsLearner.defaultSort,
    filter: String = ResultsLearner.noFilter,
    known: [LanguageReferenceID] = [],
    pickedKanji: Bool = false
  ) async throws -> SearchedScreen {
    let query = SearchQuery(text)
    let examples = ExampleSentenceClient.live
    let results = try await data.search(query)
    let request = ResultsScreenRequest(
      query: query,
      results: results.listed,
      exampleCount: await examples.count(query, results),
      learner: ResultsLearner(
        sort: sort, filter: filter, known: known.map(\.rawValue), pickedKanji: pickedKanji))
    return SearchedScreen(
      results: results,
      items: try await data.coreSearch(query.value).items,
      screen: try await request.screen(using: try await presentation(core)))
  }

  private static func presentation(_ core: PresentationCore?) async throws -> PresentationCore {
    if let core { return core }
    return try await .freshInstall()
  }

  static func search(
    _ text: String, ranking ranks: [String: Int]
  ) async throws -> SearchedScreen {
    let entries = try await LookupClient.live.search(SearchQuery(text)).entries
    let values = Dictionary(
      entries.compactMap { entry in ranks[entry.headword].map { (entry.id, $0) } },
      uniquingKeysWith: { first, _ in first })
    let ranked = FrequencyListFixture(.fixture(id: "fixture", displayName: "Fixture"), values)
    return try await search(text, using: PresentationCore(listing: try .listing(ranked)))
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

  func values(from source: String) throws -> [Int?] {
    try list.rows.map { row in
      row.chips.first { $0.source == source }.flatMap { chip in
        Int(chip.value.filter(\.isNumber))
      }
    }
  }
}

extension LanguageReferenceData {
  func coreSearch(_ query: String) async throws -> DictionaryCoreSearchResults {
    try JSONDecoder().decode(
      DictionaryCoreSearchResults.self, from: Data(try await answeredSearch(query).utf8))
  }
}

enum SearchedScreenError: Error {
  case noResults
  case unlistedEntry(String)
}
