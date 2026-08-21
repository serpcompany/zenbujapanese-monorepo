import XCTest

final class AccessibilityAuditUITests: XCTestCase {
  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInDarkMode() throws {
    try auditReviewerJourney(appearance: .dark)
  }

  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInLightMode() throws {
    try auditReviewerJourney(appearance: .light)
  }

  @MainActor
  private func auditReviewerJourney(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    try XCTContext.runActivity(named: "Search root") { _ in
      try performAudit(in: app)
    }

    searchField.tap()
    searchField.typeText("日本")
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 5))
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

    try XCTContext.runActivity(named: "Search results") { _ in
      try performAudit(in: app)
    }

    japan.tap()
    XCTAssertTrue(app.scrollViews["word-detail.screen"].waitForExistence(timeout: 5))

    try XCTContext.runActivity(named: "Word Detail") { _ in
      try performAudit(in: app)
    }

    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name =
      appearance == .dark ? "Word Detail - dark appearance" : "Word Detail - light appearance"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  private var auditTypes: XCUIAccessibilityAuditType {
    .all
  }

  @MainActor
  private func performAudit(in app: XCUIApplication) throws {
    try app.performAccessibilityAudit(for: auditTypes) { issue in
      // Xcode 26 can report frameless SwiftUI bookkeeping nodes as clipped.
      // A real element, including one with an empty label, is never ignored.
      issue.auditType == .textClipped && issue.element == nil
    }
  }

  @MainActor
  private func launchApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    return app
  }
}
