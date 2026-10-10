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
    press("f", until: searchField(in: app), in: app)
    app.typeText("japan\n")
    waitFor(find("result.japan", in: app))
  }

  func testSearchAnImageGoesToTranslateAndOffersItsSources() throws {
    try XCTSkipIf(device == .phone, "the iPhone has no menus or keyboard shortcuts")
    let app = launchAndTouch()
    press("i", [.command, .shift], until: app.buttons["Photo Library"], in: app)
    XCTAssertEqual(app.buttons["Paste Image"].exists, device == .mac)
    XCTAssertEqual(app.buttons["Take Photo"].exists, device != .mac)
    tap(app.buttons["Cancel"].firstMatch)
    waitUntilGone(app.buttons["Photo Library"])
    assertOnScreen(find("translate.header", in: app), in: app)
  }

  func testSearchAnImagePressedOverASheetStillOffersItsSourcesAfterwards() throws {
    try XCTSkipIf(device == .phone, "the iPhone has no menus or keyboard shortcuts")
    let app = launchAndTouch()
    tap(find("search.input.handwriting", in: app))
    let canvas = waitFor(find("handwriting.canvas", in: app))
    shortcut("i", [.command, .shift], in: app)
    RunLoop.current.run(until: Date.now.addingTimeInterval(2))
    if canvas.exists { closeInputPanel(in: app) }
    waitUntilGone(canvas)
    let photoLibrary = app.buttons["Photo Library"]
    if !photoLibrary.waitForExistence(timeout: 5) {
      open(.translate, in: app)
      tap(find("translate.start.image", in: app))
    }
    waitFor(photoLibrary)
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
    let translates = app.descendants(matching: .any).matching(identifier: "translate.header")
    let searches = app.descendants(matching: .any).matching(identifier: "search.input.handwriting")
    expectation(for: NSPredicate(format: "count == 1"), evaluatedWith: translates)
    waitForExpectations(timeout: Self.patience)
    XCTAssertEqual(searches.count, 1, "the first window stays on Search")
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
