import Testing

@testable import SearchExperience

@Suite("Search result relevance and frequency ordering")
struct SearchResultOrderingTests {
  @Test("a first meaning with a note in parentheses is as direct as an exact one, so frequency decides")
  func notedFirstMeaningMatchesExactFirstMeaning() async throws {
    let dog = try await SearchedScreen.search("dog", ranking: ["犬": 1_071, "ワン子": 16_303, "子犬": 1])
    #expect(try dog.relevance(of: "犬") == dog.relevance(of: "ワン子"))
    #expect(try dog.relevance(of: "ワン子") < dog.relevance(of: "子犬"))
    #expect(try dog.place(of: "犬") < dog.place(of: "ワン子"))
    #expect(try dog.place(of: "ワン子") < dog.place(of: "子犬"))
  }

  @Test("prison keeps direct matches ahead of an incidental sense and presents the matched sense")
  func prisonRegression() async throws {
    let prison = try await SearchedScreen.search("prison", ranking: ["別荘": 1, "監獄": 50_000])
    #expect(try prison.place(of: "監獄") < prison.place(of: "別荘"))
    let villa = try prison.entry(written: "別荘").id.rawValue
    #expect(try prison.list.rows.first { $0.id == villa }?.summary == "prison")
  }

  @Test("unavailable evidence and single-kanji lookup preserve dictionary candidates")
  func unavailableAndSingleKanjiFallback() async throws {
    let unreadable = FrequencyLists()
    unreadable.publish(unavailable: "fixture")
    let quiet = try await SearchedScreen.search("静", using: PresentationCore(listing: unreadable))
    #expect(!quiet.results.entries.isEmpty)
    #expect(try quiet.list.rows.map(\.id) == quiet.results.entries.map(\.id.rawValue))
    #expect(try quiet.list.kanji?.character == "静")
    #expect(
      try quiet.list.frequencyNotice
        == "Frequency ordering unavailable. Showing dictionary relevance order. fixture")
  }

  @Test("live Japanese match quality stays primary while frequency inverts an equivalent pair")
  func liveJapaneseGroups() async throws {
    try await assertLiveRelevanceOrdering(
      query: "いる", crossGroup: ("要る", "いるか座"), sameGroup: ("没る", "癒る"))
  }

  @Test("live romaji match quality stays primary while frequency inverts an equivalent pair")
  func liveRomajiGroups() async throws {
    try await assertLiveRelevanceOrdering(
      query: "miru", crossGroup: ("見る", "ミルク"), sameGroup: ("釬", "廻る"))
  }

  @Test("makasete uses frequency between equally relevant makasu matches")
  func liveInflectedRomajiGroups() async throws {
    #expect(try await LookupClient.live.entryMatchingForm("makasete") == nil)
    let youTube = try #require(
      try FrequencyPackCatalog.bundled().packs.first { $0.bundled && $0.packKind == .rank })
    let onlyYouTube = FrequencyLists()
    onlyYouTube.publish([
      EnabledFrequencyList(
        dictionary: youTube.disclosure,
        file: .verified(
          try #require(try FrequencyPackCatalog.bundled().bundledArtifactURLs()[youTube.packID])))
    ])
    let entrusted = try await SearchedScreen.search(
      "makasete", using: PresentationCore(listing: onlyYouTube))
    #expect(entrusted.results.resolution == .deinflected)
    #expect(try entrusted.relevance(of: "任せる") < entrusted.relevance(of: "負かす"))
    #expect(try entrusted.relevance(of: "負かす") == entrusted.relevance(of: "任す"))
    let chips = try Dictionary(
      entrusted.list.rows.map { (try entrusted.entry($0.id).headword, $0.chips.map(\.value)) },
      uniquingKeysWith: { first, _ in first })
    #expect(chips["任せる"] == ["1,966"])
    #expect(chips["任す"] == ["8,642"])
    #expect(chips["負かす"] == ["39,632"])
    #expect(try entrusted.place(of: "任せる") < entrusted.place(of: "任す"))
    #expect(try entrusted.place(of: "任す") < entrusted.place(of: "負かす"))
  }

  @Test("live deinflection preserves source quality and frequency-orders equivalent matches")
  func liveDeinflectionSameGroupOrdering() async throws {
    #expect(try await LookupClient.live.entryMatchingForm("kaetta") == nil)
    let returned = try await assertLiveRelevanceOrdering(
      query: "kaetta", crossGroup: ("替え歌", "変える"), sameGroup: ("嘉悦大学", "嘉悦女子短大"))
    #expect(returned.results.resolution == .deinflected)
  }

  @discardableResult
  private func assertLiveRelevanceOrdering(
    query: String,
    crossGroup: (stronger: String, weaker: String),
    sameGroup: (first: String, second: String)
  ) async throws -> SearchedScreen {
    let found = try await SearchedScreen.search(
      query,
      ranking: [
        crossGroup.stronger: 50_000, crossGroup.weaker: 1, sameGroup.first: 50_000,
        sameGroup.second: 1,
      ])
    #expect(try found.relevance(of: crossGroup.stronger) < found.relevance(of: crossGroup.weaker))
    #expect(try found.relevance(of: sameGroup.first) == found.relevance(of: sameGroup.second))
    #expect(try found.place(of: crossGroup.stronger) < found.place(of: crossGroup.weaker))
    #expect(try found.place(of: sameGroup.second) < found.place(of: sameGroup.first))
    return found
  }
}
