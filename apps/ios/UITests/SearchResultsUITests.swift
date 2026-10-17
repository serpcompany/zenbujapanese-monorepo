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

  func testAWordsResultsAreDrawnOnceWithTheirChips() {
    let app = launch(Self.countingDraws)
    search("japan", in: app)
    let row = waitFor(find("result.japan", in: app))
    if device != .mac {
      waitUntil(row, "value CONTAINS 'JLPT level N' AND value CONTAINS 'YouTube frequency rank'")
    }
    assertResultsDrawnOnceWithChips(in: app)
  }

  func testAJapaneseSentencesWordsAreDrawnOnceWithTheirChips() {
    let app = launch(Self.countingDraws)
    search("日本語を勉強する", in: app)
    waitFor(labeled("Discovered Words", in: app))
    if device != .mac {
      let leveled = NSPredicate(
        format: "identifier BEGINSWITH 'result.' AND value CONTAINS 'JLPT level N'")
      waitFor(app.descendants(matching: .any).matching(leveled).firstMatch)
    }
    assertResultsDrawnOnceWithChips(in: app)
  }

  private func assertResultsDrawnOnceWithChips(
    in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line
  ) {
    let drawn = draws(
      recordedBy: "search.results.drawn", labeled: ["rows", "with chips"], in: app, file: file,
      line: line)
    guard drawn.count == 1, let list = drawn.first else {
      return XCTFail("the results were drawn as \(drawn)", file: file, line: line)
    }
    XCTAssertGreaterThan(list["rows"] ?? 0, 0, "the results were drawn as \(drawn)", file: file, line: line)
    XCTAssertGreaterThan(
      list["with chips"] ?? 0, 0, "the results were drawn as \(drawn)", file: file, line: line)
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

  func testExampleSentencesSayHowManyAreListed() {
    for (query, count) in [
      ("iru", "3 examples"), ("eat", "The first 100 of more than 100 examples"),
    ] {
      let app = launch()
      search(query, in: app)
      tap(find("search.examples", in: app))
      let line = app.descendants(matching: .any).matching(identifier: "example-list.count")
        .matching(showing(count)).firstMatch
      assertOnScreen(line, in: app)
    }
  }

  func testARomajiQueryOffersItsJapaneseReading() {
    let app = launch()
    search("sensei", in: app)
    let refinement = waitFor(find("search.reading-refinement", in: app))
    XCTAssertTrue(refinement.label.contains("せんせい"), refinement.label)
  }
}
