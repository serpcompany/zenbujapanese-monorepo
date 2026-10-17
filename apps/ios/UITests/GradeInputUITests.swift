import XCTest

final class GradeInputUITests: ZenbuUITestCase {
  func testAGradesKanjiJoinsTheQueryAndOpensItsDetail() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    let day = waitFor(find("grade.kanji.日", in: app))
    waitUntil(day, mentions: "day")
    tap(find("grade.section.grade-1", in: app))
    waitUntilGone(day)
    tap(find("grade.kanji.国", in: app))
    waitUntilGone(find("grade.grid", in: app))
    waitUntil(searchField(in: app), "value == %@", "国")
    tap(find("result.kanji-primary.国", in: app), toShow: find("kanji-detail.screen", in: app))
    waitUntil(find("kanji-detail.glyph", in: app), mentions: "国")
  }

  func testMarkingAKanjiKnownOutlinesItsTileAndCountsItInItsGrade() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    let header = find("grade.section.grade-1", in: app)
    waitUntil(header, "label == %@", "Grade 1, 80 kanji")
    tap(find("grade.kanji.日", in: app))
    mark("known", kanji: "日", in: app)
    openGrades(in: app)
    waitUntil(find("grade.kanji.日", in: app), "value == 'Known'")
    waitUntil(header, "label == %@", "Grade 1, 80 kanji, 1 known")
    closeInputPanel(in: app)
    mark("unknown", kanji: "日", in: app)
    openGrades(in: app)
    waitUntil(header, "label == %@", "Grade 1, 80 kanji")
    waitUntil(find("grade.kanji.日", in: app), "NOT (value == 'Known')")
  }

  func testClosedSectionsStayClosedAndTheFilterNarrowsEveryGrade() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    tap(find("grade.section.grade-1", in: app))
    waitUntilGone(find("grade.kanji.日", in: app))
    closeInputPanel(in: app)
    waitUntilGone(find("grade.grid", in: app))
    openGrades(in: app)
    waitUntil(find("grade.section.grade-1", in: app), "value == 'Collapsed'")
    XCTAssertFalse(find("grade.kanji.日", in: app).exists, "Grade 1 reopens closed")
    type("water", into: find("grade.filter", in: app))
    let water = waitFor(find("grade.kanji.水", in: app))
    waitUntil(find("grade.section.grade-1", in: app), mentions: "1 of 80")
    waitUntilGone(find("grade.section.grade-2", in: app))
    tap(find("grade.filter.clear", in: app))
    waitUntilGone(water)
    waitFor(find("grade.section.grade-2", in: app))
    switchInputPanel(to: "radicals", showing: "radical.grid", in: app)
    tap(find("radical.stroke.1", in: app))
    waitUntilGone(find("radical.one", in: app))
    closeInputPanel(in: app)
    waitUntilGone(find("radical.grid", in: app))
    tap(find("search.input.radicals", in: app))
    waitUntil(find("radical.stroke.1", in: app), "value == 'Collapsed'")
    XCTAssertFalse(find("radical.one", in: app).exists, "1 Stroke reopens closed")
  }

  func testTurningOffKanjiMeaningsLeavesTheKanjiAlone() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    waitUntil(find("grade.kanji.日", in: app), "label == %@", "日, day")
    closeInputPanel(in: app)
    open(.account, in: app)
    tap(reveal(find("account.reading-aids", in: app), in: app))
    let meanings = waitFor(find("reading-aids.show-kanji-meanings", in: app))
    flip(meanings)
    waitUntil(meanings, Self.switchedOff)
    open(.search, in: app)
    openGrades(in: app)
    waitUntil(find("grade.kanji.日", in: app), "label == %@", "日")
  }

  private func openGrades(in app: XCUIApplication) {
    tap(find("search.input.grade", in: app))
    waitFor(find("grade.grid", in: app))
  }

  private func mark(_ status: String, kanji: String, in app: XCUIApplication) {
    let menu = find("kanji-detail.more-menu", in: app)
    tap(find("result.kanji-primary.\(kanji)", in: app), toShow: menu)
    tap(menu)
    tap(find("kanji-detail.mark-\(status)", in: app))
    goBack(in: app)
    waitFor(find("search.results", in: app))
  }
}
