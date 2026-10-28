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
    mark("Known", kanji: "日", in: app)
    openGrades(in: app)
    waitUntil(header, "label == %@", "Grade 1, 80 kanji, 1 known")
    assertTile("日", "value == 'Known'", in: app)
    closeInputPanel(in: app)
    mark("Unknown", kanji: "日", in: app)
    openGrades(in: app)
    waitUntil(header, "label == %@", "Grade 1, 80 kanji")
    assertTile("日", "NOT (value == 'Known')", in: app)
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
    assertCollapsed("grade.section.grade-1", in: app)
    XCTAssertFalse(find("grade.kanji.日", in: app).exists, "Grade 1 reopens closed")
    type("water", into: find("grade.filter", in: app))
    let water = waitFor(find("grade.kanji.水", in: app))
    waitUntil(find("grade.section.grade-1", in: app), mentions: "1 of 80")
    waitUntilGone(find("grade.section.grade-2", in: app))
    tap(find("grade.filter.clear", in: app))
    waitUntilGone(water)
    assertOnScreen(find("grade.section.grade-2", in: app), in: app)
    switchInputPanel(to: "radicals", showing: "radical.grid", in: app)
    tap(find("radical.stroke.1", in: app))
    waitUntilGone(find("radical.one", in: app))
    closeInputPanel(in: app)
    waitUntilGone(find("radical.grid", in: app))
    tap(find("search.input.radicals", in: app))
    assertCollapsed("radical.stroke.1", in: app)
    XCTAssertFalse(find("radical.one", in: app).exists, "1 Stroke reopens closed")
  }

  func testBothFormsOfACompatibilityKanjiAreTiles() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    type("いのしし", into: find("grade.filter", in: app))
    waitUntil(find("grade.section.jinmeiyo", in: app), mentions: "2 of 863")
    let tiles = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'grade.kanji.'"))
    waitUntil("both forms of 猪 to show as tiles") { tiles.count == 2 }
    let pig = tiles.matching(NSPredicate(format: "label ENDSWITH ', pig'")).firstMatch
    let boar = tiles.matching(NSPredicate(format: "label ENDSWITH ', boar'")).firstMatch
    assertOnScreen(pig, in: app)
    assertOnScreen(boar, in: app)
    tap(pig)
    waitUntilGone(find("grade.grid", in: app))
    waitUntil("the query to be 猪's ordinary form, as every query is") {
      (searchField(in: app).value as? String)?.unicodeScalars.map(\.value) == [0x732A]
    }
  }

  func testTurningOffKanjiMeaningsLeavesTheKanjiAlone() {
    let app = launch()
    open(.search, in: app)
    openGrades(in: app)
    waitUntil(find("grade.kanji.日", in: app), "label == %@", "日, day")
    closeInputPanel(in: app)
    open(.account, in: app)
    let meanings = openReadingAids(showing: "show-kanji-meanings", in: app)
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

  private func assertTile(_ kanji: String, _ state: String, in app: XCUIApplication) {
    let tile = waitFor(find("grade.kanji.\(kanji)", in: app))
    if device != .mac { waitUntil(tile, state) }
  }

  private func assertCollapsed(_ header: String, in app: XCUIApplication) {
    let header = waitFor(find(header, in: app))
    if device != .mac { waitUntil(header, "value == 'Collapsed'") }
  }

  private func mark(_ status: String, kanji: String, in app: XCUIApplication) {
    let menu = find("kanji-detail.more-menu", in: app)
    tap(find("result.kanji-primary.\(kanji)", in: app), toShow: menu)
    chooseStatus(status, from: menu, in: app)
    goBack(in: app)
    waitFor(find("search.results", in: app))
  }
}
