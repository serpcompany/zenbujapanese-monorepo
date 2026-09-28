import Testing

@testable import SearchExperience

@Suite struct CompoundPitchTests {
  @Test(arguments: [("記者会見", 3), ("自問自答", 4), ("高等学校", 5), ("脳梗塞", 3)])
  func twoPartCompoundsGetEstimatedPitch(headword: String, downstep: Int) async throws {
    let entry = try #require(
      try await LookupClient.live.entriesMatchingForm(headword).first { $0.headword == headword })
    let pitch = try #require(entry.pitchAccent)
    #expect(pitch.downstep == downstep)
    #expect(pitch.sourceIdentity.contains("compound accent rule"))
  }

  @Test func unidicPitchStillWins() async throws {
    let entry = try #require(
      try await LookupClient.live.entriesMatchingForm("食べる").first { $0.headword == "食べる" })
    #expect(entry.pitchAccent?.downstep == 2)
    #expect(entry.pitchAccent?.sourceIdentity.contains("compound") == false)
  }
}
