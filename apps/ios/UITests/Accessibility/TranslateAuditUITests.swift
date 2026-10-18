import XCTest

final class TranslateAuditUITests: AccessibilityAuditCase {
  func testTranslatesScreensPassTheAuditAtTheDefaultTextSize() throws {
    try auditTranslate(.standard)
  }

  func testTranslatesScreensPassTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    try auditTranslate(.largest)
  }

  func testTranslatesScreensPassTheAuditInDarkAppearance() throws {
    try auditTranslate(.dark)
  }

  private func auditTranslate(_ pass: AuditPass) throws {
    auditTheHomeAndTypedText(pass)
    auditAConversationAndItsTranscript(pass)
    auditListening(pass)
    try auditImageSearch(pass)
  }

  private func auditTheHomeAndTypedText(_ pass: AuditPass) {
    let app = launch(pass, TranslateUITests.script)
    open(.translate, in: app)
    audit("Translate", in: app)
    auditAtTheLargestSize(
      "Translate, its written rows", showing: find("translate.start.document", in: app), in: app)
    tap(reveal(find("translate.start.image", in: app), in: app))
    waitFor(app.buttons["Photo Library"])
    audit("Image's sources", in: app)
    tap(app.buttons["Cancel"].firstMatch)
    tap(find("translate.history", in: app), toShow: labeled("No Conversations Yet", in: app))
    audit("Translations, empty", in: app)
    goBack(in: app)
    tap(reveal(find("translate.start.text", in: app), in: app))
    type("Where can I buy a Suica card?", into: waitFor(find("translate.typed.input", in: app)))
    waitFor(find("translate.typed.direction", in: app))
    tap(word(containing: "どこ", identifiedBy: "translate.typed.result.", in: app))
    waitForSheet("recognized-word-sheet", in: app)
    waitFor(find("word-detail.screen", in: app))
    audit("The word sheet", in: app)
    tap(find("recognized-word-sheet.done", in: app))
    waitUntilGone(app.keyboards.firstMatch)
    audit("A typed translation", in: app)
  }

  private func auditAConversationAndItsTranscript(_ pass: AuditPass) {
    let app = startLiveMode("conversation", pass)
    audit("The silence prompt", in: app)
    pauseFromTheSilencePrompt(in: app)
    audit("A paused conversation", in: app)
    tap(find("translate.conversation.options", in: app))
    tap(menuChoice("Two Panes", in: app))
    waitFor(find("translate.pane.ja", in: app))
    audit("Two Panes", in: app)
    tap(find("translate.conversation.back", in: app))
    tap(app.buttons["Save and Exit"].firstMatch)
    tap(find("translate.history", in: app), toShow: find("translate.history.row", in: app))
    audit("Translations", in: app)
    tap(find("translate.history.row", in: app), toShow: find("translate.detail", in: app))
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    audit("A saved conversation", in: app)
  }

  private func auditListening(_ pass: AuditPass) {
    let app = startLiveMode("listening", pass)
    pauseFromTheSilencePrompt(in: app)
    audit("Listening, paused", in: app)
  }

  private func auditImageSearch(_ pass: AuditPass) throws {
    let app = try openFixtureImage(pass)
    waitFor(firstElement(identifiedBy: "image-text.region.", in: app))
    audit("Image Search", in: app)
    choose("Text", in: find("image-text.mode", in: app))
    waitFor(find("image-text.reader", in: app))
    audit("Image Search's text", in: app)
    choose("Photo", in: find("image-text.mode", in: app))
    tap(firstElement(identifiedBy: "image-text.region.", in: app))
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    tap(find("word-detail.image-attachment", in: app))
    waitForSheet("word-detail.image-page", in: app)
    audit("A word's photo", in: app)
    tap(find("word-detail.image-attachment-done", in: app))
    open(.account, in: app)
    tap(reveal(find("account.media-library", in: app), in: app))
    waitFor(firstElement(identifiedBy: "media-library.item.", in: app))
    audit("Media Library", in: app)
  }

  private func startLiveMode(_ option: String, _ pass: AuditPass) -> XCUIApplication {
    let app = launch(pass, TranslateUITests.script)
    open(.translate, in: app)
    tap(reveal(find("translate.start.\(option)", in: app), in: app))
    waitFor(firstElement(identifiedBy: "translate.sentence.", in: app))
    waitFor(find("translate.still-there", in: app))
    return app
  }

  private func pauseFromTheSilencePrompt(in app: XCUIApplication) {
    tap(
      app.buttons.matching(
        NSPredicate(format: "label == 'Pause' AND identifier BEGINSWITH 'translate.still-there'")
      ).firstMatch)
    waitUntil(find("translate.session.toggle", in: app), "label == 'Resume'")
  }
}
