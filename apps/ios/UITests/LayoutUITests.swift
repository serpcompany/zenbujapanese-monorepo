import XCTest

final class LayoutUITests: ZenbuUITestCase {
  func testEveryTabFitsEachSizeTheDeviceOffers() {
    let app = launch()
    switch device {
    case .phone:
      TestDevice.turn(landscape: true)
      let window = app.windows.firstMatch.frame
      XCTAssertGreaterThan(window.height, window.width, "the iPhone stays portrait")
      assertEveryTabFits(in: app)
      TestDevice.turn(landscape: false)
    case .pad:
      for landscape in [false, true] {
        TestDevice.turn(landscape: landscape)
        let window = app.windows.firstMatch.frame
        XCTAssertEqual(window.width > window.height, landscape, "the iPad turns every way")
        assertEveryTabFits(in: app)
      }
      TestDevice.turn(landscape: false)
    case .mac:
      let opened = app.windows.firstMatch.frame
      XCTAssertEqual(opened.width, 1180, accuracy: 2, "a Mac window opens 1180 wide")
      XCTAssertEqual(opened.height, 820, accuracy: 30, "and 820 tall")
      shrinkWindow(in: app)
      let window = app.windows.firstMatch.frame
      XCTAssertEqual(window.width, 760, accuracy: 2, "the Mac window stops at 760 wide")
      XCTAssertEqual(window.height, 560, accuracy: 30, "and 560 tall")
      assertEveryTabFits(in: app)
    }
  }

  private func assertEveryTabFits(in app: XCUIApplication) {
    for tab in AppTab.allCases {
      open(tab, in: app)
      assertOnScreen(find(tab.rootIdentifier, in: app), in: app)
      assertOnScreen(tabItem(tab, in: app), in: app)
    }
    open(.translate, in: app)
    assertOnScreen(find("translate.history", in: app), in: app)
  }
}
