import XCTest

final class KeyboardAndWindowUITests: ZenbuUITestCase {
  func testTheTabShortcutsSwitchTabs() throws {
    try XCTSkipIf(device == .phone, "the iPhone has no menus or keyboard shortcuts")
    let app = launchAndTouch()
    for tab in [AppTab.translate, .player, .account, .search] {
      press(tab.shortcut, until: find(tab.rootIdentifier, in: app), in: app)
    }
  }

  func testFindInDictionaryPutsTheCursorInSearch() throws {
    try XCTSkipUnless(
      device == .mac, "iPadOS keeps ⌘F for its own Find, so it doesn't reach Find in Dictionary")
    let app = launchAndTouch()
    open(.account, in: app)
    press("f", until: find("search.field", in: app), in: app)
    app.typeText("japan\n")
    waitFor(find("result.japan", in: app))
  }

  func testSearchAnImageGoesToTranslatesCameraAndOffersItsSources() throws {
    try XCTSkipIf(device == .phone, "the iPhone has no menus or keyboard shortcuts")
    let app = launchAndTouch()
    press("i", [.command, .shift], until: find("image-source.photo-library", in: app), in: app)
    waitFor(find("image-source.files", in: app))
    XCTAssertEqual(find("image-source.paste", in: app).exists, device == .mac)
    XCTAssertEqual(find("image-source.camera", in: app).exists, device != .mac)
    tap(find("image-source.cancel", in: app))
    waitUntilGone(find("image-source.files", in: app))
    XCTAssertTrue(waitFor(find("translate.start.camera", in: app)).isSelected)
  }

  func testTheSettingsWindowHoldsTheAccountReadingAidsAndFrequencyDictionaries() throws {
    try XCTSkipUnless(device == .mac, "iPhone and iPad keep these settings in Account")
    let app = launch()
    let settings = find("settings.window", in: app)
    press(",", until: settings, in: app)
    waitFor(find("settings.profile", in: app))
    settings.buttons["Reading Aids"].tap()
    waitFor(find("reading-aids.form", in: app))
    settings.buttons["Frequency Dictionaries"].tap()
    waitFor(find("frequency-packs.list", in: app))
  }

  func testANewWindowTakesTheShortcutsWhileTheFirstKeepsItsTab() throws {
    try XCTSkipUnless(device == .mac, "only the Mac opens windows from its menu")
    let app = launch()
    open(.search, in: app)
    shortcut("n", in: app)
    let windows = app.windows.matching(NSPredicate(format: "identifier != 'settings.window'"))
    expectation(for: NSPredicate(format: "count == 2"), evaluatedWith: windows)
    waitForExpectations(timeout: Self.patience)
    shortcut("2", in: app)
    let starts = app.descendants(matching: .any).matching(identifier: "translate.start")
    let fields = app.descendants(matching: .any).matching(identifier: "search.field")
    expectation(for: NSPredicate(format: "count == 1"), evaluatedWith: starts)
    waitForExpectations(timeout: Self.patience)
    XCTAssertEqual(fields.count, 1, "the first window stays on Search")
  }

  private func launchAndTouch() -> XCUIApplication {
    let app = launch()
    tabItem(.search, in: app).tap()
    app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
    RunLoop.current.run(until: Date.now.addingTimeInterval(1))
    return app
  }

  private func press(
    _ key: String, _ modifiers: XCUIElement.KeyModifierFlags = .command, until element: XCUIElement,
    in app: XCUIApplication
  ) {
    for _ in 0..<3 {
      shortcut(key, modifiers, in: app)
      if element.waitForExistence(timeout: Self.patience / 3) { return }
    }
    waitFor(element)
  }
}
