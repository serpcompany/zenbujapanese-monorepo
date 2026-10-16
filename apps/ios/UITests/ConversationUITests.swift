import XCTest

final class ConversationUITests: ZenbuUITestCase {
  func testTheControlsMutePauseAndResume() {
    let app = startConversation()
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    waitUntil(find("translate.session.mute", in: app), "label == 'Play Translations Aloud'")
    waitFor(find("translate.session.speed", in: app))
    pauseTheConversation(app)
    let toggle = find("translate.session.toggle", in: app)
    toggle.tap()
    waitUntil(toggle, "label == 'Pause'")
  }

  func testTwoPanesHoldEachLanguage() {
    let app = startConversation()
    pauseTheConversation(app)
    tap(find("translate.conversation.options", in: app))
    tap(menuChoice("Two Panes", in: app))
    let japanese = find("translate.pane.ja", in: app)
    let english = find("translate.pane.en", in: app)
    assertOnScreen(japanese, in: app)
    assertOnScreen(english, in: app)
    XCTAssertLessThan(japanese.frame.minY, english.frame.minY, "Japanese is the top pane")
    tap(find("translate.conversation.options", in: app))
    tap(menuChoice("Cards", in: app))
    waitUntilGone(japanese)
    assertOnScreen(firstElement(identifiedBy: "translate.sentence.", in: app), in: app)
  }

  func testListeningRunsTheAnnouncementsAndMutesThem() {
    let app = startConversation(option: "listening")
    for control in ["mute", "slower", "faster", "toggle"] {
      assertOnScreen(find("translate.session.\(control)", in: app), in: app)
    }
    assertLeadsWithItsTranslation(cardOf(word(containing: "関東", in: app)), in: app)
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    waitUntil(find("translate.session.mute", in: app), "label == 'Play Translations Aloud'")
    assertLeadsWithItsTranslation(cardOf(word(containing: "新宿", in: app)), in: app)
  }

  private func word(containing text: String, in app: XCUIApplication) -> XCUIElement {
    waitFor(word(containing: text, identifiedBy: "translate.sentence.", in: app))
  }

  private func cardOf(_ word: XCUIElement) -> String {
    let parts = word.identifier.split(separator: ".")
    return parts.prefix(3).joined(separator: ".")
  }

  private func assertLeadsWithItsTranslation(_ card: String, in app: XCUIApplication) {
    var order: (translation: CGFloat, source: CGFloat)?
    waitUntil("\(card) to show its translation and what was heard") {
      guard let shown = try? self.find(card, in: app).snapshot(),
        let translation = Self.frame(in: shown, startingWith: "\(card).translation"),
        let source = Self.frame(in: shown, startingWith: "\(card).source")
      else { return false }
      order = (translation.minY, source.minY)
      return true
    }
    if let order {
      XCTAssertLessThan(order.translation, order.source, "Listening leads \(card) with its translation")
    }
  }

  private static func frame(in shown: XCUIElementSnapshot, startingWith prefix: String) -> CGRect? {
    if shown.identifier.hasPrefix(prefix), !shown.frame.isEmpty { return shown.frame }
    for child in shown.children {
      if let frame = frame(in: child, startingWith: prefix) { return frame }
    }
    return nil
  }

  func testABookmarkedSentenceIsListedUnderBookmarked() {
    let app = startConversation()
    saveAndExit(app)
    tap(find("translate.history", in: app))
    tap(find("translate.history.row", in: app))
    waitFor(find("translate.detail", in: app))
    let bookmark = waitFor(sentenceButtons(".bookmark", in: app).firstMatch)
    let cards = sentenceCards(in: app).count
    XCTAssertEqual(sentenceButtons(".replay", in: app).count, cards, "a speaker on each sentence")
    XCTAssertEqual(sentenceButtons(".bookmark", in: app).count, cards, "a bookmark on each sentence")
    tap(find("translate.detail.more", in: app))
    for choice in ["Furigana", "Share", "Delete Conversation"] { waitFor(offered(choice, in: app)) }
    tap(menuChoice("Copy Transcript", in: app))
    tap(bookmark)
    goBack(in: app)
    choose("Bookmarked", in: find("translate.history.filter", in: app))
    waitFor(sentenceButtons(".bookmark", in: app).firstMatch)
  }

  func testSilenceAsksWhetherAnyoneIsStillThere() {
    let app = startConversation()
    let prompt = waitFor(find("translate.still-there", in: app))
    tap(app.buttons["Keep Listening"].firstMatch)
    waitUntilGone(prompt)
  }

  func testNobodyAnsweringTheSilencePromptPausesTheConversation() {
    let app = startConversation()
    let stillThere = waitFor(find("translate.still-there", in: app))
    skipTheSilenceCountdown()
    let paused = waitFor(prompt(in: app))
    waitFor(
      paused.staticTexts.matching(
        NSPredicate(format: "label BEGINSWITH %@ OR value BEGINSWITH %@", "Paused after", "Paused after")
      ).firstMatch)
    waitUntilGone(stillThere)
    let toggle = find("translate.session.toggle", in: app)
    XCTAssertEqual(toggle.label, "Resume", "the conversation paused")
    tap(paused.buttons.matching(showing("Resume")).firstMatch)
    waitUntil(toggle, "label == 'Pause'")
    tap(find("translate.still-there.pause", in: app))
    waitUntilGone(stillThere)
    waitUntil(toggle, "label == 'Resume'")
  }

  func testExitWithoutSavingLeavesNothingInTranslations() {
    let app = startConversation()
    waitFor(word(containing: ".translation", identifiedBy: "translate.sentence.", in: app))
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Exit Without Saving"].firstMatch)
    tap(find("translate.history", in: app))
    waitFor(labeled("No Conversations Yet", in: app))
  }

  func testLeavingTheAppPausesTheConversation() {
    let app = startConversation()
    leaveAndReturn(to: app)
    if device == .mac {
      waitUntil(find("translate.session.toggle", in: app), "label == 'Resume'")
    } else {
      waitFor(app.staticTexts["Paused while you were away"])
    }
  }

  func testAWordsFullEntryShowsTheSessionBarThatReturns() {
    let app = startConversation()
    openAWordsFullEntry(in: app)
    let status = waitFor(find("translate.session.status", in: app))
    open(.search, in: app)
    waitUntil("the session bar saying the conversation is paused") {
      self.text(of: status) == "Conversation paused · Return"
    }
    tap(status)
    assertOnScreen(find("translate.conversation.back", in: app), in: app)
  }

  func testAccountsTranslationsLeavesOutTheLiveConversationAndItsSpeakers() {
    let app = startConversation()
    saveAndExit(app)
    tap(find("translate.start.conversation", in: app))
    openAWordsFullEntry(in: app)
    open(.account, in: app)
    let translations = reveal(find("account.translations", in: app), in: app)
    waitUntil(translations, counts: 1)
    tap(translations)
    tap(find("translate.history.row", in: app))
    waitFor(sentenceButtons(".bookmark", in: app).firstMatch)
    XCTAssertFalse(
      sentenceButtons(".replay", in: app).firstMatch.exists,
      "a transcript has no speaker while a conversation is live")
    tap(word(containing: ".translation.", in: app))
    assertSheetPlacement(waitForSheet("recognized-word-sheet", in: app), in: app)
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    goBack(in: app)
    waitFor(find("translate.detail", in: app))
  }

  func testDeletingInAccountsTranslationsLowersItsCountAndLeavesTranslateWithout() {
    let app = startConversation()
    saveAndExit(app)
    open(.account, in: app)
    let translations = reveal(find("account.translations", in: app), in: app)
    waitUntil(translations, counts: 1)
    tap(translations)
    tap(find("translate.history.more", in: app))
    tap(menuChoice("Delete All…", in: app))
    tap(app.buttons["Delete All Conversations"].firstMatch)
    waitFor(labeled("No Conversations Yet", in: app))
    goBack(in: app)
    waitUntil(translations, counts: 0)
    open(.translate, in: app)
    tap(find("translate.history", in: app))
    waitFor(labeled("No Conversations Yet", in: app))
  }

  func testAWordSheetsConjugationsAndKanjiOpenTheirPagesInTranslate() {
    let app = startConversation()
    waitFor(word(containing: "番", identifiedBy: "translate.sentence.", in: app))
    pauseTheConversation(app)
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
    pauseTheConversation(app)
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
    saveAndExit(app)
    tap(find("translate.history", in: app))
    deleteTheConversation(in: app)
  }

  private func deleteTheConversation(in app: XCUIApplication) {
    openContextMenu(on: find("translate.history.row", in: app))
    waitFor(offered("Copy", in: app))
    waitFor(offered("Share", in: app))
    tap(menuChoice("Delete", in: app))
    tap(app.buttons["Delete Conversation"].firstMatch)
    waitFor(labeled("No Conversations Yet", in: app))
  }

  private func openAWordsFullEntry(in app: XCUIApplication) {
    let spoken = waitFor(word(containing: ".source.", identifiedBy: "translate.sentence.", in: app))
    pauseTheConversation(app)
    tap(spoken)
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
  }

  private func offered(_ choice: String, in app: XCUIApplication) -> XCUIElement {
    menuChoices(in: app)
      .matching(NSPredicate(format: "label BEGINSWITH %@ OR title BEGINSWITH %@", choice, choice))
      .firstMatch
  }

  private func waitUntil(_ row: XCUIElement, counts count: Int) {
    waitUntil(row, "label ENDSWITH %@ OR value == %@", ", \(count)", "\(count)")
  }
}
