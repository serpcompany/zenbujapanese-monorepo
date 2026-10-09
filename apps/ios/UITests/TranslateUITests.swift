import XCTest

final class TranslateUITests: ZenbuUITestCase {
  static let script = ["ZENBU_TRANSLATE_SCRIPT": "station"]
  static let options = ["conversation", "listening", "text", "document", "camera"]

  func testTheHomeOffersFiveWaysAndRemembersTheChoice() {
    let app = launch()
    open(.translate, in: app)
    for option in Self.options {
      waitFor(find("translate.start.\(option)", in: app))
    }
    assertOnScreen(find("translate.start", in: app), in: app)
    assertOnScreen(find("translate.history", in: app), in: app)
    tap(find("translate.start.text", in: app))
    XCTAssertTrue(find("translate.start.text", in: app).isSelected)
    app.terminate()
    app.launchEnvironment["ZENBU_UI_TEST_FRESH"] = "0"
    app.launch()
    open(.translate, in: app)
    XCTAssertTrue(waitFor(find("translate.start.text", in: app)).isSelected, "the choice is remembered")
  }

  func testCameraOffersThisDevicesImageSources() {
    let app = launch()
    open(.translate, in: app)
    let camera = find("translate.start.camera", in: app)
    tap(camera)
    let mentionsCamera = camera.label.localizedCaseInsensitiveContains("point the camera")
    XCTAssertEqual(mentionsCamera, device != .mac, "only a device with a camera says to point it")
    tap(find("translate.start", in: app))
    waitFor(find("image-source.photo-library", in: app))
    waitFor(find("image-source.files", in: app))
    XCTAssertEqual(find("image-source.camera", in: app).exists, device != .mac, "Take Photo")
    XCTAssertEqual(find("image-source.paste", in: app).exists, device == .mac, "Paste Image")
  }

  func testTypedTextIsTranslatedWithItsDirection() {
    let app = launch(Self.script)
    open(.translate, in: app)
    tap(find("translate.start.text", in: app))
    tap(find("translate.start", in: app))
    type("Where can I buy a Suica card?", into: waitFor(find("translate.typed.input", in: app)))
    let direction = waitFor(find("translate.typed.direction", in: app))
    XCTAssertTrue(direction.label.contains("English → Japanese"), direction.label)
    waitFor(app.buttons["Copy"])
    waitFor(app.buttons["Speak"])
    let word = waitFor(firstElement(identifiedBy: "translate.typed.result.", in: app))
    word.tap()
    waitFor(find("recognized-word-sheet", in: app))
    tap(find("recognized-word-sheet.done", in: app))
    tap(find("translate.typed.clear", in: app))
    waitUntilGone(find("translate.typed.direction", in: app))
  }

  func testAConversationRunsFullScreenAndIsSavedToTranslations() {
    let app = launch(Self.script)
    open(.translate, in: app)
    tap(find("translate.start.conversation", in: app))
    tap(find("translate.start", in: app))
    assertOnScreen(find("translate.live", in: app), in: app)
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    if device == .phone {
      XCTAssertFalse(isReachable(app.tabBars.firstMatch, in: app), "the conversation hides the tab bar")
    }
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"])
    tap(find("translate.history", in: app))
    assertOnScreen(find("translate.history.row", in: app), in: app)
  }

  func testTranslationsStartsEmpty() {
    let app = launch()
    open(.translate, in: app)
    tap(find("translate.history", in: app))
    waitFor(labeled("No Conversations Yet", in: app))
  }
}
