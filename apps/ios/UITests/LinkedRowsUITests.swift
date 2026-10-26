import XCTest

final class LinkedRowsUITests: ZenbuUITestCase {
  private struct Placed {
    let element: XCUIElement
    let anchor: XCUIElement
    let frame: CGRect

    init(_ element: XCUIElement, under anchor: XCUIElement) {
      self.element = element
      self.anchor = anchor
      frame = element.frame.offsetBy(dx: 0, dy: -anchor.frame.minY)
    }
  }

  private static let manyLines = (1...30).map {
    ("駅の近くに本屋が\($0)軒あります", "There are \($0) bookstores near the station.")
  }

  func testACaptionArrivesLinkedAndIsStillLinkedWhenItScrollsBack() {
    let app = launch(
      PlayerWatchUITests.standIn(lines: Self.manyLines).merging(Self.holdLinking) { $1 })
    open(.player, in: app)
    type(PlayerWatchUITests.link + "\n", into: waitFor(app.searchFields.firstMatch))
    let first = find("watch.cue.0", in: app)
    let words = linkedWord("watch.cue.0.", in: app)
    assertArrivesLinked(first, plainly: labeled(Self.manyLines[0].0, in: app), words: words)
    let height = first.frame.height
    let list = find("watch.captions", in: app)
    let last = find("watch.cue.\(Self.manyLines.count - 1)", in: app)
    waitUntil("the last caption to be listed as held answers are let go") {
      if last.exists, isReachable(last, in: app) { return true }
      letLinkingGo(heldBefore: .now)
      scroll(list, back: false)
      return false
    }
    _ = reveal(first, in: app, scrolling: list)
    XCTAssertTrue(words.exists, "the first caption came back into view without its words linked")
    XCTAssertEqual(first.frame.height, height, accuracy: 0.5, "the first caption came back at another height")
  }

  func testAnImageLineArrivesLinkedAtItsFinalHeight() throws {
    let app = try openFixtureImage(Self.holdLinking)
    let line = find("image-text.line.0", in: app)
    assertArrivesLinked(line, words: linkedWord("image-text.line.0.", in: app))
    assertStaysPut(Placed(line, under: find("image-text.lines", in: app)))
  }

  func testATypedTranslationArrivesLinkedAtItsFinalHeight() {
    let app = launch(TranslateUITests.script.merging(Self.holdLinking) { $1 })
    open(.translate, in: app)
    tap(find("translate.start.text", in: app))
    type("Where can I buy a Suica card?", into: waitFor(find("translate.typed.input", in: app)))
    let direction = find("translate.typed.direction", in: app)
    let word = linkedWord("translate.typed.result.", in: app)
    assertArrivesLinked(
      direction, plainly: labeled("Suicaカードはどこで買えますか？", in: app), words: word)
    assertStaysPut(Placed(word, under: direction))
  }

  func testASpokenSentenceArrivesLinkedAtItsFinalHeight() {
    let app = launch(TranslateUITests.script.merging(Self.holdLinking) { $1 })
    open(.translate, in: app)
    tap(find("translate.start.conversation", in: app))
    let plainly = labeled("この先の階段を下りて、右に曲がってください。", in: app)
    let word = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier CONTAINS '.source.' AND identifier ENDSWITH '.階段'")
    ).firstMatch
    assertArrivesLinked(word, plainly: plainly, words: word)
    let source = word.identifier.split(separator: ".").prefix(4).joined(separator: ".")
    assertStaysPut(Placed(word, under: firstElement(identifiedBy: source + ".0.", in: app)))
  }

  private func linkedWord(_ prefix: String, in app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS ', '", prefix)
    ).firstMatch
  }

  private func assertArrivesLinked(
    _ row: XCUIElement, plainly: XCUIElement? = nil, words: XCUIElement,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    var looked: Date?
    var looking = Date.now
    waitUntil("\(row) to appear as held answers are let go", file: file, line: line) {
      if row.exists || plainly?.exists == true { return true }
      if let looked { letLinkingGo(heldBefore: looked) }
      looked = looking
      looking = .now
      return false
    }
    XCTAssertTrue(words.exists, "\(row) appeared without its words linked", file: file, line: line)
  }

  private func assertStaysPut(
    _ placed: Placed, file: StaticString = #filePath, line: UInt = #line
  ) {
    letLinkingGoAndSettle()
    let now = placed.element.frame.offsetBy(dx: 0, dy: -placed.anchor.frame.minY)
    XCTAssertEqual(
      now.height, placed.frame.height, accuracy: 0.5,
      "\(placed.element) changed height after it appeared", file: file, line: line)
    XCTAssertEqual(
      now.minY, placed.frame.minY, accuracy: 0.5,
      "\(placed.element) moved after it appeared", file: file, line: line)
  }
}
