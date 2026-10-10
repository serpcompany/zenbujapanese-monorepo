import XCTest

final class SearchUITests: ZenbuUITestCase {
  func testAnEnglishSearchListsTheWordAndOpensItsDetail() {
    let app = launch()
    search("japan", in: app)
    let row = find("result.japan", in: app)
    assertOnScreen(row, in: app)
    row.tap()
    assertOnScreen(find("word-detail.screen", in: app), in: app)
    assertOnScreen(find("word-detail.more-menu", in: app), in: app)
  }

  func testAWordOpensItsKanjiAndBackReturnsToTheWord() {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.screen", in: app))
    assertOnScreen(find("kanji-detail.screen", in: app), in: app)
    goBack(in: app)
    waitFor(find("word-detail.screen", in: app))
  }

  func testAVerbOpensItsConjugationsAndAForm() {
    let app = launch()
    search("taberu", in: app)
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'result.' AND label BEGINSWITH '食べる'"))
        .firstMatch)
    tap(find("word-detail.conjugations", in: app), toShow: find("conjugations.screen", in: app))
    assertOnScreen(find("conjugations.screen", in: app), in: app)
    tap(firstElement(identifiedBy: "conjugations.row.", in: app))
    assertOnScreen(firstElement(identifiedBy: "conjugations.explanation.", in: app), in: app)
  }

  func testAQueryWithNoMatchesSaysSo() {
    let app = launch()
    open(.search, in: app)
    type("qxzqxzqxz\n", into: searchField(in: app))
    assertOnScreen(find("search.no-results", in: app), in: app)
  }

  func testTheTabsStayBesideTheResultsWhichStayAcrossTabs() {
    let app = launch()
    search("japan", in: app)
    for tab in AppTab.allCases {
      assertOnScreen(tabItem(tab, in: app), in: app)
    }
    open(.translate, in: app)
    open(.search, in: app)
    waitFor(find("result.japan", in: app))
    XCTAssertEqual(searchField(in: app).value as? String, "japan", "the field still holds the query")
  }

  func testTheFieldOffersCloseAndTheInputButtonsWhileTyping() throws {
    try XCTSkipUnless(
      device == .phone, "only the iPhone slides its title away and shows X; iPad and the Mac clear the field")
    let app = launch()
    open(.search, in: app)
    let close = closeSearchButton(in: app)
    XCTAssertFalse(close.exists, "nothing is being typed yet")
    tap(searchField(in: app))
    assertOnScreen(close, in: app)
    let keyboard = app.keyboards.firstMatch
    for input in ["handwriting", "radicals"] {
      let button = find("search.input.\(input)", in: app)
      assertOnScreen(button, in: app)
      if keyboard.exists {
        XCTAssertLessThanOrEqual(button.frame.maxY, keyboard.frame.minY + 1, "above the keyboard")
      }
    }
    close.tap()
    waitUntilGone(close)
  }

  func testASearchKeepsItsQueryInTheFieldAndRunsAgainFromRecent() {
    let app = launch()
    search("japan", in: app)
    XCTAssertEqual(searchField(in: app).value as? String, "japan", "the field keeps the query")
    for input in ["handwriting", "radicals"] {
      assertOnScreen(find("search.input.\(input)", in: app), in: app)
    }
    returnToRecentSearches(in: app)
    XCTAssertFalse(labeled("Recent", in: app).exists, "recent searches have no heading")
    tap(find("recent-search.0", in: app))
    waitFor(find("result.japan", in: app))
  }

  func testMarkingAResultKnownShowsTheKnownCapsule() {
    let app = launch()
    let row = markJapanKnownFromItsResult(in: app)
    if device == .mac {
      row.rightClick()
      waitFor(find("result.japan.mark-unknown", in: app))
    } else {
      waitUntil(row, "value CONTAINS 'Known'")
    }
  }
}
