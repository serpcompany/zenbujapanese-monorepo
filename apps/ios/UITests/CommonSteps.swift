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

  func name(_ text: String, in app: XCUIApplication, button: String = "Create") {
    let prompt = waitFor(app.alerts.firstMatch)
    let field = prompt.textFields.firstMatch
    tap(field)
    if let current = field.value as? String, !current.isEmpty, current != field.placeholderValue {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(text)
    prompt.buttons[button].tap()
  }

  @discardableResult
  func reveal(_ element: XCUIElement, in app: XCUIApplication) -> XCUIElement {
    let screen = app.windows.firstMatch
    for _ in 0..<8 where !(element.exists && element.isHittable) {
      if device == .mac {
        screen.scroll(byDeltaX: 0, deltaY: -300)
      } else {
        screen.swipeUp()
      }
    }
    return waitFor(element)
  }

  func revealRowActions(on row: XCUIElement) {
    if device == .mac {
      waitFor(row).rightClick()
    } else {
      waitFor(row).swipeLeft()
    }
  }
}
