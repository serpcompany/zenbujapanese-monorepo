import Testing
@testable import SearchExperience

@Suite("Search result relevance and frequency ordering")
struct SearchResultOrderingTests {
  @Test("original English fallback is preserved while final relevance remains primary")
  func originalEnglishFallbackAndFinalRelevance() {
    let prioritizedExact = englishRank(priorityPresence: 0, relation: .exactGloss)
    let prioritizedQualified = englishRank(priorityPresence: 0, relation: .qualifiedGloss)
    let unprioritizedExact = englishRank(priorityPresence: 1, relation: .exactGloss)

    let sorted = [prioritizedQualified, unprioritizedExact, prioritizedExact].sorted()

    #expect(prioritizedQualified < unprioritizedExact)
    #expect(
      sorted == [prioritizedExact, prioritizedQualified, unprioritizedExact]
    )

    let qualified = fixtureEntry(
      id: "00000000000000000000000000000004", headword: "qualified")
    let exact = fixtureEntry(id: "00000000000000000000000000000005", headword: "exact")
    let results = LookupSearchResults(
      items: [
        fixtureEnglishItem(entry: qualified, rank: prioritizedQualified, fallbackOrder: 0),
        fixtureEnglishItem(entry: exact, rank: unprioritizedExact, fallbackOrder: 1),
      ]
    )
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      qualified.id: .evidence(fixtureEvidence(id: qualified.id, rank: 1)),
      exact.id: .evidence(fixtureEvidence(id: exact.id, rank: 50_000)),
    ]
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: evidence).map(\.id)
        == [exact.id, qualified.id]
    )
  }

  @Test("legacy best-match rank is preserved for radical result bounds")
  func legacyPresentationRank() {
    let first = JapaneseDictionaryRank(
      relation: .writtenExact,
      priorityProfile: .unmarked,
      senseBreadthRank: -2,
      headwordLength: 1,
      semanticFingerprint: "first"
    )
    let stableFallbackOnly = JapaneseDictionaryRank(
      relation: .writtenExact,
      priorityProfile: .unmarked,
      senseBreadthRank: -2,
      headwordLength: 8,
      semanticFingerprint: "second"
    )
    let differentLegacyBucket = JapaneseDictionaryRank(
      relation: .writtenExact,
      priorityProfile: .unmarked,
      senseBreadthRank: -1,
      headwordLength: 1,
      semanticFingerprint: "third"
    )

    #expect(
      DictionaryLegacyPresentationRank.japanese(first)
        == .japanese(stableFallbackOnly)
    )
    #expect(
      DictionaryLegacyPresentationRank.japanese(first)
        != .japanese(differentLegacyBucket)
    )
  }

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

  @Test("frequency only changes order for equivalent match evidence")
  func equalRelevanceFrequencyOrdering() {
    let directA = fixtureEntry(id: "00000000000000000000000000000001", headword: "甲")
    let directB = fixtureEntry(id: "00000000000000000000000000000002", headword: "乙")
    let weaker = fixtureEntry(id: "00000000000000000000000000000003", headword: "丙")
    let results = LookupSearchResults(
      items: [
        fixtureItem(entry: directA, relation: .writtenExact, fallbackOrder: 0),
        fixtureItem(entry: directB, relation: .writtenExact, fallbackOrder: 1),
        fixtureItem(entry: weaker, relation: .writtenPrefix, fallbackOrder: 2),
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
      items: [first, second, third].enumerated().map {
        fixtureItem(entry: $0.element, fallbackOrder: $0.offset)
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
      items: [first, second].enumerated().map {
        fixtureItem(entry: $0.element, fallbackOrder: $0.offset)
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

  @Test("live Japanese match quality stays primary while frequency inverts an equivalent pair")
  func liveJapaneseGroups() async throws {
    try await assertLiveRelevanceOrdering(
      query: "いる",
      crossGroup: ("要る", "いるか座"),
      sameGroup: ("没る", "癒る")
    )
  }

  @Test("live romaji match quality stays primary while frequency inverts an equivalent pair")
  func liveRomajiGroups() async throws {
    try await assertLiveRelevanceOrdering(
      query: "miru",
      crossGroup: ("見る", "ミルク"),
      sameGroup: ("釬", "廻る")
    )
  }

  @Test("makasete uses frequency between equally relevant makasu matches")
  func liveInflectedRomajiGroups() async throws {
    let query = SearchQuery("makasete")
    #expect(try await LookupClient.live.entryMatchingForm(query.value) == nil)
    let results = try await LookupClient.live.search(query)
    #expect(results.wasDeinflected)

    let entrusted = try #require(results.entries.first { $0.headword == "任せる" })
    let defeat = try #require(results.entries.first { $0.headword == "負かす" })
    let entrust = try #require(results.entries.first { $0.headword == "任す" })
    #expect(results.relevance(for: entrusted) < results.relevance(for: defeat))
    #expect(results.relevance(for: defeat) == results.relevance(for: entrust))

    let capability = try FrequencyCapability.freshBundledTUBELEX()
    let evidence = try await capability.evidence(for: [entrusted.id, defeat.id, entrust.id])
    #expect(numericRank(evidence[entrusted.id]) == 1_966)
    #expect(numericRank(evidence[entrust.id]) == 8_642)
    #expect(numericRank(evidence[defeat.id]) == 39_632)
    #expect(
      SearchResultFrequencyOrdering.ordered(results, evidence: evidence).map(\.id)
        .filter { $0 == entrusted.id || $0 == defeat.id || $0 == entrust.id }
        == [entrusted.id, entrust.id, defeat.id]
    )
  }

  @Test("live deinflection preserves source quality and frequency-orders equivalent matches")
  func liveDeinflectionSameGroupOrdering() async throws {
    let query = SearchQuery("kaetta")
    #expect(try await LookupClient.live.entryMatchingForm(query.value) == nil)
    let results = try await LookupClient.live.search(query)
    #expect(results.wasDeinflected)

    let stronger = try #require(results.entries.first { $0.headword == "替え歌" })
    let weaker = try #require(results.entries.first { $0.headword == "変える" })
    let first = try #require(results.entries.first { $0.headword == "嘉悦大学" })
    let second = try #require(results.entries.first { $0.headword == "嘉悦女子短大" })
    #expect(results.relevance(for: stronger) < results.relevance(for: weaker))
    #expect(results.relevance(for: first) == results.relevance(for: second))

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

  @Test("deinflection composition preserves structured relevance metadata")
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

    #expect(results.relevance(for: primary.entry).sourceOrder == 0)
    #expect(results.relevance(for: alternateA.entry).sourceOrder == 1)
    #expect(results.relevance(for: alternateB.entry).sourceOrder == 1)
    #expect(results.relevance(for: alternateA.entry).matchRank == alternateA.relevance.matchRank)
    #expect(results.relevance(for: alternateB.entry).matchRank == alternateB.relevance.matchRank)
    #expect(results.displaySummary(for: alternateB.entry) == "alternate match b")
  }

}

private func englishRank(
  priorityPresence: Int,
  relation: DictionaryMatch.GlossRelation
) -> EnglishDictionaryRank {
  EnglishDictionaryRank(
    lane: .strongGloss,
    corroborationRank: 0,
    romajiSpecificityRank: 0,
    senseOrder: 0,
    priorityPresenceRank: priorityPresence,
    relation: relation,
    priorityProfile: .unmarked,
    glossOrder: 0,
    headwordLength: 1,
    semanticFingerprint: "fixture-\(priorityPresence)-\(relation.rawValue)"
  )
}

private func fixtureEnglishItem(
  entry: DictionaryEntry,
  rank: EnglishDictionaryRank,
  fallbackOrder: Int
) -> LookupSearchResultItem {
  LookupSearchResultItem(
    entry: entry,
    relevance: DictionaryRelevance(sourceOrder: 0, matchRank: rank.presentationRank),
    fallbackOrder: fallbackOrder,
    matchedSummary: entry.summary
  )
}

private func assertLiveRelevanceOrdering(
  query: String,
  crossGroup: (stronger: String, weaker: String),
  sameGroup: (first: String, second: String)
) async throws {
  let results = try await LookupClient.live.search(SearchQuery(query))
  let stronger = try #require(results.entries.first { $0.headword == crossGroup.stronger })
  let weaker = try #require(results.entries.first { $0.headword == crossGroup.weaker })
  let first = try #require(results.entries.first { $0.headword == sameGroup.first })
  let second = try #require(results.entries.first { $0.headword == sameGroup.second })
  #expect(results.relevance(for: stronger) < results.relevance(for: weaker))
  #expect(results.relevance(for: first) == results.relevance(for: second))

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
  fixtureItem(
    entry: fixtureEntry(id: id, headword: headword),
    sourceOrder: group,
    matchedSummary: matchedSummary
  )
}

private func fixtureItem(
  entry: DictionaryEntry,
  sourceOrder: Int = 0,
  relation: DictionaryMatch.FormRelation = .writtenExact,
  fallbackOrder: Int = 0,
  matchedSummary: String? = nil
) -> LookupSearchResultItem {
  LookupSearchResultItem(
    entry: entry,
    relevance: DictionaryRelevance(
      sourceOrder: sourceOrder,
      matchRank: .japanese(JapaneseDictionaryPresentationRank(relation: relation))
    ),
    fallbackOrder: fallbackOrder,
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

private func numericRank(_ result: FrequencyLookupResult?) -> Int? {
  guard case .evidence(let evidence) = result else { return nil }
  return evidence.rank
}
