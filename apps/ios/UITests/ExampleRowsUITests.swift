import XCTest
import notify

final class ExampleRowsUITests: ZenbuUITestCase {
  private struct Rows {
    let prefix: String
    let list: XCUIElement
    let row: (Int) -> XCUIElement
    let words: (Int) -> [String]
  }

  private struct Measured {
    let number: Int
    let row: XCUIElement
    let height: CGFloat
  }

  private static let pastTheFirstScreen = 22
  private static let onTheNextPage = 25
  private static let checkedRows = [0, pastTheFirstScreen, onTheNextPage]
  private static let settling: TimeInterval = 1
  private static let holdLinking = "ZENBU_HOLD_LINKING"
  private static let failLinking = "ZENBU_FAIL_LINKING"
  private static let letGoNotice = "com.zenbujapanese.dictionary.uitests.let-linking-go"
  private static let letGoRegistration: Int32 = {
    var registration: Int32 = 0
    notify_register_check(letGoNotice, &registration)
    return registration
  }()

  func testExampleSentencesArriveLinkedAndKeepTheirPlaceWhileAWordIsOpen() {
    let app = launch([Self.holdLinking: "1"])
    let rows = openMiruExamples(in: app)
    assertKeepTheirHeight(assertArriveLinked(Self.checkedRows, of: rows, in: app))
    let words = find("example.words.\(Self.pastTheFirstScreen)", in: app)
    reveal(Self.pastTheFirstScreen, of: rows, in: app)
    tap(reveal(words, in: app, within: device == .mac ? rows.list : nil))
    let itsWord =
      device == .mac ? "isEnabled == true" : "identifier BEGINSWITH 'example.words.22.'"
    tap(menuChoices(in: app).matching(NSPredicate(format: itsWord)).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitUntilStill(find("example-list.screen", in: app))
    letLinkingGo(heldBefore: .now)
    RunLoop.current.run(until: Date.now.addingTimeInterval(Self.settling))
    XCTAssertTrue(isReachable(words, in: app), "the list is where it was left")
    XCTAssertFalse(isReachable(rows.row(0), in: app), "the list went back to its top")
  }

  func testAWordsExamplesArriveLinked() {
    let app = launch([Self.holdLinking: "1"])
    openTaberu(in: app)
    assertKeepTheirHeight(assertArriveLinked(Self.checkedRows, of: wordExamples(in: app), in: app))
  }

  func testAConjugatedFormsExamplesArriveLinkedAndAWordOpens() {
    let app = launch([Self.holdLinking: "1"])
    let rows = formExamples(of: openAFormOfTaberu(in: app), in: app)
    assertKeepTheirHeight(assertArriveLinked(Self.checkedRows, of: rows, in: app))
    guard let word = reachableWord(of: rows, near: Self.onTheNextPage, in: app) else {
      return XCTFail("no linked word of the form's examples is in the window to be clicked")
    }
    let page = find("word-detail.screen", in: app)
    if device == .mac {
      for _ in 0..<3 where !page.exists {
        word.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).tap()
        _ = page.waitForExistence(timeout: Self.patience / 3)
      }
    } else {
      tap(word)
    }
    waitFor(page)
    goBack(in: app)
    waitFor(rows.list)
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
    let rows = wordExamples(in: app)
    let page = device == .mac ? rows.list : app.windows.firstMatch
    let unread = labeled("No source-matched examples", in: app)
    scroll(page, back: false, until: unread)
    reveal(unread, in: app)
    let conjugations = find("word-detail.conjugations", in: app)
    scroll(page, back: true, until: conjugations)
    tap(reveal(conjugations, in: app), toShow: find("conjugations.screen", in: app))
    goBack(in: app)
    reveal(0, of: rows, in: app)
  }

  private func scroll(_ page: XCUIElement, back: Bool, until element: XCUIElement) {
    var swipes = 0
    while !element.exists, swipes < 12 {
      scroll(page, back: back)
      swipes += 1
    }
  }

  private func letLinkingGo(heldBefore cut: Date) {
    notify_set_state(Self.letGoRegistration, UInt64(cut.timeIntervalSince1970 * 1_000_000))
    notify_post(Self.letGoNotice)
  }

  private func openMiruExamples(in app: XCUIApplication) -> Rows {
    search("miru", in: app)
    tap(find("search.examples", in: app))
    let onMac = device == .mac
    return rows("example.row.", listedIn: "example-list.screen", in: app) {
      onMac ? ["example.words.\($0)"] : ["example.token.\($0).", "example.words.\($0)"]
    }
  }

  private func wordExamples(in app: XCUIApplication) -> Rows {
    rows("word-detail.example.", listedIn: "word-detail.screen", in: app) {
      ["word-detail.example-token.\($0)."]
    }
  }

  private func formExamples(of kind: String, in app: XCUIApplication) -> Rows {
    rows("conjugations.example.\(kind).", listedIn: "conjugations.form.\(kind)", in: app) {
      ["conjugations.example-token.\(kind).\($0)."]
    }
  }

  private func rows(
    _ prefix: String, listedIn list: String, in app: XCUIApplication,
    words: @escaping (Int) -> [String]
  ) -> Rows {
    Rows(
      prefix: prefix, list: find(list, in: app),
      row: { self.find(prefix + String($0), in: app) }, words: words)
  }

  private func scroll(toward number: Int, of rows: Rows, in app: XCUIApplication) {
    let shown = firstElement(identifiedBy: rows.prefix, in: app)
    let first = shown.exists ? Int(shown.identifier.dropFirst(rows.prefix.count)) : nil
    guard first != number, rows.list.exists else { return }
    let past = (first ?? -1) - number
    if past > 0, past < 6 {
      scroll(device == .mac ? rows.list : app.windows.firstMatch, back: true)
    } else {
      flick(rows, back: past > 0, in: app)
    }
  }

  private func reachableWord(
    of rows: Rows, near number: Int, in app: XCUIApplication
  ) -> XCUIElement? {
    let linked = NSPredicate(
      format: "label CONTAINS ', ' AND NOT (label ENDSWITH 'choose dictionary entry')")
    let area = device == .mac ? rows.list : nil
    let isOpenable = { (word: XCUIElement) in self.isReachable(word, in: app, within: area) }
    for nearby in [0, -1, 1, -2, 2, -3, 3].map({ number + $0 }) {
      let words = app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH %@", rows.words(nearby)[0])
      ).matching(linked)
      if let word = words.allElementsBoundByIndex.first(where: isOpenable) { return word }
    }
    let words = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", String(rows.words(0)[0].dropLast(2)))
    ).matching(linked)
    return words.allElementsBoundByIndex.first(where: isOpenable)
  }

  private func flick(_ rows: Rows, back: Bool, in app: XCUIApplication) {
    if device == .mac {
      rows.list.scroll(byDeltaX: 0, deltaY: back ? 450 : -450)
    } else if back {
      app.windows.firstMatch.swipeDown()
    } else {
      app.windows.firstMatch.swipeUp()
    }
  }

  private func awaited(_ number: Int, of rows: Rows, in app: XCUIApplication) -> XCUIElement {
    let row = rows.row(number)
    let deadline = Date.now.addingTimeInterval(Self.patience)
    var looking = Date.now
    var looked: Date?
    while !row.exists, Date.now < deadline {
      if let looked { letLinkingGo(heldBefore: looked) }
      scroll(toward: number, of: rows, in: app)
      looked = looking
      looking = .now
    }
    return row
  }

  @discardableResult
  private func reveal(_ number: Int, of rows: Rows, in app: XCUIApplication) -> XCUIElement {
    let row = awaited(number, of: rows, in: app)
    guard device == .mac else { return reveal(row, in: app) }
    let laidOutInPlace = Date.now.addingTimeInterval(Self.layoutPatience)
    while row.exists, row.frame.isEmpty, Date.now < laidOutInPlace {
      RunLoop.current.run(until: Date.now.addingTimeInterval(0.2))
    }
    let laidOut = Date.now.addingTimeInterval(Self.patience)
    while row.exists, row.frame.isEmpty, Date.now < laidOut { scroll(rows.list, back: false) }
    return reveal(row, in: app, within: rows.list)
  }

  private func assertArriveLinked(
    _ numbers: [Int], of rows: Rows, in app: XCUIApplication,
    file: StaticString = #filePath, line: UInt = #line
  ) -> [Measured] {
    continueAfterFailure = true
    defer { continueAfterFailure = false }
    var measured: [Measured] = []
    for number in numbers {
      let row = awaited(number, of: rows, in: app)
      guard row.exists else {
        XCTFail("row \(number) never appeared", file: file, line: line)
        continue
      }
      for prefix in rows.words(number) {
        XCTAssertTrue(
          firstElement(identifiedBy: prefix, in: app).exists,
          "row \(number) appeared without \(prefix)", file: file, line: line)
      }
      let shown = row.frame.isEmpty ? reveal(number, of: rows, in: app) : row
      measured.append(Measured(number: number, row: row, height: shown.frame.height))
    }
    return measured
  }

  private func assertKeepTheirHeight(
    _ measured: [Measured], file: StaticString = #filePath, line: UInt = #line
  ) {
    letLinkingGo(heldBefore: .now)
    RunLoop.current.run(until: Date.now.addingTimeInterval(Self.settling))
    for shown in measured where shown.row.exists && !shown.row.frame.isEmpty {
      XCTAssertEqual(
        shown.row.frame.height, shown.height, accuracy: 0.5,
        "row \(shown.number) changed height after it appeared", file: file, line: line)
    }
  }
}
