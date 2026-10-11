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
    let searched = try await SearchedScreen.search(
      query, frequency: FrequencyCapability { try await frequency.evidence(for: $0) })
    #expect(try searched.headwords.first == expected)
  }
}
