import XCTest

final class PlayerUITests: ZenbuUITestCase {
  func testPlayerExplainsItselfWithNoVideosAndOffersItsSearchBar() {
    let app = launch()
    open(.player, in: app)
    assertOnScreen(find("watch.empty", in: app), in: app)
    waitFor(labeled("No Videos Yet", in: app))
    assertOnScreen(app.searchFields.firstMatch, in: app)
  }
}
