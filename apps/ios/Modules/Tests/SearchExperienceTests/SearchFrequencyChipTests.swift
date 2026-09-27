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

  @Test("loading and no enabled dictionary show no chips")
  func emptyStates() {
    #expect(SearchFrequencyRankPresentationModel(ranks: nil).chips.isEmpty)
    let disabled = SearchFrequencyRankPresentationModel(ranks: [])
    #expect(disabled.chips.isEmpty)
    #expect(disabled.accessibilityValue == "No frequency dictionary enabled")
  }

  private func pack(_ name: String) -> FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: FrequencyPackID(rawValue: name), displayName: name, domain: "Fixture",
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
