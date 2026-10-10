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

  func testAPageOpensInEveryTabAfterVisitingTheOthers() {
    let app = launch(PlayerWatchUITests.standIn())
    let noConversations = labeled("No Conversations Yet", in: app)
    open(.translate, in: app)
    tap(find("translate.history", in: app), toShow: noConversations)
    goBack(in: app)
    open(.account, in: app)
    tap(reveal(find("account.known-words", in: app), in: app), toShow: find("known-words.empty", in: app))
    goBack(in: app)
    open(.player, in: app)
    type(PlayerWatchUITests.link + "\n", into: waitFor(searchField(in: app)))
    waitFor(find("watch.cue.0", in: app))
    goBack(in: app)
    search("japan", in: app)
    tap(find("result.japan", in: app), toShow: find("word-detail.screen", in: app))
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.screen", in: app))
    goBack(in: app)
    waitFor(find("word-detail.screen", in: app))
    open(.translate, in: app)
    tap(find("translate.history", in: app), toShow: noConversations)
  }

  func testTheTabShellListsEveryTabInOrder() {
    let app = launch()
    let items = AppTab.allCases.map { tabItem($0, in: app) }
    let positions = items.map(\.frame.minX)
    XCTAssertEqual(positions, positions.sorted(), "the tabs are in Search, Translate, Player, Account order")
    if device == .phone {
      XCTAssertTrue(app.tabBars.firstMatch.exists, "the iPhone has its tab bar")
      XCTAssertGreaterThan(items[0].frame.minY, app.windows.firstMatch.frame.midY, "at the bottom")
    } else {
      XCTAssertLessThan(items[0].frame.minY, app.windows.firstMatch.frame.midY, "at the top")
    }
  }

  func testOnlyTheIPadOpensItsTabsIntoASidebar() {
    let app = launch()
    let sidebarToggle = app.buttons
      .matching(NSPredicate(format: "label CONTAINS[c] 'sidebar'")).firstMatch
    guard device == .pad else {
      waitFor(tabItem(.search, in: app))
      XCTAssertFalse(sidebarToggle.exists, "the iPhone and the Mac keep their tabs in a bar")
      return
    }
    tap(sidebarToggle)
    for tab in AppTab.allCases {
      waitFor(
        app.collectionViews.descendants(matching: .any)
          .matching(NSPredicate(format: "label BEGINSWITH %@", tab.rawValue)).firstMatch)
    }
  }
}
