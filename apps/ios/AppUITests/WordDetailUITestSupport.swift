import XCTest

enum WordDetailUITestSupport {
  static let longHeadword = "キャリア検知多重アクセス衝突検出ネットワーク"
  static let longReading = "キャリアけんちたじゅうアクセスしょうとつけんしゅつネットワーク"

  @MainActor
  static func assertLongIdentityUsesSecondaryReading(
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) -> XCUIElement {
    let identity = app.descendants(matching: .any)["word-detail.identity"]
    let surface = app.staticTexts["word-detail.identity-surface"]
    let reading = app.staticTexts["word-detail.identity-reading"]
    XCTAssertTrue(identity.waitForExistence(timeout: 3), file: file, line: line)
    XCTAssertEqual(
      identity.label,
      "\(longHeadword), \(longReading)",
      file: file,
      line: line
    )
    XCTAssertTrue(surface.exists, file: file, line: line)
    XCTAssertTrue(reading.exists, file: file, line: line)
    XCTAssertEqual(surface.label, longHeadword, file: file, line: line)
    XCTAssertEqual(reading.label, longReading, file: file, line: line)
    XCTAssertLessThan(surface.frame.maxY, reading.frame.minY, file: file, line: line)
    for element in [surface, reading] {
      XCTAssertGreaterThanOrEqual(element.frame.minX, app.frame.minX, file: file, line: line)
      XCTAssertLessThanOrEqual(element.frame.maxX, app.frame.maxX, file: file, line: line)
      XCTAssertGreaterThan(element.frame.height, 0, file: file, line: line)
    }
    return identity
  }
}
