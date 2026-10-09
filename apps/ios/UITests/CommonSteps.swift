import XCTest

extension ZenbuUITestCase {
  func openFixtureImage() throws -> XCUIApplication {
    let fixture = fixtures.appending(path: "horizontal-japanese.png")
    let onMac = device == .mac
    let app = launch(onMac ? [:] : ["ZENBU_CAMERA_IMAGE": fixture.path])
    if onMac { TestDevice.copyImage(try Data(contentsOf: fixture)) }
    open(.translate, in: app)
    tap(find("translate.start.camera", in: app))
    tap(find("translate.start", in: app))
    tap(find(onMac ? "image-source.paste" : "image-source.camera", in: app))
    return app
  }

  @discardableResult
  func markJapanKnownFromItsResult(in app: XCUIApplication) -> XCUIElement {
    search("japan", in: app)
    let row = find("result.japan", in: app)
    if device == .mac { waitFor(row).rightClick() } else { waitFor(row).swipeRight() }
    tap(find("result.japan.mark-known", in: app))
    return row
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
    tap(inWordSheet("word-detail.kanji.\(kanji)", in: app))
    waitFor(find("kanji-detail.glyph", in: app))
    waitUntilGone(find("recognized-word-sheet", in: app))
  }

  func inWordSheet(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    let sheet = waitFor(find("recognized-word-sheet", in: app))
    waitFor(find("word-detail.screen", in: app))
    return reveal(find(identifier, in: app), in: app, within: sheet)
  }

  func name(_ text: String, in app: XCUIApplication, button: String = "Create") {
    let prompt = waitFor(app.alerts.firstMatch)
    let field = prompt.textFields.firstMatch
    tap(field)
    if let current = field.value as? String, !current.isEmpty, current != field.placeholderValue {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(text)
    prompt.buttons[button].firstMatch.tap()
  }

  @discardableResult
  func reveal(
    _ element: XCUIElement, in app: XCUIApplication, within container: XCUIElement? = nil
  ) -> XCUIElement {
    let area = container ?? app.windows.firstMatch
    _ = element.waitForExistence(timeout: 5)
    for _ in 0..<12 where !isReachable(element, in: app, within: container) {
      let isAbove = element.exists && element.frame.midY < area.frame.midY
      if device == .mac {
        area.scroll(byDeltaX: 0, deltaY: isAbove ? 150 : -150)
      } else if isAbove {
        area.swipeDown(velocity: .slow)
      } else {
        area.swipeUp(velocity: .slow)
      }
    }
    return waitFor(element)
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
    for _ in 0..<3 where !button.isSelected {
      button.tap()
      RunLoop.current.run(until: Date.now.addingTimeInterval(1))
    }
    XCTAssertTrue(button.isSelected, "\(segment) didn't take")
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
