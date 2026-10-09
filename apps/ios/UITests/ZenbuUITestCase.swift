import XCTest

@MainActor
class ZenbuUITestCase: XCTestCase {
  static let offlineAccountService = "http://127.0.0.1:9"
  static let patience: TimeInterval = 90

  let fixtures = URL(filePath: #filePath)
    .deletingLastPathComponent()
    .appending(path: "../Modules/Tests/SearchExperienceTests/Fixtures/ImageText")
    .standardizedFileURL

  var device: TestDevice.Kind { TestDevice.kind }

  func launch(_ environment: [String: String] = [:]) -> XCUIApplication {
    continueAfterFailure = false
    TestDevice.turn(landscape: false)
    let app = XCUIApplication()
    app.launchEnvironment = [
      "ZENBU_UI_TEST_FRESH": "1",
      "ZENBU_ACCOUNT_API_URL": Self.offlineAccountService,
    ].merging(environment) { $1 }
    app.launch()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: Self.patience))
    return app
  }

  func find(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)[identifier].firstMatch
  }

  func labeled(_ label: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", label)).firstMatch
  }

  @discardableResult
  func waitFor(
    _ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) -> XCUIElement {
    XCTAssertTrue(
      element.waitForExistence(timeout: Self.patience), "\(element) never appeared",
      file: file, line: line)
    return element
  }

  func waitUntilGone(
    _ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) {
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element)
    XCTAssertEqual(
      XCTWaiter().wait(for: [gone], timeout: Self.patience), .completed,
      "\(element) stayed", file: file, line: line)
  }

  static let scrollingContainers: Set<XCUIElement.ElementType> = [
    .scrollView, .table, .collectionView, .outline, .webView,
  ]

  static let controls: Set<XCUIElement.ElementType> = [
    .button, .cell, .textField, .secureTextField, .searchField, .textView, .switch, .toggle,
    .segmentedControl, .radioButton, .checkBox, .menuButton, .popUpButton, .link, .slider,
  ]

  func assertOnScreen(
    _ element: XCUIElement, in app: XCUIApplication, file: StaticString = #filePath,
    line: UInt = #line
  ) {
    waitFor(element, file: file, line: line)
    if Self.controls.contains(element.elementType) {
      XCTAssertTrue(element.isHittable, "\(element) can't be reached", file: file, line: line)
    }
    let window = app.windows.firstMatch.frame
    let frame = element.frame
    XCTAssertFalse(frame.isEmpty, "\(element) has no size", file: file, line: line)
    if Self.scrollingContainers.contains(element.elementType) {
      XCTAssertTrue(
        window.contains(CGPoint(x: frame.midX, y: frame.minY + 1)),
        "\(element) at \(frame) starts outside the window at \(window)", file: file, line: line)
      return
    }
    XCTAssertTrue(
      window.insetBy(dx: -1, dy: -1).contains(frame),
      "\(element) at \(frame) is clipped by the window at \(window)", file: file, line: line)
  }

  func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    waitFor(element, file: file, line: line)
    element.tap()
  }

  func type(_ text: String, into element: XCUIElement) {
    tap(element)
    element.typeText(text)
  }
}
