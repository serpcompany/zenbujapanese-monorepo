import XCTest

final class NotesInSearchUITests: ZenbuUITestCase {
  func testANoteFindsItsWordUnderInYourNotesAndEachChangeShowsAtOnce() {
    let app = launch()
    openTaberu(in: app)
    addNote("plmqz mochi", in: app)
    goBack(in: app)
    searchAgain("plmqz", in: app)
    let row = waitFor(noteRow(on: "食べる", in: app))
    waitUntil(row, mentions: "plmqz mochi")
    assertOnScreen(labeled("In your notes", in: app), in: app)
    assertOnScreen(find("search.no-results", in: app), in: app)

    tap(row, toShow: find("word-detail.screen", in: app))
    replaceNote("plmqz mochi", with: "zvkqp mochi", in: app)
    goBack(in: app)
    waitUntilGone(row)
    searchAgain("zvkqp", in: app)
    let edited = waitFor(noteRow(on: "食べる", in: app))
    waitUntil(edited, mentions: "zvkqp mochi")

    tap(edited, toShow: find("word-detail.screen", in: app))
    replaceNote("zvkqp mochi", with: "", in: app)
    goBack(in: app)
    waitUntilGone(edited)
    assertOnScreen(find("search.no-results", in: app), in: app)
  }

  func testOneNoteOnTwoWordsListsBothThenAndAfterARelaunch() {
    let app = launch()
    openTaberu(in: app)
    addNote("plmqz on both", in: app)
    goBack(in: app)
    tap(result(startingWith: "食べるラー油", in: app), toShow: find("word-detail.screen", in: app))
    addNote("plmqz on both", in: app)
    goBack(in: app)
    searchAgain("plmqz", in: app)
    assertBothWordsAreInYourNotes(in: app)

    app.terminate()
    app.launchEnvironment["ZENBU_UI_TEST_FRESH"] = "0"
    app.launch()
    open(.search, in: app)
    type("plmqz\n", into: searchField(in: app))
    assertBothWordsAreInYourNotes(in: app)
  }

  func testANoteListedAfterTheDictionaryMatchesLeavesThemInTheirOrder() {
    let app = launch()
    search("taberu", in: app)
    let dictionaryMatches = dictionaryRows(in: app)
    XCTAssertGreaterThan(dictionaryMatches.count, 1, "taberu matches more than one word")
    tap(result(startingWith: "食べるラー油", in: app), toShow: find("word-detail.screen", in: app))
    addNote("taberu with chili oil", in: app)
    goBack(in: app)

    let row = reveal(noteRow(on: "食べるラー油", in: app), in: app)
    waitUntil(row, mentions: "taberu with chili oil")
    XCTAssertEqual(dictionaryRows(in: app), dictionaryMatches, "the dictionary matches keep their order")
    guard let last = dictionaryMatches.last else { return }
    XCTAssertGreaterThan(
      row.frame.minY, find(last, in: app).frame.maxY, "the note is listed after every dictionary match")
  }

  private func assertBothWordsAreInYourNotes(in app: XCUIApplication) {
    assertOnScreen(labeled("In your notes", in: app), in: app)
    for headword in ["食べる", "食べるラー油"] {
      waitUntil(waitFor(noteRow(on: headword, in: app)), mentions: "plmqz on both")
    }
  }

  private func searchAgain(_ query: String, in app: XCUIApplication) {
    returnToRecentSearches(in: app)
    type(query + "\n", into: searchField(in: app))
  }

  private func noteRow(on headword: String, in app: XCUIApplication) -> XCUIElement {
    row(identifiedBy: "search.note.", on: headword, in: app)
  }

  private func result(startingWith headword: String, in app: XCUIApplication) -> XCUIElement {
    row(identifiedBy: "result.", on: headword, in: app)
  }

  private func row(identifiedBy prefix: String, on headword: String, in app: XCUIApplication)
    -> XCUIElement
  {
    let named = NSPredicate(
      format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@", prefix, headword + ",")
    return app.descendants(matching: .any).matching(named).firstMatch
  }

  private func dictionaryRows(in app: XCUIApplication) -> [String] {
    let rows = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'result.'"))
    waitFor(rows.firstMatch)
    var seen = Set<String>()
    return rows.allElementsBoundByIndex
      .map { ($0.identifier, $0.frame.minY) }
      .sorted { $0.1 < $1.1 }
      .compactMap { seen.insert($0.0).inserted ? $0.0 : nil }
  }

  private func replaceNote(_ text: String, with replacement: String, in app: XCUIApplication) {
    tap(reveal(find("word-detail.note", in: app), in: app))
    let editor = waitFor(find("word-note.editor", in: app))
    type(String(repeating: XCUIKeyboardKey.delete.rawValue, count: text.count) + replacement, into: editor)
    tap(find("word-note.done", in: app))
    if !replacement.isEmpty { waitFor(labeled(replacement, in: app)) }
  }
}
