import XCTest

final class ExampleRowsUITests: ZenbuUITestCase {
  static let linkingDelay: TimeInterval = 5
  static let slowLinking = ["ZENBU_SLOW_LINKING": "\(Int(linkingDelay))"]

  func testAnExampleSentenceArrivesLinkedAndKeepsItsHeight() {
    let app = launch(Self.slowLinking)
    search("miru", in: app)
    tap(find("search.examples", in: app))
    assertArrivesLinked(
      find("example.row.0", in: app), words: ["example.token.0.", "example.words.0"], in: app)
  }

  func testAWordsExampleArrivesLinkedAndKeepsItsHeight() {
    let app = launch(Self.slowLinking)
    search("japan", in: app)
    tap(find("result.japan", in: app))
    assertArrivesLinked(
      reveal(find("word-detail.example.0", in: app), in: app),
      words: ["word-detail.example-token.0."], in: app)
  }

  func testAConjugatedFormsExampleArrivesLinkedAndItsWordOpens() {
    let app = launch(Self.slowLinking)
    openAFormOfTaberu(in: app)
    let explanation = waitFor(firstElement(identifiedBy: "conjugations.explanation.", in: app))
    assertArrivesLinked(
      reveal(firstElement(identifiedBy: "conjugations.example.", in: app), in: app),
      words: ["conjugations.example-token."], in: app)
    tap(
      app.buttons.matching(
        NSPredicate(
          format: "identifier BEGINSWITH 'conjugations.example-token.' AND label CONTAINS ', '")
      ).matching(NSPredicate(format: "NOT (label ENDSWITH 'choose dictionary entry')")).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitFor(explanation)
  }

  func testExampleSentencesGoOnPastTheFirstPageAsTheListScrolls() {
    let app = launch()
    search("miru", in: app)
    tap(find("search.examples", in: app))
    waitFor(find("example.row.0", in: app))
    reveal(find("example.row.27", in: app), in: app)
  }

  func testExampleSentencesKeepTheirPlaceWhileAWordIsOpen() {
    let app = launch()
    search("miru", in: app)
    tap(find("search.examples", in: app))
    let words = find("example.words.12", in: app)
    tap(reveal(words, in: app))
    tap(
      menuChoices(in: app)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'example.words.12.'")).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitUntilStill(find("example-list.screen", in: app))
    XCTAssertTrue(isReachable(words, in: app), "the list is where it was left")
  }

  private func assertArrivesLinked(
    _ row: XCUIElement, words: [String], in app: XCUIApplication, file: StaticString = #filePath,
    line: UInt = #line
  ) {
    waitFor(row, file: file, line: line)
    for prefix in words {
      XCTAssertTrue(
        firstElement(identifiedBy: prefix, in: app).exists,
        "the row appeared without \(prefix)", file: file, line: line)
    }
    let height = row.frame.height
    RunLoop.current.run(until: Date.now.addingTimeInterval(Self.linkingDelay + 1))
    XCTAssertEqual(
      row.frame.height, height, accuracy: 0.5, "the row changed height after it appeared",
      file: file, line: line)
  }
}
