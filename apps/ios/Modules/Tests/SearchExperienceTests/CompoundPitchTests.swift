import Testing

@testable import SearchExperience

@Suite struct CompoundPitchTests {
  private func page(_ headword: String) async throws -> WordPage {
    let entry = try #require(
      try await LookupClient.live.entriesMatchingForm(headword).first { $0.headword == headword })
    return try #require(WordPage(entry))
  }

  @Test(arguments: [("記者会見", 3), ("自問自答", 4), ("高等学校", 5), ("脳梗塞", 3)])
  func twoPartCompoundsGetEstimatedPitch(headword: String, downstep: Int) async throws {
    let pitch = try #require(try await page(headword).pitch)
    #expect(pitch.downstep == downstep)
    #expect(pitch.source.contains("compound accent rule"))
  }

  @Test func unidicPitchStillWins() async throws {
    let pitch = try #require(try await page("食べる").pitch)
    #expect(pitch.downstep == 2)
    #expect(!pitch.source.contains("compound"))
  }
}
