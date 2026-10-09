import Testing
@testable import SearchExperience

@Suite("English searches lead with the common word a learner expects")
struct EnglishSearchCommonWordTests {
  @Test(
    "the most common word whose first meaning is the query comes first",
    arguments: [
      ("dog", "犬"), ("water", "水"), ("cat", "猫"), ("eat", "食べる"), ("house", "家"),
    ])
  func commonWordLeads(query: String, expected: String) async throws {
    let frequency = try FrequencyPackManager.freshInstall(storagePrefix: "EnglishCommonWord-\(query)")
    let results = try await LookupClient.live.search(SearchQuery(query))
    let presented = SearchResultsScreen.presentedEntries(results, rankedEntryLimit: nil)
    let capability = FrequencyCapability(batchLookup: { ids in
      try await frequency.evidence(for: ids)
    })
    let ranks = try await SearchFrequencyLoader.load(
      SearchFrequencyTaskID(
        entryIDs: SearchResultsScreen.displayedEntryIDs(presented), refreshID: 0),
      using: capability
    ).results
    let ordered = SearchResultFrequencyOrdering.ordered(
      results, entries: presented, ranks: ranks)
    #expect(ordered.first?.headword == expected)
  }
}
