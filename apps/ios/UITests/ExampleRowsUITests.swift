import XCTest

final class ExampleRowsUITests: ZenbuUITestCase {
  private struct Rows {
    let row: (Int) -> XCUIElement
    let words: (Int) -> [String]
  }

  private static let laterRows = [22, 25]
  private static let linkingDelay: TimeInterval = 10

  func testAnExampleSentenceArrivesLinkedAndKeepsItsHeight() {
    let app = launchWithSlowLinking()
    assertArrivesLinked([0], of: openMiruExamples(in: app), in: app)
  }

  func testLaterExampleSentencesArriveLinked() {
    let app = launchWithSlowLinking()
    assertArrivesLinked(Self.laterRows, of: openMiruExamples(in: app), in: app)
  }

  func testAWordsExampleArrivesLinkedAndKeepsItsHeight() {
    let app = launchWithSlowLinking()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    assertArrivesLinked([0], of: wordExamples(in: app), in: app)
  }

  func testAWordsLaterExamplesArriveLinked() {
    let app = launchWithSlowLinking()
    openTaberu(in: app)
    assertArrivesLinked(Self.laterRows, of: wordExamples(in: app), in: app)
  }

  func testAConjugatedFormsExampleArrivesLinkedAndItsWordOpens() {
    let app = launchWithSlowLinking()
    let rows = formExamples(of: openAFormOfTaberu(in: app), in: app)
    let explanation = waitFor(firstElement(identifiedBy: "conjugations.explanation.", in: app))
    assertArrivesLinked([0], of: rows, in: app)
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
    let app = launchWithSlowLinking()
    assertArrivesLinked(
      Self.laterRows, of: formExamples(of: openAFormOfTaberu(in: app), in: app), in: app)
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

  private func launchWithSlowLinking() -> XCUIApplication {
    launch(["ZENBU_SLOW_LINKING": "\(Self.linkingDelay)"])
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

  private func assertArrivesLinked(
    _ numbers: [Int], of rows: Rows, in app: XCUIApplication,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    for number in numbers {
      let row = rows.row(number)
      let deadline = Date.now.addingTimeInterval(Self.patience)
      while !row.exists, Date.now < deadline { scroll(app.windows.firstMatch, back: false) }
      XCTAssertTrue(row.exists, "row \(number) never appeared", file: file, line: line)
      for prefix in rows.words(number) {
        XCTAssertTrue(
          firstElement(identifiedBy: prefix, in: app).exists,
          "row \(number) appeared without \(prefix)", file: file, line: line)
      }
      let height = reveal(row, in: app).frame.height
      RunLoop.current.run(until: Date.now.addingTimeInterval(Self.linkingDelay + 1))
      XCTAssertEqual(
        row.frame.height, height, accuracy: 0.5, "row \(number) changed height after it appeared",
        file: file, line: line)
    }
  }
}
