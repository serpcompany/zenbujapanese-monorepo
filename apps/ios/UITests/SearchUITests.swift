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
    tap(find("word-detail.kanji.日", in: app))
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
    tap(find("word-detail.conjugations", in: app))
    assertOnScreen(find("conjugations.screen", in: app), in: app)
    tap(firstElement(identifiedBy: "conjugations.row.", in: app))
    assertOnScreen(firstElement(identifiedBy: "conjugations.explanation.", in: app), in: app)
  }

  func testAQueryWithNoMatchesSaysSo() {
    let app = launch()
    open(.search, in: app)
    type("qxzqxzqxz\n", into: find("search.field", in: app))
    assertOnScreen(find("search.no-results", in: app), in: app)
  }

  func testASearchIsListedUnderRecentAndRunsAgain() {
    let app = launch()
    search("japan", in: app)
    tap(labeled("Clear text", in: app))
    let recent = find("recent-search.0", in: app)
    assertOnScreen(find("recent-search.header", in: app), in: app)
    tap(recent)
    waitFor(find("result.japan", in: app))
  }

  func testHandwritingAndRadicalsReplaceTheKeyboard() {
    let app = launch()
    open(.search, in: app)
    tap(find("search.field", in: app))
    let modes = find("search.input.mode", in: app)
    choose("Handwriting", in: modes)
    assertOnScreen(find("handwriting.canvas", in: app), in: app)
    choose("Radicals", in: modes)
    assertOnScreen(find("radical.grid", in: app), in: app)
  }

  func testMarkingAResultKnownShowsTheKnownCapsule() {
    let app = launch()
    let row = markJapanKnownFromItsResult(in: app)
    expectation(for: NSPredicate(format: "value CONTAINS 'Known'"), evaluatedWith: row)
    waitForExpectations(timeout: Self.patience)
  }
}
