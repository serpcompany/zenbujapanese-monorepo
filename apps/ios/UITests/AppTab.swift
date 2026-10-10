import XCTest

enum AppTab: String, CaseIterable {
  case search = "Search"
  case translate = "Translate"
  case player = "Player"
  case account = "Account"

  var rootIdentifier: String {
    switch self {
    case .search: "search.input.handwriting"
    case .translate: "translate.header"
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
    let label = NSPredicate(
      format: "label == %@ OR label BEGINSWITH %@", tab.rawValue, tab.rawValue + ",")
    return firstReachable(
      [
        app.tabBars.buttons.matching(label),
        app.descendants(matching: .tab).matching(label),
        app.outlines.cells.matching(label),
        app.outlines.staticTexts.matching(label),
        app.collectionViews.cells.matching(label),
        app.collectionViews.buttons.matching(label),
        app.buttons.matching(label),
      ], in: app
    ).element
  }

  func open(_ tab: AppTab, in app: XCUIApplication) {
    let root = find(tab.rootIdentifier, in: app)
    for _ in 0..<3 {
      tabItem(tab, in: app).tap()
      if root.waitForExistence(timeout: Self.patience / 3) { return }
    }
    waitFor(root)
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

  func searchField(in app: XCUIApplication) -> XCUIElement {
    app.searchFields.firstMatch
  }

  func search(_ query: String, in app: XCUIApplication) {
    open(.search, in: app)
    type(query + "\n", into: searchField(in: app))
    waitFor(find("search.results", in: app))
  }

  func closeSearchButton(in app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label IN {'Close', 'Cancel'}")).firstMatch
  }

  func returnToRecentSearches(in app: XCUIApplication) {
    switch device {
    case .phone: tap(closeSearchButton(in: app))
    case .pad: tap(labeled("Clear text", in: app))
    case .mac: tap(searchField(in: app).buttons["cancel"])
    }
    waitFor(find("recent-search.0", in: app))
  }

  func firstElement(identifiedBy prefix: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch
  }
}
