import Testing
@testable import SearchExperience

@Suite("Search result relevance and frequency ordering")
struct SearchResultOrderingTests {
  @Test("prison keeps direct matches ahead of an incidental sense and presents the matched sense")
  func prisonRegression() async throws {
    let results = try await LookupClient.live.search(SearchQuery("prison"))
    let villa = try #require(results.entries.first { $0.headword == "別荘" })
    let prison = try #require(results.entries.first { $0.headword == "監獄" })

    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      villa.id: .evidence(fixtureEvidence(id: villa.id, rank: 1)),
      prison.id: .evidence(fixtureEvidence(id: prison.id, rank: 50_000)),
    ]
    let ordered = SearchResultFrequencyOrdering.ordered(results, evidence: evidence)

    #expect(ordered.firstIndex(of: prison)! < ordered.firstIndex(of: villa)!)
    #expect(results.displaySummary(for: villa) == "prison")
  }

  @Test("frequency only changes order within an equal relevance group")
  func equalRelevanceFrequencyOrdering() {
    let directA = fixtureEntry(id: "00000000000000000000000000000001", headword: "甲")
    let directB = fixtureEntry(id: "00000000000000000000000000000002", headword: "乙")
    let weaker = fixtureEntry(id: "00000000000000000000000000000003", headword: "丙")
    let results = LookupSearchResults(
      entries: [directA, directB, weaker],
      relevanceGroups: [directA.id: 0, directB.id: 0, weaker.id: 1]
    )
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      directA.id: .evidence(fixtureEvidence(id: directA.id, rank: 20)),
      directB.id: .evidence(fixtureEvidence(id: directB.id, rank: 10)),
      weaker.id: .evidence(fixtureEvidence(id: weaker.id, rank: 1)),
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: evidence).map(\.id)
        == [directB.id, directA.id, weaker.id]
    )
  }

  @Test("missing and equal frequency evidence retain deterministic dictionary order")
  func frequencyFallback() {
    let first = fixtureEntry(id: "00000000000000000000000000000001", headword: "甲")
    let second = fixtureEntry(id: "00000000000000000000000000000002", headword: "乙")
    let third = fixtureEntry(id: "00000000000000000000000000000003", headword: "丙")
    let results = LookupSearchResults(
      entries: [first, second, third],
      relevanceGroups: [first.id: 0, second.id: 0, third.id: 0]
    )
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      first.id: .evidence(fixtureEvidence(id: first.id, rank: 10)),
      second.id: .evidence(fixtureEvidence(id: second.id, rank: 10)),
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: evidence).map(\.id)
        == [first.id, second.id, third.id]
    )
  }

  @Test("changing active-pack evidence reorders only equivalent results")
  func packSwitch() {
    let first = fixtureEntry(id: "00000000000000000000000000000001", headword: "甲")
    let second = fixtureEntry(id: "00000000000000000000000000000002", headword: "乙")
    let results = LookupSearchResults(
      entries: [first, second], relevanceGroups: [first.id: 0, second.id: 0])
    let packA = [
      first.id: FrequencyLookupResult.evidence(fixtureEvidence(id: first.id, rank: 1)),
      second.id: FrequencyLookupResult.evidence(fixtureEvidence(id: second.id, rank: 2)),
    ]
    let packB = [
      first.id: FrequencyLookupResult.evidence(fixtureEvidence(id: first.id, rank: 2)),
      second.id: FrequencyLookupResult.evidence(fixtureEvidence(id: second.id, rank: 1)),
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: packA).map(\.id)
        == [first.id, second.id])
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: packB).map(\.id)
        == [second.id, first.id])
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: packA).map(\.id)
        == [first.id, second.id])
  }

  @Test("unavailable evidence and single-kanji lookup preserve dictionary candidates")
  func unavailableAndSingleKanjiFallback() async throws {
    let results = try await LookupClient.live.search(SearchQuery("静"))
    #expect(!results.entries.isEmpty)
    let unavailable = FrequencyLookupResult.unavailableResults(
      for: results.entries.map(\.id), pack: nil, reason: "fixture")
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: unavailable).map(\.id)
        == results.entries.map(\.id)
    )
  }

  @Test(arguments: ["いる", "miru"])
  func japaneseAndRomajiSearchesExposeRelevanceGroups(_ query: String) async throws {
    let results = try await LookupClient.live.search(SearchQuery(query))
    #expect(!results.entries.isEmpty)
    #expect(results.entries.allSatisfy { results.relevanceGroup(for: $0) >= 0 })
  }
}

private func fixtureEntry(id: String, headword: String) -> DictionaryEntry {
  DictionaryEntry(
    id: LanguageReferenceID(rawValue: id),
    noteID: WordNoteID(rawValue: id),
    sourceProvenances: [
      LanguageReferenceProvenance(sourceIdentity: "fixture", sourceRecordID: id)
    ],
    reading: headword,
    headword: headword,
    summary: headword,
    meanings: [headword],
    partsOfSpeech: [],
    writtenForms: [],
    readingForms: [],
    senses: [],
    relationships: [],
    pitchAccent: nil,
    isCommon: false
  )
}

private func fixtureEvidence(id: LanguageReferenceID, rank: Int) -> FrequencyEvidence {
  FrequencyEvidence(
    pack: FrequencyPackDisclosure(
      id: FrequencyPackID(rawValue: "fixture"),
      displayName: "Fixture",
      domain: "Fixture",
      domainDescription: "Fixture",
      version: "1",
      attribution: "Fixture"
    ),
    languageReferenceID: id,
    rank: rank,
    coveredSourceRows: 1,
    sourceCount: 0,
    sourceTotalTokens: 0,
    sourceDocuments: nil,
    sourceVideos: nil,
    sourceChannels: nil,
    matchedForm: "fixture",
    sourcePartOfSpeech: nil,
    sourceRecordDigest: "fixture",
    mappingRelation: .exactWrittenReading
  )
}
