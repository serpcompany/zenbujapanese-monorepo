import XCTest

final class HeldConversationUITests: ZenbuUITestCase {
  func testAPauseMidSentenceKeepsTheAppOpen() {
    let app = startConversation(holding: true)
    let toggle = find("translate.session.toggle", in: app)
    let live = find("translate.live", in: app)
    for line in 0..<2 {
      if line > 0 { letTheScriptGoOn() }
      waitFor(live)
      let paused = heardSoFar(on: live) ?? ""
      let finished = sentenceCards(in: app).count
      pauseTheConversation(app)
      toggle.tap()
      waitUntil(toggle, "label == 'Pause'")
      letTheScriptGoOn()
      waitUntil("\"\(paused)…\" being heard to its end") {
        let cards = self.sentenceCards(in: app).allElementsBoundByIndex.map(\.identifier)
        guard cards.count > finished, let newest = cards.last else { return false }
        return self.isSentence(self.opening(of: newest, in: app), paused)
      }
    }
  }

  func testATurnsAudioWaitsForAPauseAndPlaysOnceItEnds() {
    let app = startConversation(holding: true)
    letTheScriptGoOn()
    tap(waitFor(word(containing: ".translation.", identifiedBy: "translate.sentence.", in: app)))
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    waitFor(find("word-detail.screen", in: app))
    waitUntilTheSessionSays("Speaking Japanese", in: app)
    letThePlaybackGoOn()
    waitUntilTheSessionSays("Listening", in: app)
    letTheScriptGoOn()
    waitUntilTheSessionSays("Hearing speech", in: app)
    letTheScriptGoOn()
    waitUntilTheSessionSays("1 waiting for a pause", in: app)
    letTheScriptGoOn()
    waitUntilTheSessionSays("2 waiting for a pause", in: app)
    letTheScriptGoOn()
    waitUntilTheSessionSays("Speaking English", in: app)
    open(.search, in: app)
    waitUntilTheSessionSays("Conversation still listening · Return", in: app)
    tap(find("translate.session.status", in: app))
    assertOnScreen(find("translate.conversation.back", in: app), in: app)
  }

  private func heardSoFar(on live: XCUIElement) -> String? {
    guard let card = try? live.snapshot() else { return nil }
    let shown = text(of: card)
    return (shown.components(separatedBy: "▍").first ?? shown).trimmingCharacters(in: .whitespaces)
  }

  private func opening(of sentence: String, in app: XCUIApplication) -> String {
    let english = find("\(sentence).source", in: app)
    if let shown = try? english.snapshot() { return text(of: shown) }
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
}
