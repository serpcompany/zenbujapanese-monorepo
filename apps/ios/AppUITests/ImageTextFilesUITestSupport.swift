import XCTest

@MainActor
enum ImageTextFilesUITestSupport {
  static func waitForPicker(in app: XCUIApplication) -> Bool {
    // Run 33962023371 retained a cold Files handoff of about 33 seconds,
    // including provider startup and a blocked remote accessibility snapshot.
    // This cap is specific to native Files presentation, not app/OCR readiness.
    app.navigationBars.buttons["Cancel"].firstMatch.waitForExistence(timeout: 40)
  }

  static func openFixtureDirectory(in app: XCUIApplication) -> Bool {
    guard waitForPicker(in: app) else { return false }
    let browse = app.tabBars.buttons["Browse"]
    guard browse.waitForExistence(timeout: 5) else { return false }
    browse.tap()

    let fixtureTitle = app.navigationBars.staticTexts["ImageTextFixtures"]
    if fixtureTitle.exists { return true }
    let appTitle = app.navigationBars.staticTexts["Zenbu Japanese"]
    if !appTitle.exists {
      let localTitle = app.navigationBars.staticTexts["On My iPhone"]
      if !localTitle.exists {
        let local = app.descendants(matching: .any).matching(
          NSPredicate(format: "label == %@", "On My iPhone")
        ).firstMatch
        guard local.waitForExistence(timeout: 5) else { return false }
        local.tap()
      }
      guard localTitle.waitForExistence(timeout: 5) else { return false }
      let appFolder = app.cells.matching(
        NSPredicate(format: "label BEGINSWITH %@", "Zenbu Japanese")
      ).firstMatch
      guard appFolder.waitForExistence(timeout: 5) else { return false }
      appFolder.tap()
      guard appTitle.waitForExistence(timeout: 5) else { return false }
    }
    let fixtures = app.cells.matching(
      NSPredicate(format: "label BEGINSWITH %@", "ImageTextFixtures")
    ).firstMatch
    guard fixtures.waitForExistence(timeout: 5) else { return false }
    fixtures.tap()
    return fixtureTitle.waitForExistence(timeout: 5)
  }

  static func verifyPreparedFixtures(_ names: [String], in app: XCUIApplication) {
    guard app.textFields["search.field"].waitForExistence(timeout: 5) else {
      XCTFail("Fixture preparation must return to Search")
      return
    }
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.files").firstMatch.tap()
    guard openFixtureDirectory(in: app) else {
      XCTFail("Native Files must expose Zenbu Japanese / ImageTextFixtures")
      return
    }
    for name in names {
      let fixture = app.cells.matching(
        NSPredicate(format: "label BEGINSWITH %@", String(name.dropLast(4)))
      ).firstMatch
      XCTAssertTrue(fixture.waitForExistence(timeout: 5), "Missing prepared fixture: \(name)")
    }
    app.navigationBars.buttons["Cancel"].firstMatch.tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }
}
