import XCTest

final class AccountAuditUITests: AccessibilityAuditCase {
  func testAccountsScreensPassTheAuditAtTheDefaultTextSize() {
    auditAccount(.standard)
  }

  func testAccountsScreensPassTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    auditAccount(.largest)
  }

  func testAccountsScreensPassTheAuditInDarkAppearance() {
    auditAccount(.dark)
  }

  private func auditAccount(_ pass: AuditPass) {
    auditTheAccountAndItsSettings(pass)
    auditTheLearnersWords(pass)
    auditSigningIn(pass)
    if device == .mac { auditTheSettingsWindow(pass) } else { auditTheZenbuAccount(pass) }
  }

  private func auditTheAccountAndItsSettings(_ pass: AuditPass) {
    let app = launch(pass)
    open(.account, in: app)
    audit("Account", in: app)
    auditAtTheLargestSize("Account, its rows", showing: find("account.translations", in: app), in: app)
    tap(reveal(find("account.reading-aids", in: app), in: app))
    waitFor(find("reading-aids.show-furigana", in: app))
    audit("Reading Aids", in: app)
    auditAtTheLargestSize(
      "Reading Aids, its end", showing: find("reading-aids.translation-source", in: app), in: app)
    goBack(in: app)
    tap(reveal(find("account.frequency-dictionaries", in: app), in: app))
    waitFor(find("frequency-pack.row.\(AccountUITests.jlpt)", in: app))
    audit("Frequency Dictionaries", in: app)
    revealRowActions(on: find("frequency-pack.row.\(AccountUITests.jlpt)", in: app))
    tap(find("frequency-pack.details.\(AccountUITests.jlpt)", in: app))
    waitForSheet("frequency-pack.detail", in: app)
    audit("A frequency dictionary's details", in: app)
    tap(app.buttons["Done"].firstMatch)
    auditAtTheLargestSize(
      "Frequency Dictionaries, its downloads",
      showing: firstElement(identifiedBy: "frequency-pack.download.", in: app), in: app)
    goBack(in: app)
    tap(reveal(find("account.credits", in: app), in: app))
    waitFor(find("credits.list", in: app))
    audit("Credits & Attributions", in: app)
    tap(reveal(find("credits.licenses", in: app), in: app, scrolling: find("credits.list", in: app)))
    waitFor(find("licenses.text.KANJIVG-CC-BY-SA-3.0.txt", in: app))
    audit("Licenses", in: app)
    tap(find("licenses.text.KANJIVG-CC-BY-SA-3.0.txt", in: app))
    waitUntil(find("credits.license-text", in: app), mentions: "CREATIVE COMMONS PUBLIC LICENSE")
    audit("A license", in: app)
    goBack(in: app)
    waitFor(find("licenses.text.KANJIVG-CC-BY-SA-3.0.txt", in: app))
    goBack(in: app)
    waitFor(find("credits.list", in: app))
    goBack(in: app)
    reveal(find("account.about", in: app), in: app)
    audit("Account, at its end", in: app)
  }

  private func auditTheLearnersWords(_ pass: AuditPass) {
    let app = launch(pass)
    open(.account, in: app)
    tap(reveal(find("account.known-words", in: app), in: app))
    waitFor(find("known-words.empty", in: app))
    audit("Known Words, empty", in: app)
    goBack(in: app)
    tap(reveal(find("account.media-library", in: app), in: app))
    waitFor(find("media-library.empty", in: app))
    audit("Media Library, empty", in: app)
    goBack(in: app)
    markJapanKnownFromItsResult(in: app)
    open(.account, in: app)
    tap(reveal(find("account.known-words", in: app), in: app))
    waitFor(firstElement(identifiedBy: "known-words.item.", in: app))
    audit("Known Words", in: app)
    goBack(in: app)
    tap(reveal(find("account.lists", in: app), in: app))
    waitFor(firstElement(identifiedBy: "word-lists.list.", in: app))
    audit("Lists", in: app)
    tap(firstElement(identifiedBy: "word-lists.list.", in: app))
    waitFor(find("word-list.empty", in: app))
    audit("A list", in: app)
    goBack(in: app)
    goBack(in: app)
    tap(reveal(find("account.profile", in: app), in: app))
    fill("profile.name", with: "Ada Lovelace\n", in: app)
    waitUntilGone(app.keyboards.firstMatch)
    fill("profile.username", with: "ada.l\n", in: app)
    waitFor(labeled("A username is 3 to 30 letters a to z, digits, or underscores.", in: app))
    waitUntilGone(app.keyboards.firstMatch)
    audit("Profile", in: app)
  }

  private func auditSigningIn(_ pass: AuditPass) {
    let app = launch(pass)
    open(.account, in: app)
    tap(reveal(find("account.sign-in", in: app), in: app))
    waitUntilStill(waitForSheet("account.sign-in.cancel", in: app))
    audit("Sign In", in: app)
  }

  private func auditTheZenbuAccount(_ pass: AuditPass) {
    let app = launch(pass, AccountSignedInUITests.standIns)
    open(.account, in: app)
    tap(reveal(find("account.sign-in", in: app), in: app))
    tap(reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch, in: app))
    tap(find("account.zenbu-account", in: app), toShow: find("zenbu-account.email", in: app))
    audit("Zenbu Account", in: app)
    tap(find("zenbu-account.delete", in: app))
    waitFor(find("delete-account.start", in: app))
    audit("Delete Account", in: app)
  }

  private func fill(_ identifier: String, with text: String, in app: XCUIApplication) {
    let field = find(identifier, in: app)
    guard device != .mac else { return type(text, into: field) }
    waitFor(field).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: Self.inputLine)).tap()
    let focused = NSPredicate(format: "hasKeyboardFocus == true AND identifier == %@", identifier)
    waitFor(app.descendants(matching: .any).matching(focused).firstMatch)
    field.typeText(text)
  }

  private static let inputLine = 0.8

  private func auditTheSettingsWindow(_ pass: AuditPass) {
    let app = launch(pass)
    let settings = app.windows[TestDevice.settingsWindow]
    press(",", until: settings, in: app)
    waitFor(find("settings.profile", in: app))
    audit("Settings", in: app)
    settings.buttons["Reading Aids"].tap()
    waitFor(find("reading-aids.form", in: app))
    audit("Settings' Reading Aids", in: app)
    settings.buttons["Frequency Dictionaries"].tap()
    waitFor(find("frequency-packs.list", in: app))
    audit("Settings' Frequency Dictionaries", in: app)
  }
}
