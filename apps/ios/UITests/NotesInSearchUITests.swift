import XCTest

final class NotesInSearchUITests: ZenbuUITestCase {
  func testANoteFindsItsWordUnderInYourNotesAndEachChangeShowsAtOnce() {
    let app = launch()
    openTaberu(in: app)
    addNote("zk38 rice cake", fromItsRow: true, in: app)
    goBack(in: app)
    searchAgain("zk38", in: app)
    let row = waitFor(noteRow(on: "食べる", in: app))
    waitUntil(row, mentions: "zk38 rice cake")
    assertOnScreen(labeled("In your notes", in: app), in: app)
    assertOnScreen(find("search.no-results", in: app), in: app)

    tap(row, toShow: find("word-detail.screen", in: app))
    replaceNote(with: "zk52 rice cake", in: app)
    goBack(in: app)
    waitUntilGone(row)
    searchAgain("zk52", in: app)
    let edited = waitFor(noteRow(on: "食べる", in: app))
    waitUntil(edited, mentions: "zk52 rice cake")

    tap(edited, toShow: find("word-detail.screen", in: app))
    replaceNote(with: "", in: app)
    goBack(in: app)
    waitUntilGone(edited)
    assertOnScreen(find("search.no-results", in: app), in: app)
  }

  func testOneNoteOnTwoWordsListsBothThenAndAfterARelaunch() {
    let app = launch(Self.countingDraws)
    openTaberu(in: app)
    addNote("zk38 on both", in: app)
    goBack(in: app)
    tap(result(startingWith: "食べるラー油", in: app), toShow: find("word-detail.screen", in: app))
    addNote("zk38 on both", in: app)
    goBack(in: app)
    searchAgain("zk38", in: app)
    assertBothWordsAreInYourNotes(in: app)

    app.terminate()
    app.launchEnvironment["ZENBU_UI_TEST_FRESH"] = "0"
    app.launch()
    open(.search, in: app)
    type("zk38\n", into: searchField(in: app))
    assertBothWordsAreInYourNotes(in: app)
    assertNotesDrawnOnce("2 notes", in: app)
  }

  func testNotesListedAfterTheDictionaryMatchesLeaveThemAsTheyWere() {
    let app = launch(Self.countingDraws)
    search("食べる", in: app)
    let dictionaryMatches = dictionaryRows(in: app)
    XCTAssertGreaterThan(dictionaryMatches.count, 2, "食べる matches several words")
    XCTAssertFalse(dictionaryMatches.contains("result.japan"), "日本 isn't a match for 食べる")
    let lowest = reveal(result(startingWith: "ぼりぼり食べる", in: app), in: app)
    tap(lowest, toShow: find("word-detail.screen", in: app))
    addNote("音を立てて食べる", in: app)
    goBack(in: app)
    searchAgain("japan", in: app)
    tap(find("result.japan", in: app), toShow: find("word-detail.screen", in: app))
    addNote("日本で食べる", in: app)
    goBack(in: app)

    searchAgain("食べる", in: app)
    XCTAssertEqual(dictionaryRows(in: app), dictionaryMatches, "a note adds, moves, or removes no match")
    let lastNote = reveal(noteRow(on: "日本", in: app), in: app)
    let firstNote = waitFor(noteRow(on: "ぼりぼり食べる", in: app))
    waitUntil(lastNote, mentions: "日本で食べる")
    waitUntil(firstNote, mentions: "音を立てて食べる")
    guard let last = dictionaryMatches.last else { return }
    let lastMatch = waitFor(find(last, in: app)).frame
    for note in [firstNote, lastNote] {
      XCTAssertGreaterThan(note.frame.minY, lastMatch.maxY, "\(note) is listed after the matches")
    }
    assertNotesDrawnOnce("2 notes", in: app)
  }

  private func assertBothWordsAreInYourNotes(in app: XCUIApplication) {
    assertOnScreen(labeled("In your notes", in: app), in: app)
    for headword in ["食べる", "食べるラー油"] {
      waitUntil(waitFor(noteRow(on: headword, in: app)), mentions: "zk38 on both")
    }
  }

  private func assertNotesDrawnOnce(
    _ summary: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line
  ) {
    let record = text(of: waitFor(find("search.notes.drawn", in: app), file: file, line: line))
    let drawn = record.components(separatedBy: "; ")
    let sinceTheSearch = drawn.split(separator: "no search", omittingEmptySubsequences: false).last
    XCTAssertEqual(
      sinceTheSearch.map(Array.init), [summary], "Look Up's notes were drawn as \(record)", file: file,
      line: line)
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

  private func replaceNote(with replacement: String, in app: XCUIApplication) {
    tap(reveal(find("word-detail.note", in: app), in: app))
    let editor = waitFor(find("word-note.editor", in: app))
    let written = editor.value as? String ?? ""
    focus(editor)
    if device == .mac {
      editor.typeKey("a", modifierFlags: .command)
      editor.typeText(XCUIKeyboardKey.delete.rawValue + replacement)
    } else {
      gesture(on: editor) { editor.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap() }
      editor.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: written.count) + replacement)
    }
    tap(find("word-note.done", in: app))
    if !replacement.isEmpty { waitFor(labeled(replacement, in: app)) }
  }
}
