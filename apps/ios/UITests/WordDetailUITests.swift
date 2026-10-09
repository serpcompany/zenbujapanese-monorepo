import XCTest

final class WordDetailUITests: ZenbuUITestCase {
  func testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    waitFor(find("word-detail.add-to-list", in: app))
    waitFor(app.buttons["Add Note"])
    waitFor(app.buttons["Choose Photo"])
    XCTAssertEqual(app.buttons["Take Photo"].exists, device != .mac, "Take Photo")
    tap(find("word-detail.mark-known", in: app))
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    waitFor(firstElement(identifiedBy: "known-words.item.", in: app))
    tabItem(.search, in: app).tap()
    tap(find("word-detail.more-menu", in: app))
    waitFor(find("word-detail.mark-unknown", in: app))
  }

  func testAddToListPutsTheWordInFavoritesAndANewList() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(find("word-detail.add-to-list", in: app))
    waitFor(find("word-list-picker.screen", in: app))
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'word-list-picker.list.' AND label CONTAINS 'Favorites'"))
        .firstMatch)
    tap(find("word-list-picker.new-list", in: app))
    name("Countries", in: app)
    tap(find("word-list-picker.done", in: app))
    let lists = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'word-detail.list.'"))
    expectation(for: NSPredicate(format: "count == 2"), evaluatedWith: lists)
    waitForExpectations(timeout: Self.patience)
    tap(lists.matching(NSPredicate(format: "label CONTAINS 'Favorites'")).firstMatch)
    waitFor(firstElement(identifiedBy: "word-list.item.", in: app))
  }

  func testANoteIsKeptOnTheWord() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(app.buttons["Add Note"].firstMatch)
    type("the country, not the language", into: waitFor(find("word-note.editor", in: app)))
    tap(find("word-note.done", in: app))
    waitFor(labeled("the country, not the language", in: app))
  }

  func testTappingAKanjiInTheHeadwordHighlightsItsReading() {
    let app = launch()
    search("school", in: app)
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'result.' AND label BEGINSWITH '学校'"))
        .firstMatch)
    let kanji = waitFor(find("word-detail.screen", in: app)).buttons["学"].firstMatch
    tap(kanji)
    XCTAssertTrue(kanji.isSelected, "学 and its がっ are highlighted")
    kanji.tap()
    XCTAssertFalse(kanji.isSelected, "tapping it again clears the highlight")
  }

  func testAKanjiShowsItsStrokeOrderAndItsWords() {
    let app = openJapan()
    tap(find("word-detail.kanji.日", in: app))
    assertOnScreen(find("kanji-detail.glyph", in: app), in: app)
    tap(find("kanji-detail.stroke-order", in: app))
    assertOnScreen(find("stroke-order.screen", in: app), in: app)
    tap(find("stroke-order.next", in: app))
    tap(find("stroke-order.close", in: app))
    waitFor(find("kanji-detail.screen", in: app))
    reveal(firstElement(identifiedBy: "kanji-detail.word.", in: app), in: app)
  }

  private func openJapan() -> XCUIApplication {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    waitFor(find("word-detail.screen", in: app))
    return app
  }
}
