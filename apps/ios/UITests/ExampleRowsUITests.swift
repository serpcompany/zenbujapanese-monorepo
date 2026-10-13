import XCTest

final class ExampleRowsUITests: ZenbuUITestCase {
  func testAnExampleSentenceArrivesLinkedAndKeepsItsHeight() {
    let app = launch(Self.slowingLinking(by: 5))
    search("miru", in: app)
    tap(find("search.examples", in: app))
    assertArrivesLinked(
      find("example.row.0", in: app), words: ["example.token.0.", "example.words.0"],
      watchedFor: 6, in: app)
  }

  func testAWordsExampleArrivesLinkedAndKeepsItsHeight() {
    let app = launch(Self.slowingLinking(by: 10))
    search("japan", in: app)
    tap(find("result.japan", in: app))
    assertArrivesLinked(
      reveal(find("word-detail.example.0", in: app), in: app),
      words: ["word-detail.example-token.0."], watchedFor: 11, in: app)
  }

  func testAConjugatedFormsExampleArrivesLinkedAndItsWordOpens() {
    let app = launch(Self.slowingLinking(by: 5))
    openAFormOfTaberu(in: app)
    let explanation = waitFor(firstElement(identifiedBy: "conjugations.explanation.", in: app))
    assertArrivesLinked(
      reveal(firstElement(identifiedBy: "conjugations.example.", in: app), in: app),
      words: ["conjugations.example-token."], watchedFor: 6, in: app)
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

  func testAWordsExamplesGoOnPastTheFirstPageAsItsPageScrolls() {
    let app = launch()
    openTaberu(in: app)
    reveal(find("word-detail.example.12", in: app), in: app)
    reveal(find("word-detail.example.25", in: app), in: app)
  }

  func testAFormsExamplesGoOnPastTheFirstPageAsItsPageScrolls() {
    let app = launch()
    openAFormOfTaberu(in: app)
    for row in [12, 25] {
      reveal(
        app.descendants(matching: .any).matching(
          NSPredicate(
            format: "identifier BEGINSWITH 'conjugations.example.' AND identifier ENDSWITH %@",
            ".\(row)")
        ).firstMatch, in: app)
    }
  }

  func testExampleSentencesKeepTheirPlaceWhileAWordIsOpen() {
    let app = launch()
    search("miru", in: app)
    tap(find("search.examples", in: app))
    let words = find("example.words.22", in: app)
    tap(reveal(words, in: app))
    tap(
      menuChoices(in: app)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'example.words.22.'")).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitUntilStill(find("example-list.screen", in: app))
    XCTAssertTrue(isReachable(words, in: app), "the list is where it was left")
    XCTAssertFalse(
      isReachable(find("example.row.0", in: app), in: app), "the list went back to its top")
  }

  private static func slowingLinking(by seconds: Int) -> [String: String] {
    ["ZENBU_SLOW_LINKING": "\(seconds)"]
  }

  private func assertArrivesLinked(
    _ row: XCUIElement, words: [String], watchedFor seconds: TimeInterval,
    in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line
  ) {
    waitFor(row, file: file, line: line)
    for prefix in words {
      XCTAssertTrue(
        firstElement(identifiedBy: prefix, in: app).exists,
        "the row appeared without \(prefix)", file: file, line: line)
    }
    let height = row.frame.height
    RunLoop.current.run(until: Date.now.addingTimeInterval(seconds))
    XCTAssertEqual(
      row.frame.height, height, accuracy: 0.5, "the row changed height after it appeared",
      file: file, line: line)
  }
}
