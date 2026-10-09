import XCTest

final class ConversationUITests: ZenbuUITestCase {
  func testTheControlsMutePauseAndResume() {
    let app = startConversation()
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    XCTAssertEqual(waitFor(find("translate.session.mute", in: app)).label, "Play Translations Aloud")
    waitFor(find("translate.session.speed", in: app))
    pause(app)
    let toggle = find("translate.session.toggle", in: app)
    toggle.tap()
    expectation(for: NSPredicate(format: "label == 'Pause'"), evaluatedWith: toggle)
    waitForExpectations(timeout: Self.patience)
  }

  func testTwoPanesHoldEachLanguage() {
    let app = startConversation()
    pause(app)
    tap(find("translate.conversation.options", in: app))
    tap(app.buttons["Two Panes"])
    assertOnScreen(find("translate.pane.ja", in: app), in: app)
    assertOnScreen(find("translate.pane.en", in: app), in: app)
  }

  func testListeningRunsTheAnnouncements() {
    let app = startConversation(option: "listening")
    waitFor(word(containing: "関東", identifiedBy: "translate.sentence.", in: app))
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
    choose("Bookmarked", in: find("translate.history.filter", in: app))
    waitFor(app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier ENDSWITH '.bookmark'")).firstMatch)
  }

  func testSilenceAsksWhetherAnyoneIsStillThere() {
    let app = startConversation()
    let prompt = waitFor(find("translate.still-there", in: app))
    tap(app.buttons["Keep Listening"].firstMatch)
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
    let spoken = waitFor(word(containing: ".source.", identifiedBy: "translate.sentence.", in: app))
    pause(app)
    tap(spoken)
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    tap(find("translate.session.status", in: app))
    assertOnScreen(find("translate.conversation.back", in: app), in: app)
  }

  func testAWordSheetsConjugationsAndKanjiOpenTheirPagesInTranslate() {
    let app = startConversation()
    waitFor(word(containing: "番", identifiedBy: "translate.sentence.", in: app))
    pause(app)
    tap(word(containing: "曲が", identifiedBy: "translate.sentence.", in: app))
    tap(inWordSheet("word-detail.conjugations", in: app))
    waitFor(find("conjugations.screen", in: app))
    waitUntilGone(find("recognized-word-sheet", in: app))
    tap(find("translate.session.status", in: app))
    openKanji("番", fromWordIdentifiedBy: "translate.sentence.", in: app)
    waitFor(find("translate.session.status", in: app))
  }

  func testScrollingBackOffersJumpToLatest() {
    let app = startConversation(arguments: TestDevice.largestTextArguments)
    for control in ["mute", "slower", "faster", "toggle"] {
      assertOnScreen(find("translate.session.\(control)", in: app), in: app)
    }
    waitFor(word(containing: "ありがとう", identifiedBy: "translate.sentence.", in: app))
    pause(app)
    if device == .mac {
      shrinkWindow(in: app)
      app.windows.firstMatch.scroll(byDeltaX: 0, deltaY: 800)
    } else {
      app.windows.firstMatch.swipeDown()
    }
    tap(find("translate.jump-to-latest", in: app))
    waitUntilGone(find("translate.jump-to-latest", in: app))
  }

  func testADeletedConversationLeavesTranslations() {
    let app = startConversation()
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"])
    tap(find("translate.history", in: app))
    openContextMenu(on: find("translate.history.row", in: app))
    tap(app.buttons["Delete"].firstMatch)
    tap(app.buttons["Delete Conversation"].firstMatch)
    waitFor(labeled("No Conversations Yet", in: app))
  }

  private func pause(_ app: XCUIApplication) {
    let toggle = find("translate.session.toggle", in: app)
    tap(toggle)
    expectation(for: NSPredicate(format: "label == 'Resume'"), evaluatedWith: toggle)
    waitForExpectations(timeout: Self.patience)
  }

  private func startConversation(option: String = "conversation", arguments: [String] = [])
    -> XCUIApplication
  {
    let app = launch(TranslateUITests.script, arguments: arguments)
    open(.translate, in: app)
    tap(find("translate.start.\(option)", in: app))
    tap(find("translate.start", in: app))
    waitFor(find("translate.live", in: app))
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    return app
  }
}
