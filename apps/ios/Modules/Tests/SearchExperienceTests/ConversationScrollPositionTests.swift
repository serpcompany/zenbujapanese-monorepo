import Testing

@testable import SearchExperience

@Suite("The conversation follows its newest line until the learner scrolls up")
struct ConversationScrollPositionTests {
  private func position(offset: Double, content: Double) -> ConversationScrollPosition {
    ConversationScrollPosition(offset: offset, visibleHeight: 500, contentHeight: content)
  }

  @Test("a new line taller than the margin below the bottom keeps the list following")
  func newLineKeepsFollowing() {
    let atBottom = position(offset: 300, content: 800)
    let grown = position(offset: 300, content: 1_100)
    #expect(!grown.isNearBottom)
    #expect(grown.keepsFollowing(true, after: atBottom))
  }

  @Test("the scroll toward the newest line keeps following on its way down")
  func scrollingDownKeepsFollowing() {
    let start = position(offset: 300, content: 1_100)
    let partway = position(offset: 420, content: 1_100)
    #expect(partway.keepsFollowing(true, after: start))
  }

  @Test("scrolling up stops following, and new lines don't bring it back")
  func scrollingUpStops() {
    let atBottom = position(offset: 300, content: 800)
    let scrolledUp = position(offset: 120, content: 800)
    #expect(!scrolledUp.keepsFollowing(true, after: atBottom))
    let grown = position(offset: 120, content: 1_100)
    #expect(!grown.keepsFollowing(false, after: scrolledUp))
  }

  @Test("scrolling back to the bottom follows again")
  func backAtTheBottomFollows() {
    let scrolledUp = position(offset: 120, content: 800)
    let back = position(offset: 290, content: 800)
    #expect(back.keepsFollowing(false, after: scrolledUp))
  }
}
