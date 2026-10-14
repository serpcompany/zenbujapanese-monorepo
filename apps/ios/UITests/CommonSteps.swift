import XCTest

extension ZenbuUITestCase {
  func openFixtureImage() throws -> XCUIApplication {
    let fixture = fixtures.appending(path: "horizontal-japanese.png")
    let onMac = device == .mac
    let app = launch(onMac ? [:] : ["ZENBU_CAMERA_IMAGE": fixture.path])
    if onMac { TestDevice.copyImage(try Data(contentsOf: fixture)) }
    open(.translate, in: app)
    tap(find("translate.start.image", in: app))
    tap(app.buttons[onMac ? "Paste Image" : "Take Photo"].firstMatch)
    return app
  }

  @discardableResult
  func markJapanKnownFromItsResult(in app: XCUIApplication) -> XCUIElement {
    search("japan", in: app)
    return markJapanKnown(in: app)
  }

  @discardableResult
  func markJapanKnown(in app: XCUIApplication) -> XCUIElement {
    let row = find("result.japan", in: app)
    if device == .mac { waitFor(row).rightClick() } else { waitFor(row).swipeRight() }
    tap(find("result.japan.mark-known", in: app))
    return row
  }

  func menuChoices(in app: XCUIApplication) -> XCUIElementQuery {
    device == .mac ? app.windows.menuItems : app.buttons
  }

  func menuChoices(_ label: String, in app: XCUIApplication) -> XCUIElementQuery {
    let named = device == .mac ? "title == %@ OR title BEGINSWITH %@" : "label == %@ OR label BEGINSWITH %@"
    return menuChoices(in: app).matching(NSPredicate(format: named, label, label + ","))
  }

  func menuChoice(_ label: String, in app: XCUIApplication) -> XCUIElement {
    menuChoices(label, in: app).firstMatch
  }

  func chooseFromSortedBy(_ row: String, _ choice: String, in app: XCUIApplication) {
    let sortedBy = app.descendants(matching: .any).matching(identifier: "search.sort-menu")
    let opened = menuChoice(row, in: app)
    let chosen = menuChoice(choice, in: app)
    for _ in 0..<3 {
      for _ in 0..<3 {
        if opened.exists { break }
        tapWhereReachable([sortedBy.staticTexts, sortedBy], in: app)
        if appears(opened, within: Self.patience / 3) { break }
      }
      tap(opened)
      if device != .mac || isHittable(chosen, within: Self.patience / 6) { break }
      TestDevice.closeMenu(in: app)
    }
    tap(chosen)
  }

  func sortedByRow(saying text: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier == 'search.sort-menu' AND label CONTAINS %@", text))
      .firstMatch
  }

  func closeInputPanel(in app: XCUIApplication) {
    if device == .mac {
      tap(find("sheet.done", in: app))
      return
    }
    let grabber = waitFor(app.buttons["Sheet Grabber"]).coordinate(
      withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    grabber.press(forDuration: 0.1, thenDragTo: grabber.withOffset(CGVector(dx: 0, dy: 600)))
  }

  @discardableResult
  func switchInputPanel(to input: String, showing content: String, in app: XCUIApplication)
    -> XCUIElement
  {
    let shown = find(content, in: app)
    let buttons = app.descendants(matching: .any).matching(identifier: "search.input.\(input)")
    waitFor(buttons.firstMatch)
    for index in 0..<buttons.count {
      if shown.exists { break }
      buttons.element(boundBy: index).tap()
      if appears(shown, within: Self.patience / 3) { break }
    }
    return waitFor(shown)
  }

  func word(containing text: String, identifiedBy prefix: String, in app: XCUIApplication)
    -> XCUIElement
  {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH %@ AND identifier CONTAINS %@", prefix, text))
      .firstMatch
  }

  func openKanji(_ kanji: String, fromWordIdentifiedBy prefix: String, in app: XCUIApplication) {
    tap(word(containing: kanji, identifiedBy: prefix, in: app))
    tap(inWordSheet("word-detail.kanji.\(kanji)", in: app), toShow: find("kanji-detail.glyph", in: app))
    waitUntilGone(sheet("recognized-word-sheet", in: app))
  }

  func inWordSheet(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    let sheet = waitForSheet("recognized-word-sheet", in: app)
    waitFor(find("word-detail.screen", in: app))
    return reveal(find(identifier, in: app), in: app, within: sheet)
  }

  func name(_ text: String, in app: XCUIApplication, button: String = "Create") {
    let prompt = waitFor(prompt(in: app))
    let field = prompt.textFields.firstMatch
    focus(field)
    if let current = field.value as? String, !current.isEmpty, current != field.placeholderValue {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(text)
    tap(prompt.buttons[button].firstMatch)
  }

  @discardableResult
  func reveal(
    _ element: XCUIElement, in app: XCUIApplication, within container: XCUIElement? = nil,
    scrolling list: XCUIElement? = nil
  ) -> XCUIElement {
    let area = container ?? app.windows.firstMatch
    let scrolled = list ?? area
    var lastLongList: String?
    _ = comesTrue("\(element) to exist, or a list to show it goes on below", within: 5) {
      if element.exists { return true }
      let longList = listGoingOnBelow(in: scrolled)
      defer { lastLongList = longList }
      return longList != nil && longList == lastLongList
    }
    var isAbove = false
    for _ in 0..<12 {
      if isReachable(element, in: app, within: container) { break }
      if let laidOut = laidOutFrame(of: element) { isAbove = laidOut.midY < area.frame.midY }
      if device == .mac {
        scrolled.scroll(byDeltaX: 0, deltaY: isAbove ? 150 : -150)
      } else if isAbove {
        scrolled.swipeDown(velocity: .slow)
      } else {
        scrolled.swipeUp(velocity: .slow)
      }
    }
    return waitFor(element)
  }

  func laidOutFrame(of element: XCUIElement) -> CGRect? {
    guard let shown = try? element.snapshot(), !shown.frame.isEmpty else { return nil }
    return shown.frame
  }

  func listGoingOnBelow(in area: XCUIElement) -> String? {
    guard device != .mac else { return nil }
    let longList = NSPredicate(
      format: "label BEGINSWITH 'Vertical scroll bar,' AND NOT (label ENDSWITH ' 1 page')")
    guard let bar = try? area.descendants(matching: .any).matching(longList).firstMatch.snapshot()
    else { return nil }
    let shown = "\(bar.label), \(bar.value ?? "")"
    return shown.hasSuffix(", 100%") ? nil : shown
  }

  func shrinkWindow(in app: XCUIApplication) {
    let window = app.windows.firstMatch
    let corner = window.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1))
      .withOffset(CGVector(dx: -3, dy: -3))
    let target = window.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
      .withOffset(CGVector(dx: 50, dy: 50))
    corner.press(forDuration: 0.3, thenDragTo: target)
  }

  func flip(_ toggle: XCUIElement) {
    if device == .mac {
      waitFor(toggle).tap()
    } else {
      waitFor(toggle).coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5))
        .withOffset(CGVector(dx: -45, dy: 0)).tap()
    }
  }

  func choose(_ segment: String, in control: XCUIElement) {
    let button = waitFor(control).descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", segment)).firstMatch
    var chosen = isOn(button)
    for _ in 0..<3 {
      if chosen { break }
      button.tap()
      chosen = comesTrue("\(segment) to be chosen", within: Self.patience / 3) { isOn(button) }
    }
    XCTAssertTrue(chosen, "\(segment) didn't take")
  }

  func isOn(_ control: XCUIElement) -> Bool {
    control.isSelected || "\(control.value ?? "")" == "1"
  }

  func openContextMenu(on element: XCUIElement) {
    if device == .mac {
      waitFor(element).rightClick()
    } else {
      waitFor(element).press(forDuration: 1.2)
    }
  }

  func revealRowActions(on row: XCUIElement) {
    if device == .mac {
      waitFor(row).rightClick()
    } else {
      waitFor(row).swipeLeft()
    }
  }
}
