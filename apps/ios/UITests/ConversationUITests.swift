import XCTest

final class ConversationUITests: ZenbuUITestCase {
  func testTheControlsMutePauseAndResume() {
    let app = startConversation()
    let mute = waitFor(find("translate.session.mute", in: app))
    XCTAssertEqual(mute.label, "Mute Translations")
    mute.tap()
    waitUntil(find("translate.session.mute", in: app), "label == 'Play Translations Aloud'")
    waitFor(find("translate.session.speed", in: app))
    pause(app)
    let toggle = find("translate.session.toggle", in: app)
    toggle.tap()
    waitUntil(toggle, "label == 'Pause'")
  }

  func testAPauseMidSentenceKeepsTheAppOpen() {
    let app = startConversation()
    let toggle = find("translate.session.toggle", in: app)
    let live = find("translate.live", in: app)
    var heardToTheirEnd = 0
    while appears(live, within: Self.patience / 6) {
      let paused = heardSoFar(on: live)
      pause(app)
      let finished = finishedSentences(in: app)
      toggle.tap()
      waitUntil(toggle, "label == 'Pause'")
      if let newest = finished.last, isSentence(opening(of: newest, in: app), paused) { continue }
      var outcome = PausedSentence.notYetHeard
      waitUntil("\"\(paused)…\" being heard to its end, or the script moving past it") {
        outcome = self.whereItStands(paused, finishedBefore: finished, live: live, in: app)
        return outcome != .notYetHeard
      }
      if outcome == .heardToItsEnd { heardToTheirEnd += 1 }
    }
    XCTAssertGreaterThan(
      heardToTheirEnd, 1, "sentences paused while they were heard were heard to their end")
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
  }

  private enum PausedSentence {
    case notYetHeard
    case heardToItsEnd
    case passedBy
  }

  private func whereItStands(
    _ paused: String, finishedBefore finished: [String], live: XCUIElement,
    in app: XCUIApplication
  ) -> PausedSentence {
    if let added = finishedSentences(in: app).first(where: { !finished.contains($0) }) {
      let opening = opening(of: added, in: app)
      if opening.isEmpty { return .notYetHeard }
      return isSentence(opening, paused) ? .heardToItsEnd : .passedBy
    }
    if live.exists {
      let now = heardSoFar(on: live)
      if !now.isEmpty, !isSentence(now, paused) { return .passedBy }
    }
    return find("translate.still-there", in: app).exists ? .passedBy : .notYetHeard
  }

  private func finishedSentences(in app: XCUIApplication) -> [String] {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier MATCHES %@", #"translate\.sentence\.[^.]+"#))
      .allElementsBoundByIndex.map(\.identifier)
  }

  private func heardSoFar(on live: XCUIElement) -> String {
    let shown = text(of: live)
    return (shown.components(separatedBy: "▍").first ?? shown).trimmingCharacters(in: .whitespaces)
  }

  private func opening(of sentence: String, in app: XCUIApplication) -> String {
    let english = find("\(sentence).source", in: app)
    if english.exists { return text(of: english) }
    let prefix = "\(sentence).source."
    let words = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
      .allElementsBoundByIndex
      .compactMap { word -> (Int, String)? in
        let parts = word.identifier.dropFirst(prefix.count).split(separator: ".", maxSplits: 1)
        guard parts.count == 2, let index = Int(parts[0]) else { return nil }
        return (index, String(parts[1]))
      }
    return words.min { $0.0 < $1.0 }?.1 ?? ""
  }

  private func isSentence(_ opening: String, _ heard: String) -> Bool {
    !opening.isEmpty && !heard.isEmpty && (opening.hasPrefix(heard) || heard.hasPrefix(opening))
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
    waitUntil(find("translate.session.mute", in: app), "label == 'Play Translations Aloud'")
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
    leaveAndReturn(to: app)
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
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    return app
  }
}
