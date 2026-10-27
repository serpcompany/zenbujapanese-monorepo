import XCTest

final class SavedWordsUITests: ZenbuUITestCase {
  func testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted() throws {
    let app = try openFixtureImage()
    tap(firstElement(identifiedBy: "image-text.region.", in: app))
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    tap(find("word-detail.image-attachment", in: app))
    waitForSheet("word-detail.image-page", in: app)
    tap(find("word-detail.image-attachment-done", in: app))
    open(.account, in: app)
    tap(find("account.media-library", in: app))
    let item = waitFor(firstElement(identifiedBy: "media-library.item.", in: app))
    revealRowActions(on: item)
    tap(menuChoice("Delete", in: app))
    assertOnScreen(find("media-library.empty", in: app), in: app)
  }

  func testANoteWhoseWordIsGoneIsListedUntilItsDeleted() throws {
    let gone = "wn1:" + String(repeating: "0", count: 64)
    let dropped = String(repeating: "f", count: 32)
    let app = launch(
      try earlierNotes(
        [gone: ["gone": "its word is gone"], dropped: ["dropped": "its entry was dropped"]],
        headwords: [dropped: "消えた語"]))
    open(.account, in: app)
    tap(reveal(find("account.notes-without-a-word", in: app), in: app))
    waitUntil(waitFor(find("notes-without-a-word.note.dropped", in: app)), mentions: "消えた語")
    for (id, text) in [("gone", "its word is gone"), ("dropped", "its entry was dropped")] {
      let note = waitFor(find("notes-without-a-word.note.\(id)", in: app))
      waitUntil(note, mentions: text)
      revealRowActions(on: note)
      waitFor(menuChoice("Copy", in: app))
      tap(menuChoice("Delete", in: app))
      waitUntilGone(note)
    }
    assertOnScreen(find("notes-without-a-word.empty", in: app), in: app)
    goBack(in: app)
    waitFor(find("account.translations", in: app))
    waitUntilGone(find("account.notes-without-a-word", in: app))
  }

  func testAKnownWordIsListedAndCanBeMarkedUnknownThere() {
    let app = launch()
    markJapanKnownFromItsResult(in: app)
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    chooseLeadingAction("mark-unknown", onRow: "result.japan", in: app)
    assertOnScreen(find("known-words.empty", in: app), in: app)
  }

  func testKnownWordsShowsAWordWithItsMeaningAndAKanjiAsLookUpDoes() {
    let app = launch()
    search("日", in: app)
    let kanji = waitFor(find("result.kanji-primary.日", in: app)).label
    returnToRecentSearches(in: app)
    type("japan\n", into: searchField(in: app))
    let word = markJapanKnown(in: app).label
    XCTAssert(word.contains("Japan"), word)
    markNichiKnownFromJapan(in: app)
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    let nichi = find("result.kanji-primary.日", in: app)
    waitUntil(nichi, "label == %@", kanji)
    let japan = find("result.japan", in: app)
    waitUntil(japan, "label == %@", word)
    if device != .mac {
      waitUntil(japan, "value CONTAINS 'JLPT level N' AND value CONTAINS 'YouTube frequency rank'")
    }
    let screen = XCTAttachment(screenshot: app.screenshot())
    screen.name = "Known Words"
    screen.lifetime = .keepAlways
    add(screen)
    tap(japan)
    waitFor(find("word-detail.kanji.日", in: app))
    waitUntilGone(find("kanji-detail.more-menu", in: app))
    tap(tabItem(.account, in: app), toShow: nichi)
    tap(nichi, toShow: find("kanji-detail.more-menu", in: app))
    tap(tabItem(.account, in: app), toShow: nichi)
    chooseLeadingAction("mark-unknown", onRow: "result.kanji-primary.日", in: app)
    waitUntilGone(find("result.kanji-primary.日", in: app))
    waitFor(find("result.japan", in: app))
  }

  func testAKanjiIsMarkedKnownFromItsMenu() {
    let app = launch()
    search("japan", in: app)
    markNichiKnownFromJapan(in: app)
    tap(find("kanji-detail.more-menu", in: app))
    waitFor(menuChoice("Mark as Unknown", in: app))
  }

  private func markNichiKnownFromJapan(in app: XCUIApplication) {
    tap(find("result.japan", in: app))
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.more-menu", in: app))
    tap(find("kanji-detail.more-menu", in: app))
    tap(menuChoice("Mark as Known", in: app))
  }
}
