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

    let inu = DictionaryEntry.fixture(id: "00000000000000000000000000000004", headword: "犬")
    let wanko = DictionaryEntry.fixture(id: "00000000000000000000000000000005", headword: "ワン子")
    let results = LookupSearchResults(
      items: [
        fixtureItem(entry: wanko, fallbackOrder: 0),
        fixtureItem(entry: inu, fallbackOrder: 1),
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
    let a = DictionaryEntry.fixture(id: "00000000000000000000000000000001", headword: "甲")
    let b = DictionaryEntry.fixture(id: "00000000000000000000000000000002", headword: "乙")
    let c = DictionaryEntry.fixture(id: "00000000000000000000000000000003", headword: "丙")
    let results = LookupSearchResults(
      items: [
        fixtureItem(entry: c, relevance: 2, fallbackOrder: 0),
        fixtureItem(entry: b, relevance: 1, fallbackOrder: 1),
        fixtureItem(entry: a, relevance: 0, fallbackOrder: 2),
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
        fixtureItem(entry: directA, fallbackOrder: 0),
        fixtureItem(entry: directB, fallbackOrder: 1),
        fixtureItem(entry: weaker, relevance: 1, fallbackOrder: 2),
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
    #expect(results.resolution == .deinflected)

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
    #expect(results.resolution == .deinflected)

    try assertRelevanceOrdering(
      in: results,
      crossGroup: ("替え歌", "変える"),
      sameGroup: ("嘉悦大学", "嘉悦女子短大")
    )
  }
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
  entry: DictionaryEntry,
  relevance: Int = 0,
  fallbackOrder: Int
) -> LookupSearchResultItem {
  LookupSearchResultItem(
    entry: entry,
    relevance: DictionaryRelevance(order: relevance),
    fallbackOrder: fallbackOrder,
    matchedSummary: nil
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
