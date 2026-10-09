import XCTest

enum AppTab: String, CaseIterable {
  case search = "Search"
  case translate = "Translate"
  case player = "Player"
  case account = "Account"

  var rootIdentifier: String {
    switch self {
    case .search: "search.field"
    case .translate: "translate.start"
    case .player: "watch.empty"
    case .account: "account.profile"
    }
  }

  var shortcut: String {
    switch self {
    case .search: "1"
    case .translate: "2"
    case .player: "3"
    case .account: "4"
    }
  }
}

extension ZenbuUITestCase {
  func tabItem(_ tab: AppTab, in app: XCUIApplication) -> XCUIElement {
    let label = NSPredicate(format: "label BEGINSWITH %@", tab.rawValue)
    let candidates = [
      app.tabBars.buttons.matching(label).firstMatch,
      app.outlines.cells.matching(label).firstMatch,
      app.outlines.staticTexts.matching(label).firstMatch,
      app.collectionViews.cells.matching(label).firstMatch,
      app.collectionViews.buttons.matching(label).firstMatch,
    ]
    let deadline = Date.now.addingTimeInterval(Self.patience)
    while Date.now < deadline {
      if let found = candidates.first(where: { $0.exists && $0.isHittable }) { return found }
      RunLoop.current.run(until: Date.now.addingTimeInterval(0.5))
    }
    XCTFail("no tab item for \(tab.rawValue)")
    return candidates[0]
  }

  func open(_ tab: AppTab, in app: XCUIApplication) {
    tabItem(tab, in: app).tap()
    waitFor(find(tab.rootIdentifier, in: app))
  }

  func shortcut(_ key: String, _ modifiers: XCUIElement.KeyModifierFlags = .command, in app: XCUIApplication) {
    app.typeKey(key, modifierFlags: modifiers)
  }

  func goBack(in app: XCUIApplication) {
    if device == .mac {
      shortcut("[", in: app)
    } else {
      app.navigationBars.buttons.element(boundBy: 0).tap()
    }
  }

  func search(_ query: String, in app: XCUIApplication) {
    open(.search, in: app)
    let field = find("search.field", in: app)
    type(query + "\n", into: field)
    waitFor(find("search.results", in: app))
  }

  func firstElement(identifiedBy prefix: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch
  }
}
