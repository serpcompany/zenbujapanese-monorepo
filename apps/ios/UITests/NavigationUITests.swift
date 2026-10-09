import XCTest

final class NavigationUITests: ZenbuUITestCase {
  func testEveryTabOpensItsScreenWithItsMainControlsOnScreen() {
    let app = launch()
    for tab in [AppTab.translate, .player, .account, .search] {
      open(tab, in: app)
      assertOnScreen(find(tab.rootIdentifier, in: app), in: app)
      assertOnScreen(tabItem(tab, in: app), in: app)
    }
  }

  func testTheTabShellListsEveryTabInOrder() {
    let app = launch()
    let items = AppTab.allCases.map { tabItem($0, in: app) }
    let runsAcross = device != .mac
    let positions = items.map { runsAcross ? $0.frame.minX : $0.frame.minY }
    XCTAssertEqual(positions, positions.sorted(), "the tabs are in Search, Translate, Player, Account order")
    switch device {
    case .phone:
      XCTAssertTrue(app.tabBars.firstMatch.exists, "the iPhone has its tab bar")
      XCTAssertGreaterThan(items[0].frame.minY, app.windows.firstMatch.frame.midY, "at the bottom")
    case .pad:
      XCTAssertLessThan(items[0].frame.minY, app.windows.firstMatch.frame.midY, "at the top")
    case .mac:
      XCTAssertLessThan(items[0].frame.minX, app.windows.firstMatch.frame.midX, "in the sidebar")
    }
  }

  func testWideScreensListTheTabsInASidebar() {
    let app = launch()
    let sidebarToggle = app.buttons
      .matching(NSPredicate(format: "label CONTAINS[c] 'sidebar'")).firstMatch
    switch device {
    case .phone:
      XCTAssertFalse(sidebarToggle.exists, "the iPhone has no sidebar")
    case .pad:
      tap(sidebarToggle)
      for tab in AppTab.allCases {
        waitFor(
          app.collectionViews.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", tab.rawValue)).firstMatch)
      }
    case .mac:
      for tab in AppTab.allCases {
        XCTAssertTrue(tabItem(tab, in: app).exists, "the sidebar lists \(tab.rawValue)")
      }
    }
  }
}
