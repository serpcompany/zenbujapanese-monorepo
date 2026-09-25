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
      items: [
        LookupSearchResultItem(entry: directA, relevanceGroup: 0, matchedSummary: nil),
        LookupSearchResultItem(entry: directB, relevanceGroup: 0, matchedSummary: nil),
        LookupSearchResultItem(entry: weaker, relevanceGroup: 1, matchedSummary: nil),
      ]
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
      items: [first, second, third].map {
        LookupSearchResultItem(entry: $0, relevanceGroup: 0, matchedSummary: nil)
      }
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
      items: [first, second].map {
        LookupSearchResultItem(entry: $0, relevanceGroup: 0, matchedSummary: nil)
      })
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

  @Test("live Japanese groups stay primary while frequency inverts an equivalent pair")
  func liveJapaneseGroups() async throws {
    try await assertLiveGroupOrdering(
      query: "いる",
      crossGroup: ("要る", "入る"),
      sameGroup: ("没る", "癒る")
    )
  }

  @Test("live romaji groups stay primary while frequency inverts an equivalent pair")
  func liveRomajiGroups() async throws {
    try await assertLiveGroupOrdering(
      query: "miru",
      crossGroup: ("見る", "診る"),
      sameGroup: ("釬", "廻る")
    )
  }

  @Test("makasete exercises live deinflection and frequency cannot cross its groups")
  func liveInflectedRomajiGroups() async throws {
    let query = SearchQuery("makasete")
    #expect(try await LookupClient.live.entryMatchingForm(query.value) == nil)
    let results = try await LookupClient.live.search(query)
    #expect(results.wasDeinflected)

    let entrusted = try #require(results.entries.first { $0.headword == "任せる" })
    let defeat = try #require(results.entries.first { $0.headword == "負かす" })
    let entrust = try #require(results.entries.first { $0.headword == "任す" })
    #expect(results.relevanceGroup(for: entrusted) < results.relevanceGroup(for: defeat))
    #expect(results.relevanceGroup(for: defeat) < results.relevanceGroup(for: entrust))

    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      entrusted.id: .evidence(fixtureEvidence(id: entrusted.id, rank: 50_000)),
      defeat.id: .evidence(fixtureEvidence(id: defeat.id, rank: 2)),
      entrust.id: .evidence(fixtureEvidence(id: entrust.id, rank: 1)),
    ]
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: evidence).map(\.id)
        == [entrusted.id, defeat.id, entrust.id]
    )
  }

  @Test("live deinflection keeps cross-groups fixed and inverts frequency within one group")
  func liveDeinflectionSameGroupOrdering() async throws {
    let query = SearchQuery("kaetta")
    #expect(try await LookupClient.live.entryMatchingForm(query.value) == nil)
    let results = try await LookupClient.live.search(query)
    #expect(results.wasDeinflected)

    let stronger = try #require(results.entries.first { $0.headword == "替え歌" })
    let weaker = try #require(results.entries.first { $0.headword == "変える" })
    let first = try #require(results.entries.first { $0.headword == "嘉悦大学" })
    let second = try #require(results.entries.first { $0.headword == "嘉悦女子短大" })
    #expect(results.relevanceGroup(for: stronger) < results.relevanceGroup(for: weaker))
    #expect(results.relevanceGroup(for: first) == results.relevanceGroup(for: second))

    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      stronger.id: .evidence(fixtureEvidence(id: stronger.id, rank: 50_000)),
      weaker.id: .evidence(fixtureEvidence(id: weaker.id, rank: 1)),
      first.id: .evidence(fixtureEvidence(id: first.id, rank: 50_000)),
      second.id: .evidence(fixtureEvidence(id: second.id, rank: 1)),
    ]
    let ordered = SearchResultFrequencyOrdering.ordered(results, evidence: evidence)
    #expect(ordered.firstIndex(of: stronger)! < ordered.firstIndex(of: weaker)!)
    #expect(ordered.firstIndex(of: second)! < ordered.firstIndex(of: first)!)
  }

  @Test("deinflection composition rebases whole relevance groups without splitting metadata")
  func deinflectionCompositionPreservesMetadata() {
    let primary = fixtureItem(
      id: "00000000000000000000000000000001", headword: "primary", group: 0,
      matchedSummary: "primary match")
    let alternateA = fixtureItem(
      id: "00000000000000000000000000000002", headword: "alternate-a", group: 4,
      matchedSummary: "alternate match a")
    let alternateB = fixtureItem(
      id: "00000000000000000000000000000003", headword: "alternate-b", group: 4,
      matchedSummary: "alternate match b")

    let results = LookupSearchResults.composing(
      sources: [[primary], [alternateA, alternateB]],
      leadingLexicalEntryCount: 1,
      usesPrimaryEntryExamples: true
    )

    #expect(results.relevanceGroup(for: primary.entry) == 0)
    #expect(results.relevanceGroup(for: alternateA.entry) == 1)
    #expect(results.relevanceGroup(for: alternateB.entry) == 1)
    #expect(results.displaySummary(for: alternateB.entry) == "alternate match b")
  }

}

private func assertLiveGroupOrdering(
  query: String,
  crossGroup: (stronger: String, weaker: String),
  sameGroup: (first: String, second: String)
) async throws {
  let results = try await LookupClient.live.search(SearchQuery(query))
  let stronger = try #require(results.entries.first { $0.headword == crossGroup.stronger })
  let weaker = try #require(results.entries.first { $0.headword == crossGroup.weaker })
  let first = try #require(results.entries.first { $0.headword == sameGroup.first })
  let second = try #require(results.entries.first { $0.headword == sameGroup.second })
  #expect(results.relevanceGroup(for: stronger) < results.relevanceGroup(for: weaker))
  #expect(results.relevanceGroup(for: first) == results.relevanceGroup(for: second))

  var evidence: [LanguageReferenceID: FrequencyLookupResult] = [:]
  evidence[stronger.id] = .evidence(fixtureEvidence(id: stronger.id, rank: 50_000))
  evidence[weaker.id] = .evidence(fixtureEvidence(id: weaker.id, rank: 1))
  evidence[first.id] = .evidence(fixtureEvidence(id: first.id, rank: 50_000))
  evidence[second.id] = .evidence(fixtureEvidence(id: second.id, rank: 1))
  let ordered = SearchResultFrequencyOrdering.ordered(results, evidence: evidence)
  #expect(ordered.firstIndex(of: stronger)! < ordered.firstIndex(of: weaker)!)
  #expect(ordered.firstIndex(of: second)! < ordered.firstIndex(of: first)!)
}

private func fixtureItem(
  id: String,
  headword: String,
  group: Int,
  matchedSummary: String? = nil
) -> LookupSearchResultItem {
  LookupSearchResultItem(
    entry: fixtureEntry(id: id, headword: headword),
    relevanceGroup: group,
    matchedSummary: matchedSummary
  )
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
