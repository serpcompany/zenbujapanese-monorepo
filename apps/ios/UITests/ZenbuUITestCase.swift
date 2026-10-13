import XCTest

@MainActor
class ZenbuUITestCase: XCTestCase {
  static let offlineAccountService = "http://127.0.0.1:9"
  static let patience =
    ProcessInfo.processInfo.environment["ZENBU_UI_TEST_PATIENCE"].flatMap(TimeInterval.init) ?? 90
  static let layoutPatience: TimeInterval = 5

  let fixtures = URL(filePath: #filePath)
    .deletingLastPathComponent()
    .appending(path: "../Modules/Tests/SearchExperienceTests/Fixtures/ImageText")
    .standardizedFileURL

  var device: TestDevice.Kind { TestDevice.kind }
  private var launched: XCUIApplication?

  func launch(_ environment: [String: String] = [:], arguments: [String] = []) -> XCUIApplication {
    continueAfterFailure = false
    TestDevice.turn(landscape: false)
    let app = XCUIApplication()
    launched = app
    app.launchArguments = TestDevice.launchArguments + arguments
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

  func showing(_ text: String) -> NSPredicate {
    device == .mac
      ? NSPredicate(
        format: "label == %@ OR value == %@ OR title == %@ OR label BEGINSWITH %@", text, text, text,
        text + ",")
      : NSPredicate(format: "label == %@", text)
  }

  func sheet(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    device == .mac ? app.sheets.firstMatch : find(identifier, in: app)
  }

  @discardableResult
  func waitForSheet(
    _ identifier: String, in app: XCUIApplication, file: StaticString = #filePath,
    line: UInt = #line
  ) -> XCUIElement {
    let sheet = waitFor(sheet(identifier, in: app), file: file, line: line)
    guard device == .mac else { return sheet }
    let frame = sheet.frame
    XCTAssertGreaterThan(
      min(frame.width, frame.height), 400, "the sheet at \(frame) has no room for its content",
      file: file, line: line)
    XCTAssertTrue(
      app.windows.firstMatch.frame.contains(frame), "the sheet at \(frame) leaves the window",
      file: file, line: line)
    return sheet
  }

  func prompt(in app: XCUIApplication) -> XCUIElement {
    device == .mac
      ? app.sheets.matching(NSPredicate(format: "label == 'alert'")).firstMatch
      : app.alerts.firstMatch
  }

  func text(of element: XCUIElement) -> String {
    let label = element.label
    guard label.isEmpty, device == .mac else { return label }
    return element.value as? String ?? element.title
  }

  func waitUntil(
    _ element: XCUIElement, mentions text: String, file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let mentioned = device == .mac ? "label CONTAINS %@ OR value CONTAINS %@" : "label CONTAINS %@"
    waitUntil(element, mentioned, text, text, file: file, line: line)
  }

  func labeled(_ label: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any).matching(showing(label)).firstMatch
  }

  @discardableResult
  func waitFor(
    _ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) -> XCUIElement {
    if !element.waitForExistence(timeout: Self.patience) {
      attachWhatIsOnScreen()
      let stopped = launched?.state == .notRunning ? ": the app is no longer running" : ""
      XCTFail("\(element) never appeared\(stopped)", file: file, line: line)
    }
    return element
  }

  func attachWhatIsOnScreen() {
    guard let launched else { return }
    let hierarchy = XCTAttachment(string: launched.debugDescription)
    hierarchy.name = "What was on screen"
    hierarchy.lifetime = .keepAlways
    add(hierarchy)
  }

  func waitUntilGone(
    _ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) {
    waitUntil(element, "exists == false", file: file, line: line)
  }

  func waitUntil(
    _ element: XCUIElement, _ condition: String, _ values: Any..., file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let met = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: condition, argumentArray: values), object: element)
    if XCTWaiter().wait(for: [met], timeout: Self.patience) != .completed {
      attachWhatIsOnScreen()
      XCTFail("\(element) never met \(condition) \(values)", file: file, line: line)
    }
  }

  func waitUntilStill(_ element: XCUIElement) {
    var frame = waitFor(element).frame
    let deadline = Date.now.addingTimeInterval(Self.patience)
    while Date.now < deadline {
      RunLoop.current.run(until: Date.now.addingTimeInterval(1))
      let next = element.frame
      if next == frame { return }
      frame = next
    }
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
      XCTAssertTrue(isReachable(element, in: app), "\(element) can't be reached", file: file, line: line)
    }
    let window = app.windows.firstMatch.frame
    let laidOut = Date.now.addingTimeInterval(Self.layoutPatience)
    var frame = element.frame
    while frame.isEmpty, Date.now < laidOut {
      RunLoop.current.run(until: Date.now.addingTimeInterval(0.2))
      frame = element.frame
    }
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

  func isReachable(
    _ element: XCUIElement, in app: XCUIApplication, within container: XCUIElement? = nil
  ) -> Bool {
    reachableFrame(of: element, in: app, within: container) != nil
  }

  func reachableFrame(
    of element: XCUIElement, in app: XCUIApplication, within container: XCUIElement? = nil
  ) -> CGRect? {
    guard element.exists else { return nil }
    let frame = element.frame
    var bounds = (container ?? app.windows.firstMatch).frame
    if container != nil {
      bounds.origin.y += bounds.height * 0.15
      bounds.size.height *= 0.85
    }
    return !frame.isEmpty && bounds.contains(CGPoint(x: frame.midX, y: frame.midY)) ? frame : nil
  }

  @discardableResult
  func firstReachable(
    _ queries: [XCUIElementQuery], in app: XCUIApplication, file: StaticString = #filePath,
    line: UInt = #line
  ) -> (element: XCUIElement, frame: CGRect) {
    let deadline = Date.now.addingTimeInterval(Self.patience)
    while Date.now < deadline {
      for query in queries {
        for element in query.allElementsBoundByIndex {
          if let frame = reachableFrame(of: element, in: app) { return (element, frame) }
        }
      }
      RunLoop.current.run(until: Date.now.addingTimeInterval(0.5))
    }
    attachWhatIsOnScreen()
    XCTFail("nothing in \(queries) could be reached", file: file, line: line)
    return (queries[0].firstMatch, .zero)
  }

  func tapWhereReachable(_ queries: [XCUIElementQuery], in app: XCUIApplication) {
    let frame = firstReachable(queries, in: app).frame
    let window = app.windows.firstMatch
    let origin = window.frame.origin
    window.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: frame.midX - origin.x, dy: frame.midY - origin.y)).tap()
  }

  func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    waitFor(element, file: file, line: line)
    guard device == .mac, element.elementType == .menuItem,
      let window = launched?.windows.firstMatch
    else { return element.tap() }
    waitUntil(element, "isHittable == true", file: file, line: line)
    let deadline = Date.now.addingTimeInterval(Self.patience)
    var frame = element.frame
    while !frame.isOnScreen, Date.now < deadline {
      RunLoop.current.run(until: Date.now.addingTimeInterval(0.1))
      frame = element.frame
    }
    guard frame.isOnScreen else {
      attachWhatIsOnScreen()
      return XCTFail("\(element) was never laid out", file: file, line: line)
    }
    let origin = window.frame.origin
    window.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: frame.midX - origin.x, dy: frame.midY - origin.y)).tap()
  }

  func isHittable(_ element: XCUIElement, within seconds: TimeInterval) -> Bool {
    let hittable = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "isHittable == true"), object: element)
    return XCTWaiter().wait(for: [hittable], timeout: seconds) == .completed
  }

  @discardableResult
  func tap(
    _ row: XCUIElement, toShow shown: XCUIElement, file: StaticString = #filePath,
    line: UInt = #line
  ) -> XCUIElement {
    guard !shown.exists else { return shown }
    tap(row, file: file, line: line)
    for _ in 0..<2 where !shown.waitForExistence(timeout: Self.patience / 3) && row.exists {
      row.tap()
    }
    return waitFor(shown, file: file, line: line)
  }

  func type(_ text: String, into element: XCUIElement) {
    tap(element)
    if device != .mac, let app = launched {
      let focused = app.descendants(matching: .any)
        .matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
      for _ in 0..<2 where !focused.waitForExistence(timeout: Self.layoutPatience) {
        element.tap()
      }
    }
    element.typeText(text)
  }
}

extension CGRect {
  fileprivate var isOnScreen: Bool {
    !isNull && !isInfinite && !isEmpty && origin.x.isFinite && origin.y.isFinite
  }
}
