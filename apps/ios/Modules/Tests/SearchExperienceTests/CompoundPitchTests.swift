import Testing

@testable import SearchExperience

@Suite struct CompoundPitchTests {
  private func page(_ headword: String) async throws -> WordPage {
    let entry = try #require(
      try await LookupClient.live.entriesMatchingForm(headword).first { $0.headword == headword })
    return try #require(WordPage(entry))
  }

  @Test(arguments: [
    ("記者会見", 3), ("高等学校", 5), ("脳梗塞", 3),
    ("警察官", 4), ("会社員", 3), ("二酸化炭素", 5),
    ("クレジットカード", 6), ("レンタルビデオ", 5),
  ])
  func compoundsGetPitchEstimatedFromTheirParts(headword: String, downstep: Int) async throws {
    let pitch = try #require(try await page(headword).pitch)
    #expect(pitch.downstep == downstep)
    #expect(pitch.source.contains("compound accent rule"))
  }

  @Test(arguments: ["弱肉強食", "自問自答", "個人的", "観光客"])
  func wordsTheCompoundRulesLeaveOutShowNoPitch(headword: String) async throws {
    #expect(try await page(headword).pitch == nil)
  }

  @Test func unidicPitchStillWins() async throws {
    let pitch = try #require(try await page("食べる").pitch)
    #expect(pitch.downstep == 2)
    #expect(!pitch.source.contains("compound"))
  }
}
