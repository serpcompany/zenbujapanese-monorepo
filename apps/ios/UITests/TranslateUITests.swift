import XCTest

final class TranslateUITests: ZenbuUITestCase {
  static let script = ["ZENBU_TRANSLATE_SCRIPT": "station"]
  static let rows = ["conversation", "listening", "image", "text", "document"]

  func testTheHomeListsFiveWaysUnderSpokenAndWritten() {
    let app = launch()
    open(.translate, in: app)
    let header = find("translate.header", in: app)
    assertOnScreen(header, in: app)
    XCTAssertTrue(header.label.contains("on your \(device.name)"), header.label)
    assertOnScreen(find("translate.history", in: app), in: app)
    let rows = Self.rows.map { find("translate.start.\($0)", in: app) }
    for row in rows { assertOnScreen(row, in: app) }
    let tops = rows.map(\.frame.minY)
    XCTAssertEqual(tops, tops.sorted(), "Conversation, Listen, Image, Text, Document, top to bottom")
    let spoken = waitFor(labeled("Spoken", in: app)).frame.minY
    let written = waitFor(labeled("Written", in: app)).frame.minY
    XCTAssertLessThan(spoken, tops[0], "Spoken heads Conversation and Listen")
    XCTAssertTrue(tops[1] < written && written < tops[2], "Written heads Image, Text, and Document")
  }

  func testImageOffersThisDevicesSources() {
    let app = launch()
    open(.translate, in: app)
    tap(find("translate.start.image", in: app))
    waitFor(app.buttons["Photo Library"])
    XCTAssertEqual(app.buttons["Take Photo"].exists, device != .mac, "Take Photo")
    XCTAssertEqual(app.buttons["Paste Image"].exists, device == .mac, "Paste Image")
    tap(app.buttons["Cancel"].firstMatch)
    waitUntilGone(app.buttons["Photo Library"])
    assertOnScreen(find("translate.header", in: app), in: app)
  }

  func testTypedTextIsTranslatedWithItsDirection() {
    let app = typeASentenceToTranslate()
    let direction = waitFor(find("translate.typed.direction", in: app))
    XCTAssertTrue(text(of: direction).contains("English → Japanese"), text(of: direction))
    waitFor(app.buttons["Copy"])
    waitFor(app.buttons["Speak"])
    tap(word(containing: "どこ", identifiedBy: "translate.typed.result.", in: app))
    waitForSheet("recognized-word-sheet", in: app)
    for control in ["recognized-word-sheet.open-full-entry", "word-detail.share", "word-detail.more-menu"] {
      assertOnScreen(find(control, in: app), in: app)
    }
    tap(find("recognized-word-sheet.done", in: app))
    tap(find("translate.typed.clear", in: app))
    waitUntilGone(find("translate.typed.direction", in: app))
  }

  func testReturnInAWordSheetsNoteKeepsTheSheetOpen() {
    let app = typeASentenceToTranslate()
    tap(word(containing: "どこ", identifiedBy: "translate.typed.result.", in: app))
    let sheet = waitForSheet("recognized-word-sheet", in: app)
    tap(find("word-detail.more-menu", in: app))
    tap(menuChoice("Add Note", in: app))
    type("asked at the station\n", into: waitFor(find("word-note.editor", in: app)))
    RunLoop.current.run(until: Date.now.addingTimeInterval(2))
    XCTAssertTrue(sheet.exists, "Return in the note leaves the word sheet open")
    assertOnScreen(find("recognized-word-sheet.open-full-entry", in: app), in: app)
  }

  func testAConversationRunsFullScreenAndIsSavedToTranslations() {
    let app = launch(Self.script)
    open(.translate, in: app)
    tap(find("translate.start.conversation", in: app))
    assertOnScreen(find("translate.live", in: app), in: app)
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    if device == .phone {
      XCTAssertFalse(isReachable(app.tabBars.firstMatch, in: app), "the conversation hides the tab bar")
    }
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"].firstMatch)
    tap(find("translate.history", in: app))
    assertOnScreen(find("translate.history.row", in: app), in: app)
  }

  private func typeASentenceToTranslate() -> XCUIApplication {
    let app = launch(Self.script)
    open(.translate, in: app)
    tap(find("translate.start.text", in: app))
    type("Where can I buy a Suica card?", into: waitFor(find("translate.typed.input", in: app)))
    return app
  }

  func testTranslationsStartsEmpty() {
    let app = launch()
    open(.translate, in: app)
    tap(find("translate.history", in: app))
    waitFor(labeled("No Conversations Yet", in: app))
  }
}
