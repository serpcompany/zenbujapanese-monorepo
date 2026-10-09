import Testing
@testable import SearchExperience

@Suite("Search result relevance and frequency ordering")
struct SearchResultOrderingTests {
  @Test("a first meaning with a note in parentheses is as direct as an exact one, so frequency decides")
  func notedFirstMeaningMatchesExactFirstMeaning() async throws {
    let dog = try await LookupClient.live.search(SearchQuery("dog"))
    let notedInu = try #require(dog.entries.first { $0.headword == "犬" })
    let exactWanko = try #require(dog.entries.first { $0.headword == "ワン子" })
    let mention = try #require(dog.entries.first { $0.headword == "子犬" })
    #expect(dog.relevance(for: notedInu) == dog.relevance(for: exactWanko))
    #expect(dog.relevance(for: exactWanko) < dog.relevance(for: mention))

    let noted = englishRank(priorityPresence: 0, fingerprint: "inu")
    let exact = englishRank(priorityPresence: 1, fingerprint: "wanko")

    let inu = DictionaryEntry.fixture(id: "00000000000000000000000000000004", headword: "犬")
    let wanko = DictionaryEntry.fixture(id: "00000000000000000000000000000005", headword: "ワン子")
    let results = LookupSearchResults(
      items: [
        fixtureEnglishItem(entry: wanko, rank: exact, fallbackOrder: 0),
        fixtureEnglishItem(entry: inu, rank: noted, fallbackOrder: 1),
      ]
    )
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      inu.id: .evidence(fixtureEvidence(id: inu.id, rank: 1_071)),
      wanko.id: .evidence(fixtureEvidence(id: wanko.id, rank: 16_303)),
    ]
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] }).map(\.id)
        == [inu.id, wanko.id]
    )
  }

  @Test("a later meaning and a mention stay below every first meaning, whatever their frequency")
  func laterMeaningsAndMentionsStayBelow() {
    let first = englishRank(priorityPresence: 1, fingerprint: "first")
    let later = englishRank(priorityPresence: 0, senseOrder: 3, fingerprint: "later")
    let mention = englishRank(lane: .tokenGloss, priorityPresence: 0, fingerprint: "mention")
    #expect(first.presentationRank < later.presentationRank)
    #expect(later.presentationRank < mention.presentationRank)
    #expect(
      englishRank(priorityPresence: 0, senseOrder: 1, fingerprint: "a").presentationRank
        == englishRank(priorityPresence: 0, senseOrder: 4, fingerprint: "b").presentationRank)

    let a = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let b = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let c = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "丙")
    let results = LookupSearchResults(
      items: [
        fixtureEnglishItem(entry: c, rank: mention, fallbackOrder: 0),
        fixtureEnglishItem(entry: b, rank: later, fallbackOrder: 1),
        fixtureEnglishItem(entry: a, rank: first, fallbackOrder: 2),
      ]
    )
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      a.id: .evidence(fixtureEvidence(id: a.id, rank: 50_000)),
      b.id: .evidence(fixtureEvidence(id: b.id, rank: 2)),
      c.id: .evidence(fixtureEvidence(id: c.id, rank: 1)),
    ]
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] }).map(\.id)
        == [a.id, b.id, c.id]
    )
  }

  @Test(
    "a meaning counts as the query only when its note in parentheses runs to the end",
    arguments: [
      ("dog", "dog (Canis (lupus) familiaris)", DictionaryMatch.GlossRelation.qualifiedGloss),
      ("dog", "dog", .exactGloss),
      ("see", "to see (a doctor)", .qualifiedInfinitive),
      ("to", "to (take out and) show", .glossToken),
      ("to", "to (nearly) drown", .glossToken),
      ("dog", "dog (pejorative) days", .glossToken),
      ("soft", "soft (and fluffy) (e.g. bed, bread, baked potato)", .qualifiedGloss),
      ("tamagotchi", "tamagotchi (handheld digital pet) (trademark)", .qualifiedGloss),
      ("dog", "dog (a) days (b)", .glossToken),
    ])
  func noteMustEndTheMeaning(
    query: String, gloss: String, expected: DictionaryMatch.GlossRelation
  ) throws {
    let token = try LanguageReferenceData.glossTokenPattern(query)
    #expect(
      LanguageReferenceData.glossRelation(query: query, gloss: gloss, token: token) == expected)
  }

  @Test("without frequency, priority marks lead and romaji that resembles the query only breaks ties")
  func romajiCorroborationOnlyBreaksTies() {
    let marked = englishRank(priorityPresence: 0, corroboration: 1, fingerprint: "marked")
    let corroborated = englishRank(priorityPresence: 1, corroboration: 0, fingerprint: "doggu")
    let plain = englishRank(priorityPresence: 1, corroboration: 1, fingerprint: "plain")
    #expect(corroborated.presentationRank == plain.presentationRank)
    #expect([plain, corroborated, marked].sorted() == [marked, corroborated, plain])
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
    let ordered = SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] })

    #expect(ordered.firstIndex(of: prison)! < ordered.firstIndex(of: villa)!)
    #expect(results.displaySummary(for: villa) == "prison")
  }

  @Test("frequency only changes order for equivalent match evidence")
  func equalRelevanceFrequencyOrdering() {
    let directA = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let directB = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let weaker = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "丙")
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
      SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] }).map(\.id)
        == [directB.id, directA.id, weaker.id]
    )
  }

  @Test("missing and equal frequency evidence retain deterministic dictionary order")
  func frequencyFallback() {
    let first = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let second = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let third = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "丙")
    let results = fixtureResults([first, second, third])
    let evidence: [LanguageReferenceID: FrequencyLookupResult] = [
      first.id: .evidence(fixtureEvidence(id: first.id, rank: 10)),
      second.id: .evidence(fixtureEvidence(id: second.id, rank: 10)),
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] }).map(\.id)
        == [first.id, second.id, third.id]
    )
  }

  @Test("JLPT level orders first and the next dictionary's rank breaks level ties")
  func levelThenRank() {
    let n3 = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let n5Rare = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let n5Common = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "丙")
    let unlisted = DictionaryEntry.fixture(id: "00000000000000000000000000000004", headword: "丁")
    let results = fixtureResults([n3, n5Rare, n5Common, unlisted])
    let jlpt = FrequencyPackDisclosure.fixture(id: "jlpt", displayName: "JLPT", kind: .level)
    func level(_ entry: DictionaryEntry, _ level: JLPTLevel) -> FrequencyLookupResult {
      .level(FrequencyLevelEvidence(pack: jlpt, languageReferenceID: entry.id, level: level))
    }
    func rank(_ entry: DictionaryEntry, _ rank: Int) -> FrequencyLookupResult {
      .evidence(fixtureEvidence(id: entry.id, rank: rank))
    }
    let ranks: [LanguageReferenceID: FrequencyRanks] = [
      n3.id: [level(n3, .n3), rank(n3, 1)],
      n5Rare.id: [level(n5Rare, .n5), rank(n5Rare, 900)],
      n5Common.id: [level(n5Common, .n5), rank(n5Common, 20)],
      unlisted.id: [.noEvidence(pack: jlpt), rank(unlisted, 2)],
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: ranks).map(\.id)
        == [n5Common.id, n5Rare.id, unlisted.id, n3.id])
  }

  @Test("an entry the first dictionary misses places by the next dictionary, not last")
  func unrankedInFirstDictionaryUsesTheNext() {
    let ie = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "家")
    let sumai = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "住まい")
    let okusha = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "屋舎")
    let unranked = DictionaryEntry.fixture(id: "00000000000000000000000000000004", headword: "舎屋")
    let results = fixtureResults([unranked, okusha, sumai, ie])
    let jlpt = FrequencyPackDisclosure.fixture(id: "jlpt", displayName: "JLPT", kind: .level)
    let youTube = fixtureEvidence(id: sumai.id, rank: 1).pack
    let ranks: [LanguageReferenceID: FrequencyRanks] = [
      ie.id: [
        .noEvidence(pack: youTube),
        .level(FrequencyLevelEvidence(pack: jlpt, languageReferenceID: ie.id, level: .n5)),
      ],
      sumai.id: [
        .evidence(fixtureEvidence(id: sumai.id, rank: 7_056)),
        .level(FrequencyLevelEvidence(pack: jlpt, languageReferenceID: sumai.id, level: .n2)),
      ],
      okusha.id: [.evidence(fixtureEvidence(id: okusha.id, rank: 252_598)), .noEvidence(pack: jlpt)],
      unranked.id: [.noEvidence(pack: youTube), .noEvidence(pack: jlpt)],
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: ranks).map(\.headword)
        == ["家", "住まい", "屋舎", "舎屋"])
  }

  @Test("changing active-pack evidence reorders only equivalent results")
  func packSwitch() {
    let first = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let second = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let results = fixtureResults([first, second])
    let packA = [
      first.id: FrequencyLookupResult.evidence(fixtureEvidence(id: first.id, rank: 1)),
      second.id: FrequencyLookupResult.evidence(fixtureEvidence(id: second.id, rank: 2)),
    ]
    let packB = [
      first.id: FrequencyLookupResult.evidence(fixtureEvidence(id: first.id, rank: 2)),
      second.id: FrequencyLookupResult.evidence(fixtureEvidence(id: second.id, rank: 1)),
    ]

    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: packA.mapValues { [$0] }).map(\.id)
        == [first.id, second.id])
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: packB.mapValues { [$0] }).map(\.id)
        == [second.id, first.id])
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: packA.mapValues { [$0] }).map(\.id)
        == [first.id, second.id])
  }

  @Test("unavailable evidence and single-kanji lookup preserve dictionary candidates")
  func unavailableAndSingleKanjiFallback() async throws {
    let results = try await LookupClient.live.search(SearchQuery("静"))
    #expect(!results.entries.isEmpty)
    let unavailable = FrequencyLookupResult.unavailableResults(
      for: results.entries.map(\.id), pack: nil, reason: "fixture")
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: unavailable.mapValues { [$0] }).map(\.id)
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
      .compactMapValues(\.first)
    #expect(numericRank(evidence[entrusted.id]) == 1_966)
    #expect(numericRank(evidence[entrust.id]) == 8_642)
    #expect(numericRank(evidence[defeat.id]) == 39_632)
    #expect(
      SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] }).map(\.id)
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

    try assertRelevanceOrdering(
      in: results,
      crossGroup: ("替え歌", "変える"),
      sameGroup: ("嘉悦大学", "嘉悦女子短大")
    )
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
  lane: DictionaryMatch.EvidenceLane = .strongGloss,
  priorityPresence: Int,
  senseOrder: Int = 0,
  corroboration: Int = 1,
  fingerprint: String
) -> EnglishDictionaryRank {
  EnglishDictionaryRank(
    lane: lane,
    corroborationRank: corroboration,
    romajiSpecificityRank: 0,
    senseOrder: senseOrder,
    priorityPresenceRank: priorityPresence,
    priorityProfile: .unmarked,
    glossOrder: 0,
    headwordLength: 1,
    semanticFingerprint: fingerprint
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
  try assertRelevanceOrdering(
    in: try await LookupClient.live.search(SearchQuery(query)),
    crossGroup: crossGroup,
    sameGroup: sameGroup
  )
}

private func assertRelevanceOrdering(
  in results: LookupSearchResults,
  crossGroup: (stronger: String, weaker: String),
  sameGroup: (first: String, second: String)
) throws {
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
  let ordered = SearchResultFrequencyOrdering.ordered(results, ranks: evidence.mapValues { [$0] })
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
    entry: DictionaryEntry.fixture(id: id, headword: headword),
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

private func fixtureResults(_ entries: [DictionaryEntry]) -> LookupSearchResults {
  LookupSearchResults(
    items: entries.enumerated().map { fixtureItem(entry: $0.element, fallbackOrder: $0.offset) })
}

private func fixtureEvidence(id: LanguageReferenceID, rank: Int) -> FrequencyEvidence {
  .fixture(
    pack: .fixture(id: "fixture", displayName: "Fixture"), languageReferenceID: id, rank: rank)
}

private func numericRank(_ result: FrequencyLookupResult?) -> Int? {
  guard case .evidence(let evidence) = result else { return nil }
  return evidence.rank
}
