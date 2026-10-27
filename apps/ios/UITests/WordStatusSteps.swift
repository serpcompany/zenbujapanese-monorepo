import XCTest

extension ZenbuUITestCase {
  static let statusChosenBy = [
    "mark-unknown": "Unknown", "mark-learning": "Learning", "mark-known": "Known",
  ]

  func chooseStatus(_ status: String, from menu: XCUIElement, in app: XCUIApplication) {
    tap(menu)
    chooseStatus(status, in: app)
  }

  func chooseStatus(_ status: String, in app: XCUIApplication) {
    if device == .mac { return chooseFromSubmenu("Status", status, in: app) }
    tap(menuChoice("Status", in: app))
    tap(menuChoice(status, in: app))
  }

  func waitForTag(_ status: String, on identifier: String, in app: XCUIApplication) {
    waitUntil(find(identifier, in: app), "label == %@", status)
  }

  func keepScreenshot(named name: String, of app: XCUIApplication) {
    let screen = XCTAttachment(screenshot: app.screenshot())
    screen.name = name
    screen.lifetime = .keepAlways
    add(screen)
  }
}
