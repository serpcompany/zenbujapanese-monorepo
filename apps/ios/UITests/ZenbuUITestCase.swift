import XCTest

@MainActor
class ZenbuUITestCase: XCTestCase {
  static let offlineAccountService = "http://127.0.0.1:9"
  static let patience =
    ProcessInfo.processInfo.environment["ZENBU_UI_TEST_PATIENCE"].flatMap(TimeInterval.init) ?? 90
  static let lookInterval: TimeInterval = 0.1
  static let sheetRoom: CGFloat = 400

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
    var frame = CGRect.zero
    var window = CGRect.zero
    _ = comesTrue("the sheet to open fully inside the window", within: Self.patience) {
      frame = sheet.frame
      window = app.windows.firstMatch.frame
      return min(frame.width, frame.height) > Self.sheetRoom && window.contains(frame)
    }
    XCTAssertGreaterThan(
      min(frame.width, frame.height), Self.sheetRoom,
      "the sheet at \(frame) has no room for its content", file: file, line: line)
    XCTAssertTrue(
      window.contains(frame), "the sheet at \(frame) leaves the window", file: file, line: line)
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
    if !appears(element, within: Self.patience) {
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

  func comesTrue(
    _ awaited: @autoclosure () -> String, within limit: TimeInterval, _ condition: () -> Bool
  ) -> Bool {
    var looked = Date.now
    let deadline = looked.addingTimeInterval(limit)
    if condition() { return true }
    let wait = "Wait up to \(String(format: "%g", limit))s for \(awaited())"
    return XCTContext.runActivity(named: wait) { _ in
      while Date.now < deadline {
        let lookTook = Date.now.timeIntervalSince(looked)
        let nextLook = Date.now.addingTimeInterval(max(Self.lookInterval, lookTook))
        RunLoop.current.run(until: min(deadline, nextLook))
        looked = .now
        if condition() { return true }
      }
      return false
    }
  }

  func appears(_ element: XCUIElement, within limit: TimeInterval) -> Bool {
    comesTrue("\(element) to exist", within: limit) { element.exists }
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
    let met = NSPredicate(format: condition, argumentArray: values)
    waitUntil(
      "\(element) meeting \(condition) \(values)",
      orFailSaying: "\(element) never met \(condition) \(values)", file: file, line: line
    ) { met.evaluate(with: element) }
  }

  func waitUntil(
    _ awaited: String, orFailSaying failure: String? = nil, file: StaticString = #filePath,
    line: UInt = #line, _ condition: () -> Bool
  ) {
    if comesTrue(awaited, within: Self.patience, condition) { return }
    attachWhatIsOnScreen()
    XCTFail(failure ?? "\(awaited) never happened", file: file, line: line)
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
    var frame = CGRect.zero
    _ = comesTrue("\(element) to have a size", within: Self.patience) {
      frame = element.frame
      return !frame.isEmpty
    }
    XCTAssertFalse(frame.isEmpty, "\(element) has no size", file: file, line: line)
    if Self.controls.contains(element.elementType) {
      XCTAssertTrue(isReachable(element, in: app), "\(element) can't be reached", file: file, line: line)
    }
    let window = app.windows.firstMatch.frame
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
    var reached: (element: XCUIElement, frame: CGRect)?
    _ = comesTrue("one of \(queries.count) queries to find something in reach", within: Self.patience) {
      for query in queries {
        for element in query.allElementsBoundByIndex {
          if let frame = reachableFrame(of: element, in: app) {
            reached = (element, frame)
            return true
          }
        }
      }
      return false
    }
    if let reached { return reached }
    attachWhatIsOnScreen()
    XCTFail("nothing in \(queries) could be reached", file: file, line: line)
    return (queries[0].firstMatch, .zero)
  }

  func tapWhereReachable(_ queries: [XCUIElementQuery], in app: XCUIApplication) {
    let frame = firstReachable(queries, in: app).frame
    point(x: frame.midX, y: frame.midY, in: app.windows.firstMatch).tap()
  }

  func point(x: CGFloat, y: CGFloat, in window: XCUIElement) -> XCUICoordinate {
    let origin = window.frame.origin
    return window.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: x - origin.x, dy: y - origin.y))
  }

  func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    waitFor(element, file: file, line: line)
    guard device == .mac, element.elementType == .menuItem,
      let window = launched?.windows.firstMatch
    else { return element.tap() }
    waitUntil(element, "isHittable == true", file: file, line: line)
    var frame = CGRect.zero
    let laidOut = comesTrue("\(element) to be laid out", within: Self.patience) {
      frame = element.frame
      return frame.isOnScreen
    }
    guard laidOut else {
      attachWhatIsOnScreen()
      return XCTFail("\(element) was never laid out", file: file, line: line)
    }
    point(x: frame.midX, y: frame.midY, in: window).tap()
  }

  func isHittable(_ element: XCUIElement, within seconds: TimeInterval) -> Bool {
    comesTrue("\(element) to be hittable", within: seconds) { element.isHittable }
  }

  @discardableResult
  func tap(
    _ row: XCUIElement, toShow shown: XCUIElement, file: StaticString = #filePath,
    line: UInt = #line
  ) -> XCUIElement {
    guard !shown.exists else { return shown }
    tap(row, file: file, line: line)
    for _ in 0..<2 {
      if appears(shown, within: Self.patience / 3) { return shown }
      if row.exists { row.tap() }
    }
    return waitFor(shown, file: file, line: line)
  }

  func type(
    _ text: String, into element: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) {
    focus(element, file: file, line: line)
    element.typeText(text)
  }

  func focus(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    tap(element, file: file, line: line)
    guard device != .mac, let app = launched else { return }
    let focused = app.descendants(matching: .any)
      .matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
    for _ in 0..<2 {
      if appears(focused, within: Self.patience / 3) { return }
      element.tap()
    }
    waitFor(focused, file: file, line: line)
  }
}

extension CGRect {
  fileprivate var isOnScreen: Bool {
    !isNull && !isInfinite && !isEmpty && origin.x.isFinite && origin.y.isFinite
  }
}
