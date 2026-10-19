import XCTest

final class AccountSignedInUITests: ZenbuUITestCase {
  static let standIns = [
    "ZENBU_SIGN_IN_STAND_IN": "1", "ZENBU_ACCOUNT_STAND_IN": "1",
    "ZENBU_ACCOUNT_API_URL": "https://account.stand-in.test",
  ]

  override func setUpWithError() throws {
    try XCTSkipIf(
      device == .mac,
      "a Mac build signed to run locally has no keychain access group, so it can't keep a session")
  }

  func testSigningInWithAppleShowsTheZenbuAccountAndSyncs() {
    let app = launch(Self.standIns)
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    let email = waitFor(find("zenbu-account.email", in: app))
    XCTAssertTrue(email.label.contains("learner@example.com"), email.label)
    tap(find("zenbu-account.sync-now", in: app))
    assertOnScreen(find("zenbu-account.last-synced", in: app), in: app)
    app.terminate()
    app.launchEnvironment["ZENBU_UI_TEST_FRESH"] = "0"
    app.launch()
    open(.account, in: app)
    waitFor(find("account.zenbu-account", in: app))
  }

  func testSigningOutAsksFirstAndKeepsTheLearnersWords() {
    let app = launch(Self.standIns)
    markJapanKnownFromItsResult(in: app)
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    tap(find("zenbu-account.sign-out", in: app))
    tap(
      app.buttons
        .matching(NSPredicate(format: "label == 'Sign Out' AND identifier != 'zenbu-account.sign-out'"))
        .firstMatch)
    waitFor(find("account.sign-in", in: app))
    tap(find("account.known-words", in: app))
    waitFor(firstElement(identifiedBy: "known-words.item.", in: app))
  }

  func testDeletingTheAccountSignsInAgainThenLeavesTheAppSignedOut() {
    let app = launch(Self.standIns)
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    tap(find("zenbu-account.delete", in: app))
    waitFor(
      app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Deleting your Zenbu account'"))
        .firstMatch)
    tap(find("delete-account.start", in: app))
    tap(find("delete-account.confirm", in: app))
    tap(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch)
    waitFor(find("delete-account.done-note", in: app))
    tap(find("delete-account.done", in: app))
    waitFor(find("account.sign-in", in: app))
  }

  func testSigningInFillsTheProfileFromTheAccountAndKeepsItsName() {
    let app = launch(Self.standIns)
    signInWithApple(in: app)
    let card = waitFor(find("account.profile", in: app))
    waitUntil(card, "label CONTAINS 'Kana Fan' AND label CONTAINS '@kana_fan'")
    tap(card)
    let name = waitFor(find("profile.name", in: app))
    waitUntil(name, "value == 'Kana Fan'")
    waitUntil(waitFor(find("profile.username", in: app)), "value == 'kana_fan'")
    waitUntil(waitFor(find("profile.account-email", in: app)), mentions: "learner@example.com")
    XCTAssertFalse(find("profile.email", in: app).exists, "the account's email can't be edited")
    waitFor(
      labeled(
        "A username is 3 to 30 letters a to z, digits, or underscores. Your name and username sync"
          + " with your Zenbu account. Your photo stays on this device.", in: app))

    focus(name)
    TestDevice.selectAllText(in: name)
    name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 16))
    tap(find("profile.username", in: app))
    waitFor(
      labeled(
        "Your Zenbu account needs a name of 1 to 100 characters, with no control characters.",
        in: app))
    waitUntil(name, "value == 'Kana Fan'")
    goBack(in: app)
    waitUntil(waitFor(find("account.profile", in: app)), "label CONTAINS 'Kana Fan'")
  }

  private func signInWithApple(in app: XCUIApplication) {
    open(.account, in: app)
    tap(find("account.sign-in", in: app))
    tap(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch)
    waitFor(find("account.zenbu-account", in: app))
  }
}
