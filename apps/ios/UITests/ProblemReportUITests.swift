import XCTest

extension ZenbuUITestCase {
  static var problemReportStandIn: [String: String] { ["ZENBU_PROBLEM_REPORT_STAND_IN": "1"] }

  @discardableResult
  func openTheReport(in app: XCUIApplication) -> XCUIElement {
    open(.account, in: app)
    tap(reveal(find("account.report-a-problem", in: app), in: app))
    return waitFor(find("problem-report.send", in: app))
  }

  func typeAtTheEnd(_ text: String, of field: XCUIElement, in app: XCUIApplication) {
    waitFor(field).coordinate(withNormalizedOffset: CGVector(dx: Self.endOfTheLine, dy: 0.5)).tap()
    let focused = app.descendants(matching: .any)
      .matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
    waitFor(focused)
    field.typeText(text)
  }

  private static let endOfTheLine = 0.9
}

final class ProblemReportUITests: ZenbuUITestCase {
  func testAReportSendsOnceItSaysWhatHappenedAndTheEmailIsAnAddress() {
    let app = launch(Self.problemReportStandIn)
    let send = openTheReport(in: app)
    reveal(labeled("Account, Signed out", in: app), in: app)
    XCTAssertFalse(send.isEnabled)
    type("The Language menu froze", into: find("problem-report.description", in: app))
    waitUntil(send, "isEnabled == true")
    let email = reveal(find("problem-report.email", in: app), in: app)
    type("pat@", into: email)
    waitFor(find("problem-report.invalid-email", in: app))
    waitUntil(send, "isEnabled == false")
    typeAtTheEnd("example.com", of: email, in: app)
    waitUntilGone(find("problem-report.invalid-email", in: app))
    waitUntil(send, "isEnabled == true")
    tap(send)
    waitFor(labeled("Report Sent", in: app))
    tap(find("problem-report.done", in: app))
    waitFor(find("account.report-a-problem", in: app))
  }

  func testClosingAReportWithTextAsksFirstAndAnEmptyOneClosesAtOnce() {
    let app = launch(Self.problemReportStandIn)
    openTheReport(in: app)
    tap(find("problem-report.cancel", in: app))
    waitFor(find("account.report-a-problem", in: app))
    openTheReport(in: app)
    type("Search froze", into: find("problem-report.description", in: app))
    tap(find("problem-report.cancel", in: app))
    tap(app.buttons["Discard Report"].firstMatch)
    waitUntilGone(find("problem-report.send", in: app))
    openTheReport(in: app)
    waitUntil(find("problem-report.description", in: app), "value != 'Search froze'")
  }

  func testSwipingDownKeepsAReportWithTextAndClosesAnEmptyOne() {
    let app = launch(Self.problemReportStandIn)
    let send = openTheReport(in: app)
    type("Search froze", into: find("problem-report.description", in: app))
    swipeTheReportDown(in: app)
    waitUntilStill(send)
    XCTAssertTrue(send.exists)
    tap(find("problem-report.cancel", in: app))
    tap(app.buttons["Discard Report"].firstMatch)
    waitUntilGone(send)
    openTheReport(in: app)
    swipeTheReportDown(in: app)
    waitUntilGone(find("problem-report.send", in: app))
    waitFor(find("account.report-a-problem", in: app))
  }

  func testABuildThatCantSendKeepsSendOffAndGivesTheSupportAddress() {
    let app = launch()
    let send = openTheReport(in: app)
    type("Search froze", into: find("problem-report.description", in: app))
    let note = reveal(find("problem-report.note", in: app), in: app)
    waitUntil(note, mentions: "support@zenbujapanese.com")
    XCTAssertFalse(send.isEnabled)
  }

  private func swipeTheReportDown(in app: XCUIApplication) {
    let bar = waitFor(app.navigationBars["Report a Problem"]).coordinate(
      withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    bar.press(forDuration: 0.1, thenDragTo: bar.withOffset(CGVector(dx: 0, dy: 600)))
  }
}
