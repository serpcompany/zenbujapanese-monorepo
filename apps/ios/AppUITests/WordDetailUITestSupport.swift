import XCTest

enum WordDetailUITestSupport {
  static let longHeadword = "キャリア検知多重アクセス衝突検出ネットワーク"
  static let longReading = "キャリアけんちたじゅうアクセスしょうとつけんしゅつネットワーク"
  static let longPrimaryKanji = ["検", "知", "多", "重", "衝", "突", "出"]

  @MainActor
  static func tapVisibleSearchResult(
    _ result: XCUIElement,
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let navigation = app.navigationBars.firstMatch
    let searchField = app.textFields["search.field"]
    let tabBar = app.tabBars.firstMatch
    guard result.exists, navigation.exists, searchField.exists, tabBar.exists else {
      XCTFail("Search result and native viewport boundaries must exist", file: file, line: line)
      return
    }
    let top = max(navigation.frame.maxY, searchField.frame.maxY) + 8
    let bottom = tabBar.frame.minY - 8
    let viewport = CGRect(
      x: app.frame.minX, y: top, width: app.frame.width, height: max(0, bottom - top))
    let visible = result.frame.intersection(viewport)
    guard !visible.isNull, visible.width >= 44, visible.height >= 44 else {
      XCTFail(
        "Result \(result.identifier) needs a visible 44-point touch area; found \(visible)",
        file: file, line: line
      )
      return
    }
    // An accessibility-size row can be taller than the display. Tap its actual
    // visible portion once; the caller must still prove the destination opens.
    let offset = CGVector(dx: visible.midX - app.frame.minX, dy: visible.midY - app.frame.minY)
    XCTContext.runActivity(named: "Tap visible Search result intersection \(visible)") { _ in
      app.coordinate(withNormalizedOffset: .zero).withOffset(offset).tap()
    }
  }

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
