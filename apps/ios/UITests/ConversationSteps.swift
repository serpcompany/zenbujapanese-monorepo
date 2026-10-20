import XCTest
import notify

extension ZenbuUITestCase {
  func startConversation(
    option: String = "conversation", arguments: [String] = [], inTheSmallestWindow: Bool = false,
    holding: Bool = false, silent: Bool = false
  ) -> XCUIApplication {
    let held = silent ? ["ZENBU_TRANSLATE_HOLD": "silent"] : holding ? ["ZENBU_TRANSLATE_HOLD": "1"] : [:]
    let app = launch(TranslateUITests.script.merging(held) { $1 }, arguments: arguments)
    if inTheSmallestWindow, device == .mac { shrinkWindow(in: app) }
    open(.translate, in: app)
    tap(find("translate.start.\(option)", in: app))
    if silent {
      waitUntil(find("translate.session.toggle", in: app), "label == 'Pause'")
    } else {
      waitFor(holding ? find("translate.live", in: app) : firstElement(identifiedBy: "translate.sentence.", in: app))
    }
    return app
  }

  func letTheScriptGoOn() {
    notify_post("com.zenbujapanese.dictionary.uitests.translate-hear-on")
  }

  func letThePlaybackGoOn() {
    notify_post("com.zenbujapanese.dictionary.uitests.translate-play-on")
  }

  func skipTheSilenceCountdown() {
    notify_post("com.zenbujapanese.dictionary.uitests.skip-translate-countdown")
  }

  func pause(_ app: XCUIApplication) {
    turnTheConversation(to: "Resume", saying: "the conversation pausing", in: app)
  }

  func resume(_ app: XCUIApplication) {
    turnTheConversation(to: "Pause", saying: "the conversation listening again", in: app)
  }

  private func turnTheConversation(to label: String, saying what: String, in app: XCUIApplication) {
    let toggle = find("translate.session.toggle", in: app)
    for _ in 0..<3 {
      if waitFor(toggle).label == label { break }
      gesture(on: toggle) { toggle.tap() }
      if comesTrue(what, within: Self.patience / 3, { toggle.label == label }) { break }
    }
    XCTAssertEqual(toggle.label, label, what)
  }

  @discardableResult
  func spokenWord(_ text: String, in app: XCUIApplication) -> XCUIElement {
    waitFor(word(containing: text, identifiedBy: "translate.sentence.", in: app))
  }

  func letTheScriptGoOn(until shown: () -> Bool, saying what: String) {
    letTheScriptGoOn()
    waitUntil(what, shown)
  }

  func saveAndExit(_ app: XCUIApplication) {
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"].firstMatch)
  }

  func sentenceButtons(_ suffix: String, in app: XCUIApplication) -> XCUIElementQuery {
    app.descendants(matching: .any).matching(NSPredicate(format: "identifier ENDSWITH %@", suffix))
  }

  func sentenceCards(in app: XCUIApplication) -> XCUIElementQuery {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier MATCHES %@", #"translate\.sentence\.[^.]+"#))
  }

  func waitUntilTheSessionSays(_ status: String, in app: XCUIApplication) {
    let shown = find("translate.session.status", in: app)
    waitUntil("the session bar saying \(status)") {
      (try? shown.snapshot()).map { self.text(of: $0) } == status
    }
  }
}
