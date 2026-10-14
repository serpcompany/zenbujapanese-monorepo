import Testing

@testable import SearchExperience

@Suite("Launch harness")
struct LaunchHarnessTests {
  @Test("a fresh start erases saved state only in a UI test build that asks for it")
  func freshStateOnlyInUITestBuilds() {
    let fresh = [LaunchHarness.freshStateKey: "1"]
    #expect(
      LaunchHarness.erasesSavedState(
        environment: fresh, bundleID: "com.zenbujapanese.dictionary.uitests"))
    #expect(
      !LaunchHarness.erasesSavedState(environment: fresh, bundleID: "com.zenbujapanese.dictionary"))
    #expect(
      !LaunchHarness.erasesSavedState(
        environment: fresh, bundleID: "com.zenbujapanese.dictionary.dev"))
    #expect(
      !LaunchHarness.erasesSavedState(
        environment: [:], bundleID: "com.zenbujapanese.dictionary.uitests"))
    #expect(!LaunchHarness.erasesSavedState(environment: fresh, bundleID: nil))
  }

  @Test("each results list Search draws is recorded only when a UI test asks, with how many of its rows have chips")
  func drawnResults() {
    #expect(LaunchHarness.recordsDrawnResults([LaunchHarness.drawnResultsKey: "1"]))
    #expect(!LaunchHarness.recordsDrawnResults([:]))
    let chip = FrequencyChip(pack: "list", source: "List", value: "1", tier: .veryCommon)
    let list = ResultsList(
      query: "q", sections: [.results], menu: nil, forgetsSort: false, examples: nil,
      readingRefinement: nil, heading: nil, kanji: nil,
      rows: [
        ListedWord(id: "a", summary: "", chips: [chip], spoken: ""),
        ListedWord(id: "b", summary: "", chips: [], spoken: ""),
      ], hiddenByFilter: nil, frequencyNotice: nil)
    #expect(DrawnResults.summary(of: list) == "1 of 2 with chips")
  }

  @Test("the sign-in stand-in offers Apple even in a build that otherwise can't sign in with it")
  func signInStandInOffersApple() {
    #expect(LaunchHarness.standsInForSignIn([LaunchHarness.signInStandInKey: "1"]))
    #expect(!LaunchHarness.standsInForSignIn([:]))
  }
}
