import XCTest

final class SavedWordsUITests: ZenbuUITestCase {
  func testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted() throws {
    let app = try openFixtureImage()
    waitFor(firstElement(identifiedBy: "image-text.region.", in: app)).tap()
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
    let app = launch(try earlierNotes([gone: ["gone": "its word is gone"]]))
    open(.account, in: app)
    tap(reveal(find("account.notes-without-a-word", in: app), in: app))
    let note = waitFor(find("notes-without-a-word.note.gone", in: app))
    waitUntil(note, mentions: "its word is gone")
    revealRowActions(on: note)
    waitFor(menuChoice("Copy", in: app))
    tap(menuChoice("Delete", in: app))
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
    revealRowActions(on: firstElement(identifiedBy: "known-words.item.", in: app))
    tap(menuChoice("Mark as Unknown", in: app))
    assertOnScreen(find("known-words.empty", in: app), in: app)
  }

  func testAKanjiIsMarkedKnownFromItsMenu() {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.more-menu", in: app))
    tap(find("kanji-detail.more-menu", in: app))
    tap(find("kanji-detail.mark-known", in: app))
    tap(find("kanji-detail.more-menu", in: app))
    waitFor(find("kanji-detail.mark-unknown", in: app))
  }
}
