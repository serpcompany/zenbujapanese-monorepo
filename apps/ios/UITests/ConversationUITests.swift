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
    waitUntil(toggle, "label == 'Pause'")
  }

  func testAPauseMidSentenceKeepsTheAppOpen() {
    let app = startConversation()
    let toggle = find("translate.session.toggle", in: app)
    let heard = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier MATCHES %@", #"translate\.sentence\.[^.]+"#))
    let newest = { heard.allElementsBoundByIndex.last?.identifier }
    var pauses = 0
    while appears(find("translate.live", in: app), within: Self.patience / 6) {
      let lastHeard = newest()
      pause(app)
      pauses += 1
      toggle.tap()
      waitUntil(toggle, "label == 'Pause'")
      waitUntil("the paused sentence being heard to its end") { newest() != lastHeard }
    }
    XCTAssertGreaterThan(pauses, 1, "the script's sentences were paused while they were heard")
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
  }

  func testTwoPanesHoldEachLanguage() {
    let app = startConversation()
    pause(app)
    tap(find("translate.conversation.options", in: app))
    tap(menuChoice("Two Panes", in: app))
    assertOnScreen(find("translate.pane.ja", in: app), in: app)
    assertOnScreen(find("translate.pane.en", in: app), in: app)
  }

  func testListeningRunsTheAnnouncementsAndMutesThem() {
    let app = startConversation(option: "listening")
    waitFor(word(containing: "関東", identifiedBy: "translate.sentence.", in: app))
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    XCTAssertEqual(waitFor(find("translate.session.mute", in: app)).label, "Play Translations Aloud")
  }

  func testABookmarkedSentenceIsListedUnderBookmarked() {
    let app = startConversation()
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"].firstMatch)
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
      waitUntil(find("translate.session.toggle", in: app), "label == 'Resume'")
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
    tap(inWordSheet("word-detail.conjugations", in: app), toShow: find("conjugations.screen", in: app))
    waitUntilGone(sheet("recognized-word-sheet", in: app))
    tap(find("translate.session.status", in: app))
    openKanji("番", fromWordIdentifiedBy: "translate.sentence.", in: app)
    waitFor(find("translate.session.status", in: app))
  }

  func testScrollingBackOffersJumpToLatest() {
    let app = startConversation(arguments: TestDevice.largestTextArguments, inTheSmallestWindow: true)
    for control in ["mute", "slower", "faster", "toggle"] {
      assertOnScreen(find("translate.session.\(control)", in: app), in: app)
    }
    let latest = waitFor(word(containing: "ありがとう", identifiedBy: "translate.sentence.", in: app))
    pause(app)
    waitUntilStill(latest)
    let jump = find("translate.jump-to-latest", in: app)
    for _ in 0..<3 {
      if jump.exists { break }
      if device == .mac {
        app.outlines.firstMatch.scroll(byDeltaX: 0, deltaY: 800)
      } else {
        app.windows.firstMatch.swipeDown()
      }
      if appears(jump, within: Self.patience / 3) { break }
    }
    tap(jump)
    waitUntilGone(jump)
  }

  func testADeletedConversationLeavesTranslations() {
    let app = startConversation()
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"].firstMatch)
    tap(find("translate.history", in: app))
    openContextMenu(on: find("translate.history.row", in: app))
    tap(menuChoice("Delete", in: app))
    tap(app.buttons["Delete Conversation"].firstMatch)
    waitFor(labeled("No Conversations Yet", in: app))
  }

  private func pause(_ app: XCUIApplication) {
    let toggle = find("translate.session.toggle", in: app)
    for _ in 0..<3 {
      if waitFor(toggle).label == "Resume" { break }
      toggle.tap()
      let paused = comesTrue("the conversation pausing", within: Self.patience / 3) {
        toggle.label == "Resume"
      }
      if paused { break }
    }
    XCTAssertEqual(toggle.label, "Resume", "the conversation paused")
  }

  private func startConversation(
    option: String = "conversation", arguments: [String] = [], inTheSmallestWindow: Bool = false
  ) -> XCUIApplication {
    let app = launch(TranslateUITests.script, arguments: arguments)
    if inTheSmallestWindow, device == .mac { shrinkWindow(in: app) }
    open(.translate, in: app)
    tap(find("translate.start.\(option)", in: app))
    waitFor(find("translate.live", in: app))
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    return app
  }
}
