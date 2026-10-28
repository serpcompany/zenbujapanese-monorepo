import XCTest

extension ZenbuUITestCase {
  func flipShowSwitch(_ label: String, from menu: XCUIElement, in app: XCUIApplication) {
    let bar = waitFor(menu).frame
    tap(menu)
    let choice = waitFor(menuChoice(label, in: app))
    guard device != .mac else {
      tap(choice)
      return
    }
    let flipped = isOn(choice) ? "isSelected == false" : "isSelected == true"
    tap(choice)
    waitUntil(choice, flipped)
    let window = app.windows.firstMatch
    gesture { point(x: window.frame.minX + window.frame.width / 4, y: bar.midY, in: window).tap() }
    waitUntilGone(choice)
  }

  func assertTheMenuHidesAndShowsTranslations(
    _ translation: XCUIElement, from menu: XCUIElement, in app: XCUIApplication
  ) {
    waitFor(translation)
    flipShowSwitch("Translations", from: menu, in: app)
    waitUntilGone(translation)
    flipShowSwitch("Translations", from: menu, in: app)
    waitFor(translation)
  }

  func assertReadingAidsAreOff(_ aids: [String], in app: XCUIApplication) {
    open(.account, in: app)
    openReadingAids(showing: aids[0], in: app)
    for aid in aids {
      waitUntil(waitFor(find("reading-aids.\(aid)", in: app)), Self.switchedOff)
    }
  }

  @discardableResult
  func openReadingAids(showing aid: String, in app: XCUIApplication) -> XCUIElement {
    tapClearOfTheBars(
      find("account.reading-aids", in: app), toShow: find("reading-aids.\(aid)", in: app), in: app)
  }
}
