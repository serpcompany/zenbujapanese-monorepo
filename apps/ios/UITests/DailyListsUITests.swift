import XCTest

final class DailyListsUITests: ZenbuUITestCase {
  static let seededDays = ["ZENBU_DAILY_LISTS": "12"]
  private static let taberu = "result.042e07f7052f611fed33ddddf37f55fd"

  func testTheDaysNewLearningWordsGoInTodaysListWhichCantBeRenamedOrDeleted() {
    let app = launch()
    search("japan", in: app)
    chooseLeadingAction("mark-learning", onRow: "result.japan", in: app)
    returnToRecentSearches(in: app)
    type("taberu\n", into: searchField(in: app))
    chooseLeadingAction("mark-learning", onRow: Self.taberu, in: app)
    let today = openDailyLists(in: app)
    waitUntil(today, "label BEGINSWITH %@", "Today, 2 words so far")
    tap(today)
    waitFor(app.navigationBars["Today"])
    waitUntil("both words in today's list") { self.words(in: app).count == 2 }
    tap(find("word-list.more-menu", in: app))
    waitFor(find("word-list.select", in: app))
    XCTAssertFalse(find("word-list.rename", in: app).exists)
    XCTAssertFalse(find("word-list.delete", in: app).exists)
  }

  func testDailyListsAreGroupedUnderThisWeekAndThenByMonthNewestFirst() {
    let app = launch(Self.seededDays)
    open(.account, in: app)
    tap(reveal(find("account.lists", in: app), in: app))
    let row = waitFor(find("word-lists.daily-lists", in: app))
    waitUntil(row, mentions: "12")
    let ownLists = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'word-lists.list.'"))
    waitFor(ownLists.firstMatch)
    XCTAssertEqual(ownLists.count, 1)
    tap(row)
    let lists = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'daily-lists.list.'"))
    waitFor(lists.firstMatch)
    waitUntil(lists.firstMatch, "label BEGINSWITH %@", "Yesterday, ")
    waitFor(labeled("This week", in: app))
    let lastWeek = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
    waitFor(labeled(lastWeek.formatted(.dateTime.month(.wide).year()), in: app))
    let days = lists.allElementsBoundByIndex.map(\.identifier)
    XCTAssertEqual(days, days.sorted(by: >))
    tap(lists.firstMatch)
    waitFor(app.navigationBars["Yesterday"])
    waitUntil("yesterday's words") { !self.words(in: app).isEmpty }
  }

  private func openDailyLists(in app: XCUIApplication) -> XCUIElement {
    open(.account, in: app)
    tap(reveal(find("account.lists", in: app), in: app))
    tap(find("word-lists.daily-lists", in: app))
    return waitFor(firstElement(identifiedBy: "daily-lists.list.", in: app))
  }

  private func words(in app: XCUIApplication) -> [XCUIElement] {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'word-list.item.'"))
      .allElementsBoundByIndex
  }
}
