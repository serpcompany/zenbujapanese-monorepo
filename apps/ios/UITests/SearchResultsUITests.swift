import XCTest

final class SearchResultsUITests: ZenbuUITestCase {
  func testSortingByADictionarySaysSoUntilReset() {
    let app = launch()
    search("japan", in: app)
    tap(find("search.actions-menu", in: app))
    tap(find("search.sort-menu", in: app))
    tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'YouTube'")).firstMatch)
    waitFor(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier == 'search.sort-status' AND label CONTAINS 'YouTube'"))
        .firstMatch)
    tap(app.buttons["Reset"])
    waitUntilGone(find("search.sort-status", in: app))
  }

  func testClearingRecentSearchesEmptiesTheList() {
    let app = launch()
    search("japan", in: app)
    tap(labeled("Clear text", in: app))
    waitFor(find("recent-search.0", in: app))
    tap(find("search.actions-menu", in: app))
    tap(app.buttons["Clear Recent Searches"])
    tap(app.buttons["Clear All"])
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
