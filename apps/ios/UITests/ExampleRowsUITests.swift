import XCTest

final class ExampleRowsUITests: ZenbuUITestCase {
  private struct Rows {
    let row: (Int) -> XCUIElement
    let words: (Int) -> [String]
  }

  private static let laterRows = [22, 25]
  private var linkingDelay: TimeInterval = 0

  func testAnExampleSentenceArrivesLinkedAndKeepsItsHeight() {
    let app = launch(slowingLinkingBy: 5)
    let rows = openMiruExamples(in: app)
    assertArrivesLinked(rows.row(0), words: rows.words(0), in: app)
  }

  func testLaterExampleSentencesArriveLinked() {
    let app = launch(slowingLinkingBy: 10)
    assertLaterRowsArriveLinked(openMiruExamples(in: app), in: app)
  }

  func testAWordsExampleArrivesLinkedAndKeepsItsHeight() {
    let app = launch(slowingLinkingBy: 10)
    search("japan", in: app)
    tap(find("result.japan", in: app))
    let rows = wordExamples(in: app)
    assertArrivesLinked(reveal(rows.row(0), in: app), words: rows.words(0), in: app)
  }

  func testAWordsLaterExamplesArriveLinked() {
    let app = launch(slowingLinkingBy: 10)
    openTaberu(in: app)
    assertLaterRowsArriveLinked(wordExamples(in: app), in: app)
  }

  func testAConjugatedFormsExampleArrivesLinkedAndItsWordOpens() {
    let app = launch(slowingLinkingBy: 5)
    let rows = formExamples(of: openAFormOfTaberu(in: app), in: app)
    let explanation = waitFor(firstElement(identifiedBy: "conjugations.explanation.", in: app))
    assertArrivesLinked(reveal(rows.row(0), in: app), words: rows.words(0), in: app)
    tap(
      app.buttons.matching(
        NSPredicate(
          format: "identifier BEGINSWITH 'conjugations.example-token.' AND label CONTAINS ', '")
      ).matching(NSPredicate(format: "NOT (label ENDSWITH 'choose dictionary entry')")).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitFor(explanation)
  }

  func testAConjugatedFormsLaterExamplesArriveLinked() {
    let app = launch(slowingLinkingBy: 10)
    assertLaterRowsArriveLinked(formExamples(of: openAFormOfTaberu(in: app), in: app), in: app)
  }

  func testExampleSentencesGoOnPastTheFirstPageAsTheListScrolls() {
    let app = launch()
    let rows = openMiruExamples(in: app)
    waitFor(rows.row(0))
    reveal(rows.row(27), in: app)
  }

  func testAWordsExamplesGoOnPastTheFirstPageAsItsPageScrolls() {
    let app = launch()
    openTaberu(in: app)
    let rows = wordExamples(in: app)
    reveal(rows.row(12), in: app)
    reveal(rows.row(25), in: app)
  }

  func testAFormsExamplesGoOnPastTheFirstPageAsItsPageScrolls() {
    let app = launch()
    let rows = formExamples(of: openAFormOfTaberu(in: app), in: app)
    reveal(rows.row(12), in: app)
    reveal(rows.row(25), in: app)
  }

  func testExampleSentencesKeepTheirPlaceWhileAWordIsOpen() {
    let app = launch()
    let rows = openMiruExamples(in: app)
    let words = find("example.words.22", in: app)
    tap(reveal(words, in: app))
    tap(
      menuChoices(in: app)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'example.words.22.'")).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitUntilStill(find("example-list.screen", in: app))
    XCTAssertTrue(isReachable(words, in: app), "the list is where it was left")
    XCTAssertFalse(isReachable(rows.row(0), in: app), "the list went back to its top")
  }

  func testExampleSentencesAreReadAgainOnComingBackAfterTheirFirstReadFailed() {
    let app = launch([Self.failLinking: "1"])
    let rows = openMiruExamples(in: app)
    waitFor(find("example-list.screen", in: app))
    XCTAssertFalse(rows.row(0).exists, "the read that was made to fail listed examples")
    open(.translate, in: app)
    tap(tabItem(.search, in: app))
    waitFor(rows.row(0))
  }

  func testAWordsExamplesAreReadAgainOnComingBackAfterTheirFirstReadFailed() {
    let app = launch([Self.failLinking: "1"])
    openTaberu(in: app)
    reveal(labeled("No source-matched examples", in: app), in: app)
    tap(
      reveal(find("word-detail.conjugations", in: app), in: app),
      toShow: find("conjugations.screen", in: app))
    goBack(in: app)
    reveal(wordExamples(in: app).row(0), in: app)
  }

  private static let failLinking = "ZENBU_FAIL_LINKING"

  private func launch(slowingLinkingBy seconds: Int) -> XCUIApplication {
    linkingDelay = TimeInterval(seconds)
    return launch(["ZENBU_SLOW_LINKING": "\(seconds)"])
  }

  private func openMiruExamples(in app: XCUIApplication) -> Rows {
    search("miru", in: app)
    tap(find("search.examples", in: app))
    return Rows(
      row: { self.find("example.row.\($0)", in: app) },
      words: { ["example.token.\($0).", "example.words.\($0)"] })
  }

  private func wordExamples(in app: XCUIApplication) -> Rows {
    Rows(
      row: { self.find("word-detail.example.\($0)", in: app) },
      words: { ["word-detail.example-token.\($0)."] })
  }

  private func formExamples(of kind: String, in app: XCUIApplication) -> Rows {
    Rows(
      row: { self.find("conjugations.example.\(kind).\($0)", in: app) },
      words: { ["conjugations.example-token.\(kind).\($0)."] })
  }

  private func waitOutLinking() {
    RunLoop.current.run(until: Date.now.addingTimeInterval(linkingDelay + 1))
  }

  private func assertLaterRowsArriveLinked(
    _ rows: Rows, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line
  ) {
    reveal(rows.row(0), in: app)
    waitOutLinking()
    for number in Self.laterRows {
      assertArrivesLinked(
        reveal(rows.row(number), in: app), words: rows.words(number), in: app, file: file,
        line: line)
    }
  }

  private func assertArrivesLinked(
    _ row: XCUIElement, words: [String], in app: XCUIApplication,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    waitFor(row, file: file, line: line)
    for prefix in words {
      XCTAssertTrue(
        firstElement(identifiedBy: prefix, in: app).exists,
        "the row appeared without \(prefix)", file: file, line: line)
    }
    let height = row.frame.height
    waitOutLinking()
    XCTAssertEqual(
      row.frame.height, height, accuracy: 0.5, "the row changed height after it appeared",
      file: file, line: line)
  }
}
