import XCTest

final class SearchResultsUITests: ZenbuUITestCase {
  func testTheSortedByRowNamesTheChosenOrder() {
    let app = launch()
    search("japan", in: app)
    assertOnScreen(sortedByRow(saying: "Sorted by Default", in: app), in: app)
    chooseFromSortedBy("Sort By", "YouTube", in: app)
    waitFor(sortedByRow(saying: "Sorted by YouTube", in: app))
    chooseFromSortedBy("Sort By", "Known Words", in: app)
    waitFor(sortedByRow(saying: "Sorted by Known Words", in: app))
    chooseFromSortedBy("Sort By", "Default", in: app)
    waitFor(sortedByRow(saying: "Sorted by Default", in: app))
  }

  func testFilteringToKnownWordsHidesEveryWordUntilTheFilterIsCleared() {
    let app = launch()
    search("japan", in: app)
    chooseFromSortedBy("Filter", "Known", in: app)
    waitFor(sortedByRow(saying: "Sorted by Default · 1 filter", in: app))
    assertOnScreen(find("search.filter-empty", in: app), in: app)
    waitFor(labeled("No Words Match Your Filter", in: app))
    tap(app.buttons["Clear Filter"].firstMatch)
    waitFor(find("result.japan", in: app))
    waitUntilGone(sortedByRow(saying: "1 filter", in: app))
  }

  func testAWordLeavesTheUnknownFilterOnceItsMarkedKnown() {
    let app = launch()
    search("japan", in: app)
    chooseFromSortedBy("Filter", "Unknown", in: app)
    waitFor(sortedByRow(saying: "1 filter", in: app))
    let row = markJapanKnown(in: app)
    waitUntilGone(row)
    chooseFromSortedBy("Filter", "Known", in: app)
    waitFor(row)
  }

  func testClearingRecentSearchesEmptiesTheList() {
    let app = launch()
    search("japan", in: app)
    returnToRecentSearches(in: app)
    tap(find("search.actions-menu", in: app))
    tap(menuChoice("Clear Recent Searches", in: app))
    tap(app.buttons["Clear All"].firstMatch)
    waitUntilGone(find("recent-search.0", in: app))
  }

  func testARecentSearchIsRemovedFromItsMenu() {
    let app = launch()
    search("japan", in: app)
    returnToRecentSearches(in: app)
    openContextMenu(on: find("recent-search.0", in: app))
    tap(menuChoice("Remove from Recent", in: app))
    waitUntilGone(find("recent-search.0", in: app))
  }

  func testAWordOffersItsExampleSentences() {
    let app = launch()
    search("miru", in: app)
    tap(find("search.examples", in: app))
    assertOnScreen(find("example-list.screen", in: app), in: app)
  }

  func testARomajiQueryOffersItsJapaneseReading() {
    let app = launch()
    search("sensei", in: app)
    let refinement = waitFor(find("search.reading-refinement", in: app))
    XCTAssertTrue(refinement.label.contains("せんせい"), refinement.label)
  }
}
