import XCTest

final class ProgressUITests: ZenbuUITestCase {
  func testProgressOpensFromTheTodayCardWithTheTotalsAndStreaksOfTheLog() {
    let app = launch(progressSeed)
    openProgress(from: "account.progress.see", in: app)
    waitUntil(
      find("progress.today", in: app), "label == %@", "Today, 4 of 10 new words, 6 more to go, 6-day streak")
    waitUntil(find("progress.known", in: app), "value == %@", "174, +16 in 7 days")
    waitUntil(find("progress.learning", in: app), "value == %@", "267, +76 in 7 days")
    waitUntil(find("progress.best-streak", in: app), "value BEGINSWITH %@", "9 days, ")
    waitUntil(find("progress.daily-average", in: app), "value == %@", "11.4, last 7 days")
    waitUntil(reveal(find("progress.jlpt.n5", in: app), in: app), "value CONTAINS %@", "% known")
    reveal(find("progress.known-over-time.chart", in: app), in: app)
  }

  func testProgressOpensFromItsRowAndSwitchesBetweenTheWeekAndTheMonth() {
    let app = launch(progressSeed)
    openProgress(from: "account.progress", in: app)
    let footer = reveal(find("progress.new-words.footer", in: app), in: app)
    waitUntil(footer, "label == %@", "Goal met 6 of 6 days · 76 words")
    tap(app.segmentedControls["progress.span"].buttons["Month"])
    waitUntil(footer, "label == %@", "Goal met 20 of 29 days · 283 words")
    goBack(in: app)
    openProgress(from: "account.progress", in: app)
    waitUntil(reveal(footer, in: app), "label == %@", "Goal met 6 of 6 days · 76 words")
  }

  func testTappingABarShowsThatDaysWordsAndGoal() {
    let app = launch(progressSeed)
    openProgress(from: "account.progress.see", in: app)
    let day = reveal(find("progress.new-words.day", in: app), in: app)
    waitUntil(day, "label ENDSWITH %@", " · 4 words · goal 10")
    let yesterday = Self.dayName(back: 1) + " · 15 words · goal met"
    let bar = find("progress.new-words.chart", in: app).descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", yesterday)).firstMatch
    tap(bar)
    waitUntil(day, "label == %@", yesterday)
  }

  func testProgressBeforeAnyWordSaysThereIsNothingYet() {
    let app = launch()
    openProgress(from: "account.progress", in: app)
    waitUntil(find("progress.today", in: app), "label == %@", "Today, 0 of 20 new words, 20 more to go")
    waitUntil(find("progress.best-streak", in: app), "value == %@", "—, No streak yet")
    waitUntil(find("progress.daily-average", in: app), "value == %@", "—, No days yet")
    waitUntil(reveal(find("progress.new-words.footer", in: app), in: app), "label == %@", "0 words so far")
    reveal(find("progress.known-over-time.empty", in: app), in: app)
  }

  private func openProgress(from identifier: String, in app: XCUIApplication) {
    open(.account, in: app)
    tap(reveal(find(identifier, in: app), in: app), toShow: find("progress.today", in: app))
  }

  private static func dayName(back days: Int) -> String {
    let day = Calendar.current.date(byAdding: .day, value: -days, to: .now) ?? .now
    return day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
  }
}

extension ZenbuUITestCase {
  var progressSeed: [String: String] {
    ["ZENBU_PROGRESS_SEED": fixtures.deletingLastPathComponent().appending(path: "Progress/dashboard.json").path]
  }
}
