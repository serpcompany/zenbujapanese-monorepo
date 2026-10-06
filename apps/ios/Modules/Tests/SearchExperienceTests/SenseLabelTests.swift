import Testing

@testable import SearchExperience

@Suite struct SenseLabelTests {
  private func sense(_ headword: String, _ matching: (DictionarySense) -> Bool) async throws
    -> DictionarySense
  {
    let entry = try #require(
      try await LookupClient.live.entriesMatchingForm(headword).first { $0.headword == headword })
    let found = entry.senses.first(where: matching)
    return try #require(found)
  }

  @Test func readsUsageLabels() async throws {
    let sense = try await sense("わくわく") { $0.usage != nil }
    #expect(sense.usage?.contains("onomatopoeic") == true)
  }

  @Test func readsSubjectFields() async throws {
    let sense = try await sense("脳梗塞") { $0.fields != nil }
    #expect(sense.fields?.contains("medicine") == true)
  }

  @Test func readsDialects() async throws {
    let sense = try await sense("ちゃうか") { $0.dialects != nil }
    #expect(sense.dialects?.contains("kansai") == true)
  }

  @Test func keepsTheNotesWordDetailShows() async throws {
    let sense = try await sense("召し上がる") { $0.usage?.contains("honorific") == true }
    #expect(sense.notes.contains("Honorific"))
  }
}
