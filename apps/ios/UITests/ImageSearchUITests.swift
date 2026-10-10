import XCTest

final class ImageSearchUITests: ZenbuUITestCase {
  func testAnImageOpensImageSearchOnTranslateAndAWordOpensItsEntry() throws {
    let app = try openFixtureImage()
    assertOnScreen(find("image-text.close", in: app), in: app)
    assertOnScreen(find("image-text.mode", in: app), in: app)
    waitFor(firstElement(identifiedBy: "image-text.region.", in: app)).tap()
    let sheet = waitFor(find("recognized-word-sheet", in: app))
    assertSheetPlacement(sheet, in: app)
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    assertOnScreen(find("word-detail.screen", in: app), in: app)
  }

  func testAWordSheetsKanjiOpensItsPageOnTranslate() throws {
    let app = try openFixtureImage()
    openKanji("本", fromWordIdentifiedBy: "image-text.region.", in: app)
    goBack(in: app)
    waitFor(find("image-text.mode", in: app))
  }

  private func assertSheetPlacement(_ sheet: XCUIElement, in app: XCUIApplication) {
    let window = app.windows.firstMatch.frame
    let frame = sheet.frame
    switch device {
    case .phone:
      XCTAssertGreaterThan(frame.minY, window.height * 0.3, "the iPhone opens it at half height")
    case .pad:
      XCTAssertLessThan(frame.width, window.width, "the iPad opens it as a centered sheet")
      XCTAssertEqual(frame.midX, window.midX, accuracy: 4)
    case .mac:
      XCTAssertTrue(window.contains(frame), "the Mac opens it over the window")
    }
  }

  func testClosingImageSearchReturnsToTranslatesHome() throws {
    let app = try openFixtureImage()
    tap(find("image-text.close", in: app))
    assertOnScreen(find("translate.header", in: app), in: app)
    assertOnScreen(find("translate.start.image", in: app), in: app)
  }

  func testTheViewsShowTheRecognizedText() throws {
    let app = try openFixtureImage()
    let mode = find("image-text.mode", in: app)
    choose("Text", in: mode)
    assertOnScreen(find("image-text.reader", in: app), in: app)
    choose("Photo", in: mode)
    waitFor(firstElement(identifiedBy: "image-text.region.", in: app))
    tap(find("image-text.more", in: app))
    waitFor(find("image-text.copy-text", in: app))
  }
}
