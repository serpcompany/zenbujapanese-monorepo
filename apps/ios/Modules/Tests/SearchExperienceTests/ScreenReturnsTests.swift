import Testing

@testable import SearchExperience

@MainActor
@Suite("Coming back to a screen")
struct ScreenReturnsTests {
  @Test("closing a screen counts as coming back to the one under it, and opening one doesn't")
  func onlyAClosedScreenCounts() {
    let returns = ScreenReturns()
    returns.stackChanged(from: 0, to: 1)
    returns.stackChanged(from: 1, to: 2)
    returns.stackChanged(from: 2, to: 2)
    #expect(returns.count == 0)

    returns.stackChanged(from: 2, to: 1)
    #expect(returns.count == 1)
    returns.stackChanged(from: 1, to: 2)
    #expect(returns.count == 1)
    returns.stackChanged(from: 2, to: 0)
    #expect(returns.count == 2)
  }
}
