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

  @Test("linking answers are held only in a launch that asks for it")
  func heldLinkingIsAskedFor() {
    #expect(LaunchHarness.holdsLinking([LaunchHarness.holdLinkingKey: "1"]))
    #expect(!LaunchHarness.holdsLinking([LaunchHarness.holdLinkingKey: "0"]))
    #expect(!LaunchHarness.holdsLinking([:]))
  }

  @Test("linking fails only for as many answers as a launch asks for")
  func failedLinkingCountsAnswers() {
    #expect(LaunchHarness.linkingFailures([LaunchHarness.failLinkingKey: "2"]) == 2)
    #expect(LaunchHarness.linkingFailures([LaunchHarness.failLinkingKey: "some"]) == 0)
    #expect(LaunchHarness.linkingFailures([:]) == 0)
  }

  @Test("the sign-in stand-in offers Apple even in a build that otherwise can't sign in with it")
  func signInStandInOffersApple() {
    #expect(LaunchHarness.standsInForSignIn([LaunchHarness.signInStandInKey: "1"]))
    #expect(!LaunchHarness.standsInForSignIn([:]))
  }
}
