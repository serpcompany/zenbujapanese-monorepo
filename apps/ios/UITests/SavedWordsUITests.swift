import XCTest

final class SavedWordsUITests: ZenbuUITestCase {
  func testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted() throws {
    let app = try openFixtureImage()
    waitFor(firstElement(identifiedBy: "image-text.region.", in: app)).tap()
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    open(.account, in: app)
    tap(find("account.media-library", in: app))
    let item = waitFor(firstElement(identifiedBy: "media-library.item.", in: app))
    revealRowActions(on: item)
    tap(app.buttons["Delete"])
    assertOnScreen(find("media-library.empty", in: app), in: app)
  }

  func testAKnownWordIsListedAndCanBeMarkedUnknownThere() {
    let app = launch()
    markJapanKnownFromItsResult(in: app)
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    revealRowActions(on: firstElement(identifiedBy: "known-words.item.", in: app))
    tap(app.buttons["Mark as Unknown"])
    assertOnScreen(find("known-words.empty", in: app), in: app)
  }

  func testAKanjiIsMarkedKnownFromItsMenu() {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    tap(find("word-detail.kanji.日", in: app))
    tap(find("kanji-detail.more-menu", in: app))
    tap(find("kanji-detail.mark-known", in: app))
    tap(find("kanji-detail.more-menu", in: app))
    waitFor(find("kanji-detail.mark-unknown", in: app))
  }
}
