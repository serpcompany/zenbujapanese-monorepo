import XCTest

final class LearningUITests: ZenbuUITestCase {
  func testAWordMarkedLearningFromItsPageIsTaggedAndListedUnderLearningUntilItsKnown() {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    let menu = find("word-detail.more-menu", in: app)
    chooseStatus("Learning", from: menu, in: app)
    waitForTag("Learning", on: "word-detail.status", in: app)
    keepScreenshot(named: "Learning tag on the word page", of: app)
    if device != .mac {
      tap(menu)
      tap(menuChoice("Status", in: app))
      waitFor(menuChoice("Known", in: app))
      keepScreenshot(named: "Status picker", of: app)
      tap(menuChoice("Learning", in: app))
    }

    open(.account, in: app)
    tap(reveal(find("account.learning", in: app), in: app))
    let row = find("result.japan", in: app)
    waitFor(row)
    if device != .mac { waitUntil(row, "value BEGINSWITH 'Learning, '") }
    keepScreenshot(named: "Learning", of: app)
    chooseLeadingAction("mark-known", onRow: "result.japan", in: app)
    assertOnScreen(find("learning.empty", in: app), in: app)
    goBack(in: app)
    tap(reveal(find("account.known-words", in: app), in: app))
    waitFor(find("result.japan", in: app))
  }

  func testASwipeMarksAResultLearningAndOnlyTheLearningFilterShowsIt() {
    let app = launch()
    search("japan", in: app)
    let row = chooseLeadingAction("mark-learning", onRow: "result.japan", in: app)
    if device != .mac { waitUntil(row, "value BEGINSWITH 'Learning, '") }
    keepScreenshot(named: "Learning in Look Up", of: app)
    chooseFromSortedBy("Filter", "Learning", in: app)
    waitFor(sortedByRow(saying: "Sorted by Default · 1 filter", in: app))
    waitFor(row)
    chooseFromSortedBy("Filter", "Unknown", in: app)
    waitUntilGone(row)
    chooseFromSortedBy("Filter", "Known", in: app)
    waitUntilGone(row)
  }
}
