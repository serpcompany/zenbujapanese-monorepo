import XCTest

final class ConversationUITests: ZenbuUITestCase {
  func testTheControlsMutePauseAndResume() {
    let app = startConversation()
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    XCTAssertEqual(waitFor(find("translate.session.mute", in: app)).label, "Play Translations Aloud")
    waitFor(find("translate.session.speed", in: app))
    let toggle = find("translate.session.toggle", in: app)
    tap(toggle)
    expectation(for: NSPredicate(format: "label == 'Resume'"), evaluatedWith: toggle)
    waitForExpectations(timeout: Self.patience)
    toggle.tap()
    expectation(for: NSPredicate(format: "label == 'Pause'"), evaluatedWith: toggle)
    waitForExpectations(timeout: Self.patience)
  }

  func testTwoPanesHoldEachLanguage() {
    let app = startConversation()
    tap(find("translate.conversation.options", in: app))
    tap(app.buttons["Two Panes"])
    assertOnScreen(find("translate.pane.ja", in: app), in: app)
    assertOnScreen(find("translate.pane.en", in: app), in: app)
  }

  func testListeningRunsTheAnnouncements() {
    let app = startConversation(option: "listening")
    waitFor(labeled("今夜までに雨は止み、明日は関東全域で晴れるでしょう。", in: app))
  }

  func testABookmarkedSentenceIsListedUnderBookmarked() {
    let app = startConversation()
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"])
    tap(find("translate.history", in: app))
    tap(find("translate.history.row", in: app))
    waitFor(find("translate.detail", in: app))
    let bookmark = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier ENDSWITH '.bookmark'")).firstMatch
    tap(bookmark)
    goBack(in: app)
    let filter = waitFor(find("translate.history.filter", in: app))
    filter.buttons["Bookmarked"].tap()
    waitFor(app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier ENDSWITH '.bookmark'")).firstMatch)
  }

  func testSilenceAsksWhetherAnyoneIsStillThere() {
    let app = startConversation()
    let prompt = waitFor(find("translate.still-there", in: app))
    tap(find("translate.still-there.keep", in: app))
    waitUntilGone(prompt)
  }

  func testLeavingTheAppPausesTheConversation() {
    let app = startConversation()
    TestDevice.leaveAndReturn(to: app)
    if device == .mac {
      expectation(for: NSPredicate(format: "label == 'Resume'"), evaluatedWith: find("translate.session.toggle", in: app))
      waitForExpectations(timeout: Self.patience)
    } else {
      waitFor(app.staticTexts["Paused while you were away"])
    }
  }

  func testAWordsFullEntryShowsTheSessionBarThatReturns() {
    let app = startConversation()
    let word = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'translate.sentence.' AND identifier CONTAINS '.source.'"))
      .firstMatch
    tap(word)
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    tap(find("translate.session", in: app))
    assertOnScreen(find("translate.live", in: app), in: app)
  }

  private func startConversation(option: String = "conversation") -> XCUIApplication {
    let app = launch(TranslateUITests.script)
    open(.translate, in: app)
    tap(find("translate.start.\(option)", in: app))
    tap(find("translate.start", in: app))
    waitFor(find("translate.live", in: app))
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    return app
  }
}
