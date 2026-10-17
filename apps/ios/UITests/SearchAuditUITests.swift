import XCTest

final class SearchAuditUITests: AccessibilityAuditCase {
  func testSearchsScreensPassTheAuditAtTheDefaultTextSize() {
    auditSearch(.standard)
  }

  func testSearchsScreensPassTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    auditSearch(.largest)
  }

  func testSearchsScreensPassTheAuditInDarkAppearance() {
    auditSearch(.dark)
  }

  private func auditSearch(_ pass: AuditPass) {
    if device == .pad { auditTheSidebar(pass) }
    auditTheSearchScreen(pass)
    auditAWord(pass)
    auditAKanji(pass)
    auditAVerbsConjugations(pass)
    auditExampleSentences(pass)
  }

  private func auditTheSearchScreen(_ pass: AuditPass) {
    let app = launch(pass)
    open(.search, in: app)
    audit("Search", in: app)
    search("japan", in: app)
    waitFor(find("result.japan", in: app))
    audit("Search's results", in: app)
    chooseFromSortedBy("Filter", "Known", in: app)
    waitFor(find("search.filter-empty", in: app))
    audit("Results filtered to none", in: app)
    tap(app.buttons["Clear Filter"].firstMatch)
    waitFor(find("result.japan", in: app))
    returnToRecentSearches(in: app)
    audit("Recent searches", in: app)
    type("日本語を勉強する\n", into: searchField(in: app))
    waitFor(labeled("Discovered Words", in: app))
    audit("Discovered Words", in: app)
    returnToRecentSearches(in: app)
    type("qxzqxzqxz\n", into: searchField(in: app))
    waitFor(find("search.no-results", in: app))
    audit("No matches", in: app)
    tap(find("search.input.handwriting", in: app))
    waitFor(find("handwriting.canvas", in: app))
    audit("Handwriting", in: app)
    switchInputPanel(to: "radicals", showing: "radical.grid", in: app)
    tap(find("radical.one", in: app))
    waitFor(firstElement(identifiedBy: "radical.candidate.", in: app))
    audit("Radicals", in: app)
  }

  private func auditTheSidebar(_ pass: AuditPass) {
    let app = launch(pass)
    tap(app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'sidebar'")).firstMatch)
    waitFor(
      app.collectionViews.descendants(matching: .any)
        .matching(NSPredicate(format: "label BEGINSWITH 'Account'")).firstMatch)
    audit("The iPad's sidebar", in: app)
  }

  private func auditAWord(_ pass: AuditPass) {
    let app = openJapan(pass)
    audit("Word Detail", in: app)
    let rank = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'JLPT level'")).firstMatch
    tap(reveal(rank, in: app))
    waitForSheet("frequency-detail.list", in: app)
    audit("A frequency rank's details", in: app)
    tap(app.buttons["Done"].firstMatch)
    tap(find("word-detail.more-menu", in: app))
    tap(find("word-detail.add-to-list", in: app))
    waitForSheet("word-list-picker.screen", in: app)
    audit("Add to List", in: app)
    tap(find("word-list-picker.done", in: app))
    let note = "the country, not the language"
    addNote(note, in: app)
    audit("A word's note", placing: labeled(note, in: app), in: app)
  }

  private func auditAKanji(_ pass: AuditPass) {
    let app = openJapan(pass)
    auditAtTheLargestSize("Word Detail, its kanji", showing: find("word-detail.kanji.日", in: app), in: app)
    tap(reveal(find("word-detail.kanji.日", in: app), in: app), toShow: find("kanji-detail.glyph", in: app))
    audit("Kanji Detail", in: app)
    tap(find("kanji-detail.stroke-order", in: app))
    waitForSheet("stroke-order.screen", in: app)
    audit("Stroke Order", in: app)
    tap(find("stroke-order.close", in: app))
    auditAtTheLargestSize(
      "Kanji Detail, its readings", showing: firstElement(identifiedBy: "kanji-detail.reading.", in: app),
      in: app)
    goBack(in: app)
    tap(reveal(find("word-detail.kanji.本", in: app), in: app), toShow: find("kanji-detail.glyph", in: app))
    let element = reveal(find("kanji-detail.element.木", in: app), in: app)
    tap(element, toShow: find("kanji-element.screen", in: app))
    audit("A kanji's element", in: app)
  }

  private func auditAVerbsConjugations(_ pass: AuditPass) {
    let app = launch(pass)
    openTaberu(in: app)
    let conjugations = reveal(find("word-detail.conjugations", in: app), in: app)
    tap(conjugations, toShow: find("conjugations.screen", in: app))
    let form = waitFor(firstElement(identifiedBy: "conjugations.row.", in: app))
    audit("Conjugations", in: app)
    tap(form)
    waitFor(firstElement(identifiedBy: "conjugations.explanation.", in: app))
    audit("A conjugated form", in: app)
  }

  private func auditExampleSentences(_ pass: AuditPass) {
    let app = launch(pass)
    search("miru", in: app)
    tap(find("search.examples", in: app), toShow: find("example-list.screen", in: app))
    waitFor(firstElement(identifiedBy: "example.words.", in: app))
    audit("Example Sentences", in: app)
  }

  private func openJapan(_ pass: AuditPass) -> XCUIApplication {
    let app = launch(pass)
    search("japan", in: app)
    tap(find("result.japan", in: app), toShow: find("word-detail.screen", in: app))
    return app
  }
}
