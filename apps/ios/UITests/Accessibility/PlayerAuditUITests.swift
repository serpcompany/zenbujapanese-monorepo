import XCTest

final class PlayerAuditUITests: AccessibilityAuditCase {
  func testPlayersScreensPassTheAuditAtTheDefaultTextSize() {
    auditPlayer(.standard)
  }

  func testPlayersScreensPassTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    auditPlayer(.largest)
  }

  func testPlayersScreensPassTheAuditInDarkAppearance() {
    auditPlayer(.dark)
  }

  private func auditPlayer(_ pass: AuditPass) {
    auditAVideoAndRecent(pass)
    auditAVideo(
      "A video without Japanese captions", PlayerWatchUITests.standIn(captionTracks: "[]"),
      saying: "No Japanese Captions", pass)
    auditAVideo(
      "A video its owner won't share", PlayerWatchUITests.standIn(playerError: 150),
      saying: "Video Unavailable", pass)
  }

  private func auditAVideoAndRecent(_ pass: AuditPass) {
    let app = launch(pass, PlayerWatchUITests.standIn())
    open(.player, in: app)
    waitFor(labeled("No Videos Yet", in: app))
    audit("Player", in: app)
    type(PlayerWatchUITests.link + "\n", into: waitFor(searchField(in: app)))
    waitFor(firstElement(identifiedBy: "watch.cue.0.", in: app))
    waitUntil(find("watch.comprehension", in: app), mentions: "words known")
    audit("A video", in: app)
    tap(firstElement(identifiedBy: "watch.cue.0.", in: app))
    openAtFullHeight(waitForSheet("recognized-word-sheet", in: app), in: app)
    waitFor(find("word-detail.screen", in: app))
    audit("A caption's word", in: app)
    tap(find("recognized-word-sheet.done", in: app))
    goBack(in: app)
    waitFor(firstElement(identifiedBy: "watch.recent.", in: app))
    audit("Player's Recent", in: app)
    type("golden eggs japanese\n", into: waitFor(searchField(in: app)))
    let page = waitFor(app.webViews.firstMatch)
    waitFor(page.descendants(matching: .any).matching(showing("Stand-in result 1")).firstMatch)
    audit("Player's search results", in: app)
  }

  private func openAtFullHeight(_ sheet: XCUIElement, in app: XCUIApplication) {
    guard device == .phone else { return }
    let window = app.windows.firstMatch
    let grabber = waitFor(app.buttons["Sheet Grabber"]).coordinate(
      withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    gesture(on: sheet) {
      grabber.press(
        forDuration: 0.1, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    }
    XCTAssertTrue(
      comesTrue("the word sheet to open at full height", within: Self.patience) {
        sheet.frame.minY < window.frame.height * Self.fullHeightTop
      }, "the word sheet's top is at \(sheet.frame.minY) in a window \(window.frame.height) tall")
  }

  private static let fullHeightTop = 0.15

  private func auditAVideo(
    _ screen: String, _ standIn: [String: String], saying message: String, _ pass: AuditPass
  ) {
    let app = launch(pass, standIn)
    open(.player, in: app)
    type(PlayerWatchUITests.link + "\n", into: waitFor(searchField(in: app)))
    waitFor(labeled(message, in: app))
    audit(screen, in: app)
  }
}
