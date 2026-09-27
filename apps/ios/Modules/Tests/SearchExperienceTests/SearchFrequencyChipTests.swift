import Testing
@testable import SearchExperience

@Suite("Search frequency chips")
struct SearchFrequencyChipTests {
  private let id = LanguageReferenceID(rawValue: "00000000000000000000000000000001")

  @Test("the first dictionary always shows; others show only with a rank")
  func primaryAlwaysShown() {
    let model = SearchFrequencyRankPresentationModel(ranks: [
      .noEvidence(pack: pack("primary")),
      .evidence(evidence(pack: pack("ranked"), rank: 1_234)),
      .noEvidence(pack: pack("unranked")),
    ])
    #expect(model.chips.map(\.packName) == ["primary", "ranked"])
    #expect(model.chips.map(\.inlineText) == ["—", "1,234"])
    #expect(
      model.accessibilityValue
        == "primary has no rank for this entry, ranked frequency rank 1234, very common")
    #expect(model.chips.map(\.tier) == [nil, .veryCommon])
  }

  @Test("a JLPT level reads as a level chip and is hidden when the word is not listed")
  func levelChips() {
    let jlpt = pack("JLPT", kind: .level)
    let listed = SearchFrequencyRankPresentationModel(ranks: [
      .level(FrequencyLevelEvidence(pack: jlpt, languageReferenceID: id, level: .n3)),
      .evidence(evidence(pack: pack("ranked"), rank: 20_000)),
    ])
    #expect(listed.chips.map(\.packName) == ["JLPT", "ranked"])
    #expect(listed.chips.map(\.inlineText) == ["N3", "20,000"])
    #expect(listed.chips.map(\.tier) == [.common, .uncommon])
    #expect(listed.accessibilityValue.hasPrefix("JLPT level N3, "))

    let unlisted = SearchFrequencyRankPresentationModel(ranks: [
      .noEvidence(pack: jlpt),
      .evidence(evidence(pack: pack("ranked"), rank: 12)),
    ])
    #expect(unlisted.chips.map(\.packName) == ["ranked"])
    #expect(SearchFrequencyRankPresentationModel(ranks: [.noEvidence(pack: jlpt)]).chips.isEmpty)
  }

  @Test("JLPT levels map onto the commonness tiers")
  func levelTiers() {
    #expect(
      JLPTLevel.allCases.reversed().map(FrequencyTier.init(level:))
        == [.veryCommon, .veryCommon, .common, .common, .moderate])
  }

  @Test("tiers follow Migaku's rank cutoffs")
  func tierCutoffs() {
    let tiers = [1, 1_500, 1_501, 5_000, 5_001, 15_000, 15_001, 30_000, 30_001]
      .map(FrequencyTier.init(rank:))
    #expect(
      tiers == [
        .veryCommon, .veryCommon, .common, .common, .moderate, .moderate, .uncommon, .uncommon,
        .rare,
      ])
  }

  @Test("collapsing keeps the first chips and counts the rest")
  func collapse() {
    let model = SearchFrequencyRankPresentationModel(ranks: [
      .evidence(evidence(pack: pack("a"), rank: 1)),
      .evidence(evidence(pack: pack("b"), rank: 2)),
      .evidence(evidence(pack: pack("c"), rank: 3)),
    ])
    let one = model.collapsed(to: 1)
    #expect(one.chips.map(\.packName) == ["a"])
    #expect(one.hiddenCount == 2)
    let all = model.collapsed(to: .max)
    #expect(all.chips.count == 3)
    #expect(all.hiddenCount == 0)
  }

  @Test("loading and no enabled dictionary show no chips")
  func emptyStates() {
    #expect(SearchFrequencyRankPresentationModel(ranks: nil).chips.isEmpty)
    let disabled = SearchFrequencyRankPresentationModel(ranks: [])
    #expect(disabled.chips.isEmpty)
    #expect(disabled.accessibilityValue == "No frequency dictionary enabled")
  }

  private func pack(_ name: String, kind: FrequencyPackKind = .rank) -> FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: FrequencyPackID(rawValue: name), kind: kind, displayName: name, domain: "Fixture",
      domainDescription: "Fixture", version: "1", attribution: "Fixture")
  }

  private func evidence(pack: FrequencyPackDisclosure, rank: Int) -> FrequencyEvidence {
    FrequencyEvidence(
      pack: pack, languageReferenceID: id, rank: rank, coveredSourceRows: 1, sourceCount: 0,
      sourceTotalTokens: 0, sourceDocuments: nil, sourceVideos: nil, sourceChannels: nil,
      matchedForm: "fixture", sourcePartOfSpeech: nil, sourceRecordDigest: "fixture",
      mappingRelation: .exactWrittenReading)
  }
}

@Suite("Search frequency unavailable notice")
struct SearchFrequencyUnavailableNoticeTests {
  private let jlpt = FrequencyPackDisclosure(
    id: FrequencyPackID(rawValue: "zenbu.jlpt.waller.levels"), kind: .level,
    displayName: "JLPT Levels",
    domain: "Fixture", domainDescription: "Fixture", version: "1", attribution: "Fixture")
  private let youtube = FrequencyPackDisclosure(
    id: FrequencyPackID(rawValue: "zenbu.tubelex.youtube.ja.unidic-3.1"), kind: .rank,
    displayName: "TUBELEX", domain: "Fixture", domainDescription: "Fixture", version: "1",
    attribution: "Fixture")

  @Test("no notice when every dictionary is available")
  func allAvailable() {
    #expect(
      SearchFrequencyUnavailableNotice.text(for: [
        [.noEvidence(pack: jlpt), .noEvidence(pack: youtube)]
      ]) == nil)
  }

  @Test("a failed first dictionary names it and says the others still order Search")
  func firstUnavailable() {
    let text = SearchFrequencyUnavailableNotice.text(for: [
      [unavailable(jlpt), .noEvidence(pack: youtube)]
    ])
    #expect(text == "JLPT unavailable. Search is ordered by the other enabled dictionaries.")
  }

  @Test("a failed later dictionary is also disclosed")
  func laterUnavailable() {
    let text = SearchFrequencyUnavailableNotice.text(for: [
      [.noEvidence(pack: jlpt), unavailable(youtube)]
    ])
    #expect(text == "YouTube unavailable. Search is ordered by the other enabled dictionaries.")
  }

  @Test("relevance order is claimed only when every dictionary failed")
  func allUnavailable() {
    let text = SearchFrequencyUnavailableNotice.text(for: [[unavailable(jlpt), unavailable(youtube)]])
    #expect(
      text == "Frequency ordering unavailable. Showing dictionary relevance order. Pack unavailable")
  }

  private func unavailable(_ pack: FrequencyPackDisclosure) -> FrequencyLookupResult {
    .unavailable(FrequencyPackUnavailable(pack: pack, reason: "Pack unavailable"))
  }
}
