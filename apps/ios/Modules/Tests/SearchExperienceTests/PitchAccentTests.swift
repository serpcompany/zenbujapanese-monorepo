import Testing
@testable import SearchExperience

@Suite("Pitch accent contour")
struct PitchAccentTests {
  private func accent(_ downstep: Int, _ moraCount: Int) -> PitchAccent {
    PitchAccent(downstep: downstep, moraCount: moraCount, sourceIdentity: "fixture")
  }

  @Test("heiban rises after the first mora and stays high into the particle")
  func heiban() {
    let levels = accent(0, 2).levels(moraCount: 2)
    #expect(levels.morae == [false, true])
    #expect(levels.particle)
  }

  @Test("atamadaka is high on the first mora only")
  func atamadaka() {
    let levels = accent(1, 3).levels(moraCount: 3)
    #expect(levels.morae == [true, false, false])
    #expect(!levels.particle)
  }

  @Test("nakadaka is high from the second mora through the downstep")
  func nakadaka() {
    let levels = accent(2, 3).levels(moraCount: 3)
    #expect(levels.morae == [false, true, false])
    #expect(!levels.particle)
  }

  @Test("odaka stays high on every later mora and drops for the particle")
  func odaka() {
    let levels = accent(2, 2).levels(moraCount: 2)
    #expect(levels.morae == [false, true])
    #expect(!levels.particle)
  }

  @Test("small kana join the preceding mora; sokuon, n, and long vowels stand alone")
  func morae() {
    #expect("キョウ".morae == ["キョ", "ウ"])
    #expect("ガッコウ".morae == ["ガ", "ッ", "コ", "ウ"])
    #expect("ラーメン".morae == ["ラ", "ー", "メ", "ン"])
  }
}
