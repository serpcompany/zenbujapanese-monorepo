import XCTest

final class RevealUITests: ZenbuUITestCase {
  func testRevealScrollsBackUpToARowTheListLetGo() throws {
    try XCTSkipIf(device == .mac, "the Mac's lists keep every row, so none is let go to find again")
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.credits", in: app), in: app))
    let first = waitFor(find("credits.source.jmdict", in: app))
    reveal(find("credits.licenses", in: app), in: app)
    XCTAssertFalse(first.exists, "the list let go of its first source on the way to its end")
    XCTAssertTrue(isReachable(reveal(first, in: app), in: app), "the first source is back in reach")
  }
}
