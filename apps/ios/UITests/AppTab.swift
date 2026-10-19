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
    let onThisDevice =
      switch device {
      case .phone: app.tabBars.buttons
      case .pad: app.buttons
      case .mac: app.toolbars.radioButtons
      }
    let anywhere = [
      app.tabBars.buttons,
      app.toolbars.radioButtons,
      app.descendants(matching: .tab),
      app.outlines.cells,
      app.outlines.staticTexts,
      app.collectionViews.cells,
      app.collectionViews.buttons,
      app.buttons,
    ]
    return firstReachable(
      ([onThisDevice] + anywhere).map { $0.matching(label) }, in: app
    ).element
  }

  func open(_ tab: AppTab, in app: XCUIApplication) {
    let root = find(tab.rootIdentifier, in: app)
    for _ in 0..<3 {
      tabItem(tab, in: app).tap()
      if appears(root, within: Self.patience / 3) { return }
    }
    waitFor(root)
  }

  func shortcut(_ key: String, _ modifiers: XCUIElement.KeyModifierFlags = .command, in app: XCUIApplication) {
    app.typeKey(key, modifierFlags: modifiers)
  }

  func press(
    _ key: String, _ modifiers: XCUIElement.KeyModifierFlags = .command, until element: XCUIElement,
    in app: XCUIApplication
  ) {
    for _ in 0..<3 {
      shortcut(key, modifiers, in: app)
      if appears(element, within: Self.patience / 3) { return }
    }
    waitFor(element)
  }

  func goBack(in app: XCUIApplication) {
    if device == .mac {
      tap(app.toolbars.buttons["Back"].firstMatch)
    } else {
      tap(app.navigationBars.buttons.element(boundBy: 0))
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
