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
    let height: CGFloat
  }

  private static let pastTheFirstScreen = 22
  private static let onTheNextPage = 25
  private static let checkedRows = [0, pastTheFirstScreen, onTheNextPage]
  private static let settling: TimeInterval = 1
  private static let holdLinking = "ZENBU_HOLD_LINKING"
  private static let failLinking = "ZENBU_FAIL_LINKING"
  private static let letGoNotice = "com.zenbujapanese.dictionary.uitests.let-linking-go"
  private var lastLaidOut: Int?
  private static let letGoRegistration: Int32 = {
    var registration: Int32 = 0
    notify_register_check(letGoNotice, &registration)
    return registration
  }()

  func testExampleSentencesArriveLinkedAndKeepTheirPlaceWhileAWordIsOpen() {
    let app = launch([Self.holdLinking: "1"])
    let rows = openMiruExamples(in: app)
    assertKeepTheirHeight(
      assertArriveLinked(Self.checkedRows, of: rows, in: app), of: rows, in: app)
    let words = find("example.words.\(Self.pastTheFirstScreen)", in: app)
    let opened = reveal(Self.pastTheFirstScreen, of: rows, in: app)
    let shown = reveal(words, in: app, within: device == .mac ? rows.list : nil)
    bringIntoView(shown, of: rows, in: app)
    let top = opened.frame.minY - rows.list.frame.minY
    tap(shown)
    let itsWord =
      device == .mac ? "isEnabled == true" : "identifier BEGINSWITH 'example.words.22.'"
    tap(menuChoices(in: app).matching(NSPredicate(format: itsWord)).firstMatch)
    waitFor(find("word-detail.screen", in: app))
    turnRomajiOn(in: app)
    tap(tabItem(.search, in: app))
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitUntilStill(find("example-list.screen", in: app))
    letLinkingGo(heldBefore: .now)
    RunLoop.current.run(until: Date.now.addingTimeInterval(Self.settling))
    let list = rows.list.frame
    let back = laidOutFrame(of: opened, within: device == .mac ? rows.list : nil, in: app)
    XCTAssertEqual(
      back.map { $0.minY - list.minY } ?? .infinity, top, accuracy: list.height / 3,
      "the sentence the word was opened from is on screen near where it was, after Romaji")
    XCTAssertTrue(isReachable(words, in: app), "the list is where it was left")
    XCTAssertFalse(isReachable(rows.row(0), in: app), "the list went back to its top")
  }

  func testAWordsExamplesArriveLinked() {
    let app = launch([Self.holdLinking: "1"])
    openTaberu(in: app)
    let rows = wordExamples(in: app)
    assertKeepTheirHeight(
      assertArriveLinked(Self.checkedRows, of: rows, in: app), of: rows, in: app)
  }

  func testAConjugatedFormsExamplesArriveLinkedAndAWordOpens() {
    let app = launch([Self.holdLinking: "1"])
    let rows = formExamples(of: openAFormOfTaberu(in: app), in: app)
    assertKeepTheirHeight(
      assertArriveLinked(Self.checkedRows, of: rows, in: app), of: rows, in: app)
    guard let word = reachableWord(of: rows, near: 0, in: app) else {
      return XCTFail("no linked word of the form's examples is in the window to be clicked")
    }
    let page = find("word-detail.screen", in: app)
    if device == .mac {
      for _ in 0..<3 {
        word.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).tap()
        if appears(page, within: Self.patience / 3) { break }
      }
    } else {
      tap(word)
    }
    waitFor(page)
    goBack(in: app)
    waitFor(rows.list)
  }

  func testExampleSentencesAreReadAgainOnComingBackAfterTheirFirstReadFailed() {
    let app = launch([Self.holdLinking: "1", Self.failLinking: "2"])
    let rows = openMiruExamples(in: app)
    let unread = find("examples.failed", in: app)
    letLinkingGo(until: unread, in: app)
    XCTAssertFalse(rows.row(0).exists, "the read that was made to fail listed examples")
    open(.translate, in: app)
    tap(tabItem(.search, in: app))
    waitFor(find("examples.loading", in: app))
    letLinkingGo(until: unread, in: app)
    tap(find("examples.retry", in: app))
    waitFor(find("examples.loading", in: app))
    letLinkingGo(until: rows.row(0), in: app)
  }

  func testFailedExamplesOfAWordAndAFormAreReadAgainOnComingBackAndOnRetry() {
    let app = launch([Self.holdLinking: "1", Self.failLinking: "3"])
    openTaberu(in: app)
    let rows = wordExamples(in: app)
    let page = device == .mac ? rows.list : app.windows.firstMatch
    let unread = find("examples.failed", in: app)
    let none = find("examples.empty", in: app)
    for _ in 0..<12 where !unread.exists {
      letLinkingGo(heldBefore: .now)
      scroll(page, back: false)
    }
    reveal(unread, in: app)
    XCTAssertFalse(none.exists, "the page said the word has no examples when its read failed")
    let conjugations = find("word-detail.conjugations", in: app)
    scroll(page, back: true, until: conjugations)
    tap(reveal(conjugations, in: app), toShow: find("conjugations.screen", in: app))
    goBack(in: app)
    let loading = find("examples.loading", in: app)
    scroll(page, back: false, until: loading)
    waitFor(loading)
    letLinkingGo(until: unread, in: app)
    XCTAssertFalse(none.exists, "the page said the word has no examples when its read failed")
    scroll(page, back: true, until: conjugations)
    tap(reveal(conjugations, in: app), toShow: find("conjugations.screen", in: app))
    let prefix = "conjugations.row."
    let form = waitFor(firstElement(identifiedBy: prefix, in: app))
    let formRows = formExamples(of: String(form.identifier.dropFirst(prefix.count)), in: app)
    tap(form)
    let onTheForm: (String) -> XCUIElement = {
      formRows.list.descendants(matching: .any).matching(identifier: $0).firstMatch
    }
    letLinkingGo(until: onTheForm("examples.failed"), in: app)
    XCTAssertFalse(
      onTheForm("examples.empty").exists, "the form said no sentence uses it when its read failed")
    tap(reveal(onTheForm("examples.retry"), in: app))
    letLinkingGo(until: formRows.row(0), in: app)
    goBack(in: app)
    goBack(in: app)
    for _ in 0..<12 where !rows.row(0).exists {
      letLinkingGo(heldBefore: .now)
      scroll(page, back: false)
    }
    reveal(0, of: rows, in: app)
  }

  private func scroll(_ page: XCUIElement, back: Bool, until element: XCUIElement) {
    var swipes = 0
    while !element.exists, swipes < 12 {
      scroll(page, back: back)
      swipes += 1
    }
  }

  private func letLinkingGo(until element: XCUIElement, in app: XCUIApplication) {
    waitUntil("\(element) to exist as held answers are let go") {
      if element.exists { return true }
      letLinkingGo(heldBefore: .now)
      return false
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
    let isOpenable = { (word: XCUIElement) in self.isInView(word, of: rows, in: app) }
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

  private func isInView(_ element: XCUIElement, of rows: Rows, in app: XCUIApplication) -> Bool {
    guard device != .mac else { return isReachable(element, in: app, within: rows.list) }
    return isClearOfTheBars(element, in: app)
  }

  private func bringIntoView(_ element: XCUIElement, of rows: Rows, in app: XCUIApplication) {
    let page = device == .mac ? rows.list : app.windows.firstMatch
    for _ in 0..<6 where !isInView(element, of: rows, in: app) {
      scroll(page, back: element.frame.midY < page.frame.midY)
    }
  }

  private func flick(_ rows: Rows, back: Bool, in app: XCUIApplication) {
    if device == .mac {
      rows.list.scroll(byDeltaX: 0, deltaY: back ? 450 : -450)
    } else if back {
      gesture { app.windows.firstMatch.swipeDown() }
    } else {
      gesture { app.windows.firstMatch.swipeUp() }
    }
  }

  private func awaited(_ number: Int, of rows: Rows, in app: XCUIApplication) -> XCUIElement {
    let row = rows.row(number)
    let deadline = Date.now.addingTimeInterval(Self.patience)
    var looking = Date.now
    var looked: Date?
    let unlisted = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier IN %@", ["examples.empty", "examples.failed"])
    ).firstMatch
    while !row.exists, Date.now < deadline {
      XCTAssertFalse(
        unlisted.exists,
        "the screen said it had no examples, or couldn't load them, before row \(number)")
      if let looked { letLinkingGo(heldBefore: looked) }
      scroll(toward: number, of: rows, in: app)
      looked = looking
      looking = .now
    }
    return row
  }

  private func laidOutFrame(
    of element: XCUIElement, within area: XCUIElement?, in app: XCUIApplication
  ) -> CGRect? {
    guard element.exists else { return nil }
    let frame = element.frame
    guard !frame.isNull, frame.width > 0, frame.height > 0 else { return nil }
    let bounds = (area ?? app.windows.firstMatch).frame
    return bounds.contains(CGPoint(x: frame.midX, y: frame.midY)) ? frame : nil
  }

  private func laidOut(_ number: Int, of rows: Rows, in app: XCUIApplication) -> CGRect? {
    let row = rows.row(number)
    let area = device == .mac ? rows.list : nil
    let deadline = Date.now.addingTimeInterval(Self.patience)
    while Date.now < deadline {
      if let frame = laidOutFrame(of: row, within: area, in: app) {
        lastLaidOut = number
        return frame
      }
      nudge(toward: number, of: rows, in: app)
    }
    return nil
  }

  private func nudge(toward number: Int, of rows: Rows, in app: XCUIApplication) {
    let row = rows.row(number)
    let frame = row.exists ? row.frame : .null
    guard !frame.isNull, frame.width > 0, frame.height > 0 else {
      guard device == .mac else { return scroll(toward: number, of: rows, in: app) }
      let seen = laidOutNumber(of: rows) ?? lastLaidOut
      return flick(rows, back: seen.map { number < $0 } ?? false, in: app)
    }
    guard device == .mac else {
      return scroll(app.windows.firstMatch, back: frame.midY < app.windows.firstMatch.frame.midY)
    }
    rows.list.scroll(byDeltaX: 0, deltaY: rows.list.frame.midY - frame.midY)
  }

  private func laidOutNumber(of rows: Rows) -> Int? {
    guard let list = try? rows.list.snapshot() else { return nil }
    var unread: [any XCUIElementSnapshot] = [list]
    while let element = unread.popLast() {
      let frame = element.frame
      if element.identifier.hasPrefix(rows.prefix), !frame.isNull, frame.width > 0,
        frame.height > 0, list.frame.contains(CGPoint(x: frame.midX, y: frame.midY)),
        let number = Int(element.identifier.dropFirst(rows.prefix.count))
      {
        return number
      }
      unread.append(contentsOf: element.children)
    }
    return nil
  }

  @discardableResult
  private func reveal(_ number: Int, of rows: Rows, in app: XCUIApplication) -> XCUIElement {
    let row = awaited(number, of: rows, in: app)
    if laidOut(number, of: rows, in: app) == nil { XCTFail("row \(number) never laid out") }
    return reveal(row, in: app, within: device == .mac ? rows.list : nil)
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
      guard let frame = laidOut(number, of: rows, in: app) else {
        XCTFail("row \(number) never laid out", file: file, line: line)
        continue
      }
      for prefix in rows.words(number) {
        XCTAssertTrue(
          firstElement(identifiedBy: prefix, in: app).exists,
          "row \(number) appeared without \(prefix)", file: file, line: line)
      }
      measured.append(Measured(number: number, height: frame.height))
    }
    return measured
  }

  private func assertKeepTheirHeight(
    _ measured: [Measured], of rows: Rows, in app: XCUIApplication,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    letLinkingGo(heldBefore: .now)
    RunLoop.current.run(until: Date.now.addingTimeInterval(Self.settling))
    for shown in measured.reversed() {
      guard let frame = laidOut(shown.number, of: rows, in: app) else {
        XCTFail("row \(shown.number) wasn't laid out again", file: file, line: line)
        continue
      }
      XCTAssertEqual(
        frame.height, shown.height, accuracy: 0.5,
        "row \(shown.number) changed height after it appeared", file: file, line: line)
    }
  }
}
