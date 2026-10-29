import XCTest

final class JLPTProgressUITests: ZenbuUITestCase {
  func testJLPTProgressOpensFromProgressOnN5WithItsPace() {
    let app = launch(progressSeed)
    openJLPTProgress(in: app)
    let ring = find("jlpt-progress.ring", in: app)
    waitUntil(ring, "label == %@", "22% of N5 known")
    waitUntil(ring, "value == %@", "147 Known, 134 Learning, 386 Not started")
    waitUntil(find("jlpt-progress.pace", in: app), "label == %@", Self.pace(level: "N5", days: 39))
    waitUntil(reveal(find("jlpt-progress.add", in: app), in: app), "label == %@", "Add 10 N5 words to Learning")
  }

  func testChoosingALevelByItsSegmentOrItsBarChangesTheCounts() {
    let app = launch(progressSeed)
    openJLPTProgress(in: app)
    let ring = find("jlpt-progress.ring", in: app)
    waitUntil(ring, "label == %@", "22% of N5 known")
    tap(app.segmentedControls["jlpt-progress.level"].buttons["N3"])
    waitUntil(ring, "label ENDSWITH %@", " of N3 known")
    waitUntil(ring, "value ENDSWITH %@", " \(1_598.formatted()) Not started")
    tap(reveal(find("jlpt-progress.bar.n4", in: app), in: app))
    reveal(app.segmentedControls["jlpt-progress.level"], in: app)
    waitUntil(ring, "label ENDSWITH %@", " of N4 known")
    waitUntil(ring, "value ENDSWITH %@", " 523 Not started")
    XCTAssertTrue(app.segmentedControls["jlpt-progress.level"].buttons["N4"].isSelected)
  }

  func testAddingTenMarksThemLearningAndRaisesTodaysCount() {
    let app = launch(progressSeed)
    open(.account, in: app)
    let today = find("account.progress.today", in: app)
    waitUntil(today, "label BEGINSWITH %@", "Today, 4 of 10 new words")
    openJLPTProgress(in: app)
    let ring = find("jlpt-progress.ring", in: app)
    waitUntil(ring, "value == %@", "147 Known, 134 Learning, 386 Not started")
    tap(reveal(find("jlpt-progress.add", in: app), in: app))
    reveal(ring, in: app)
    waitUntil(ring, "value == %@", "147 Known, 144 Learning, 376 Not started")
    waitUntil(find("jlpt-progress.pace", in: app), "label == %@", Self.pace(level: "N5", days: 38))
    goBack(in: app)
    goBack(in: app)
    waitUntil(reveal(today, in: app), "label BEGINSWITH %@", "Today, 14 of 10 new words")
  }

  func testTappingAnUpNextWordOpensItsPage() {
    let app = launch(progressSeed)
    openJLPTProgress(in: app)
    let word = reveal(firstElement(identifiedBy: "result.", in: app), in: app)
    tap(word, toShow: find("word-detail.screen", in: app))
  }

  func testALevelWithNothingNotStartedSaysSoInPlaceOfThePace() {
    let app = launch(["ZENBU_PROGRESS_SEED": Self.fixture("n4-known", in: fixtures)])
    openJLPTProgress(in: app)
    let ring = find("jlpt-progress.ring", in: app)
    waitUntil(ring, "label == %@", "0% of N5 known")
    tap(app.segmentedControls["jlpt-progress.level"].buttons["N4"])
    waitUntil(ring, "label == %@", "100% of N4 known")
    waitUntil(find("jlpt-progress.pace", in: app), "label == %@", "Every N4 word is in Learning or Known.")
    XCTAssertFalse(find("jlpt-progress.add", in: app).exists)
  }

  private func openJLPTProgress(in app: XCUIApplication) {
    open(.account, in: app)
    tap(reveal(find("account.progress.see", in: app), in: app), toShow: find("progress.today", in: app))
    tap(reveal(find("progress.jlpt.details", in: app), in: app), toShow: find("jlpt-progress.ring", in: app))
  }

  private static func pace(level: String, days: Int) -> String {
    let calendar = Calendar(identifier: .gregorian)
    let date = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: .now)) ?? .now
    let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: .now)
    let format = Date.FormatStyle().month(.abbreviated).day()
    let named = date.formatted(sameYear ? format : format.year())
    return "At 10 new words a day, every \(level) word would be in Learning by \(named) (\(days) days)."
  }

  static func fixture(_ name: String, in fixtures: URL) -> String {
    fixtures.deletingLastPathComponent().appending(path: "Progress/\(name).json").path
  }
}
