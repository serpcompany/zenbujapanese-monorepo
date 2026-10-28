import XCTest

final class AccountAuditUITests: AccessibilityAuditCase {
  func testAccountsScreensPassTheAuditAtTheDefaultTextSize() throws {
    try auditAccount(.standard)
  }

  func testAccountsScreensPassTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    try auditAccount(.largest)
  }

  func testAccountsScreensPassTheAuditInDarkAppearance() throws {
    try auditAccount(.dark)
  }

  private func auditAccount(_ pass: AuditPass) throws {
    auditTheAccountAndItsSettings(pass)
    auditProgress(pass)
    auditReportingAProblem(pass)
    auditTheLearnersWords(pass)
    auditSigningIn(pass)
    guard device != .mac else { return auditTheSettingsWindow(pass) }
    auditTheZenbuAccount(pass)
    try auditPhotosTheAccountCantKeep(pass)
    auditSubscribing(pass)
    for (state, held) in Self.subscriptions { auditASubscription(state, held, pass) }
    auditDeletingWithAnAppStoreSubscription(pass)
  }

  private func auditTheAccountAndItsSettings(_ pass: AuditPass) {
    let app = launch(pass)
    open(.account, in: app)
    audit("Account", in: app)
    openAccountRow("account.daily-goal", showing: find("daily-goal.cancel", in: app), in: app)
    waitUntilStill(waitForSheet("daily-goal.sheet", in: app))
    audit("Daily Goal", in: app)
    tap(find("daily-goal.cancel", in: app))
    waitUntilGone(find("daily-goal.sheet", in: app))
    auditAtTheLargestSize(
      "Account, its rows", showing: find("account.translations", in: app), in: app, .allButTextSizes)
    openAccountRow("account.reading-aids", showing: find("reading-aids.show-furigana", in: app), in: app)
    audit("Reading Aids", in: app)
    auditAtTheLargestSize(
      "Reading Aids, its end", showing: find("reading-aids.translation-source", in: app), in: app)
    goBack(in: app)
    let jlpt = find("frequency-pack.row.\(AccountUITests.jlpt)", in: app)
    openAccountRow("account.frequency-dictionaries", showing: jlpt, in: app)
    audit("Frequency Dictionaries", in: app)
    revealRowActions(on: jlpt)
    tap(find("frequency-pack.details.\(AccountUITests.jlpt)", in: app))
    waitForSheet("frequency-pack.detail", in: app)
    audit("A frequency dictionary's details", in: app)
    tap(app.buttons["Done"].firstMatch)
    auditAtTheLargestSize(
      "Frequency Dictionaries, its downloads",
      showing: firstElement(identifiedBy: "frequency-pack.download.", in: app), in: app)
    goBack(in: app)
    auditAtTheLargestSize(
      "Account, Send Crash Reports", showing: find("account.send-crash-reports", in: app), in: app,
      .allButTextSizes)
    openAccountRow("account.credits", showing: find("credits.list", in: app), in: app)
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
    reveal(find("account.credits", in: app), in: app)
    audit("Account, at its end", in: app, .allButTextSizes)
    if pass.size == .largest {
      auditAlone("Account's progress section, alone", "progress", showing: "account.progress.today", pass)
      auditAlone("Account's library rows, alone", "library", showing: "account.learning", pass)
      auditAlone("Account's collection rows, alone", "collections", showing: "account.translations", pass)
      auditAlone("Account's settings rows, alone", "settings", showing: "account.frequency-dictionaries", pass)
    }
    auditAlone("Account, its about rows", "about", showing: "account.about", pass)
  }

  private func auditProgress(_ pass: AuditPass) {
    let app = launch(pass, progressSeed)
    open(.account, in: app)
    openAccountRow("account.progress", showing: find("progress.today", in: app), in: app)
    audit("Progress", in: app)
    auditAtTheLargestSize("Progress, its tiles", showing: find("progress.daily-average", in: app), in: app)
    let chart = find("progress.new-words.chart", in: app)
    audit("Progress, a week of new words", placing: chart, in: app)
    tap(reveal(app.segmentedControls["progress.span"].buttons["Month"], in: app))
    audit("Progress, a month of new words", placing: chart, in: app)
    auditAtTheLargestSize("Progress, JLPT coverage", showing: find("progress.jlpt.n1", in: app), in: app)
    audit("Progress, its end", placing: find("progress.known-over-time.chart", in: app), in: app)
  }

  private func auditAlone(_ screen: String, _ section: String, showing identifier: String, _ pass: AuditPass) {
    guard runsTextSizeAudits(on: screen) else { return }
    let app = launch(pass, ["ZENBU_ONLY_SECTION": "account.\(section)"])
    tap(tabItem(.account, in: app))
    waitFor(find(identifier, in: app))
    audit(screen, in: app, .textSizes)
  }

  private func openAccountRow(_ identifier: String, showing shown: XCUIElement, in app: XCUIApplication) {
    tapClearOfTheBars(find(identifier, in: app), toShow: shown, in: app)
  }

  private func auditTheLearnersWords(_ pass: AuditPass) {
    let app = launch(pass)
    open(.account, in: app)
    openAccountRow("account.known-words", showing: find("known-words.empty", in: app), in: app)
    audit("Known Words, empty", in: app)
    goBack(in: app)
    openAccountRow("account.learning", showing: find("learning.empty", in: app), in: app)
    audit("Learning, empty", in: app)
    goBack(in: app)
    openAccountRow("account.media-library", showing: find("media-library.empty", in: app), in: app)
    audit("Media Library, empty", in: app)
    goBack(in: app)
    markJapanKnownFromItsResult(in: app)
    tap(tabItem(.account, in: app))
    openAccountRow("account.known-words", showing: find("result.japan", in: app), in: app)
    audit("Known Words", in: app)
    goBack(in: app)
    let list = firstElement(identifiedBy: "word-lists.list.", in: app)
    openAccountRow("account.lists", showing: list, in: app)
    audit("Lists", in: app)
    tap(list)
    waitFor(find("word-list.empty", in: app))
    audit("A list", in: app)
    goBack(in: app)
    goBack(in: app)
    openAccountRow("account.profile", showing: find("profile.name", in: app), in: app)
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
    openAccountRow("account.sign-in", showing: find("account.sign-in.cancel", in: app), in: app)
    waitUntilStill(waitForSheet("account.sign-in.cancel", in: app))
    audit("Sign In", in: app)
  }

  private func auditReportingAProblem(_ pass: AuditPass) {
    let app = launch(pass, Self.problemReportStandIn)
    let send = openTheReport(in: app)
    if pass.size != .largest { waitFor(labeled("Permissions", in: app)) }
    audit("Report a Problem", in: app)
    type("Search froze", into: find("problem-report.description", in: app))
    type("pat@", into: reveal(find("problem-report.email", in: app), in: app))
    waitFor(find("problem-report.invalid-email", in: app))
    audit("Report a Problem, an email that isn't an address", in: app)
    typeAtTheEnd("example.com", of: reveal(find("problem-report.email", in: app), in: app), in: app)
    if pass.size == .largest {
      reveal(labeled("Permissions", in: app), in: app)
      audit("Report a Problem, its details", in: app)
    }
    tap(send)
    waitFor(labeled("Report Sent", in: app))
    audit("Report a Problem, sent", in: app)
  }

  private func auditTheZenbuAccount(_ pass: AuditPass) {
    let app = launch(pass, Self.signedIn(AccountSignedInUITests.keptOnAnotherDevice))
    signInWithApple(in: app)
    let photo = firstElement(identifiedBy: "media-library.item.", in: app)
    openAccountRow("account.media-library", showing: photo, in: app)
    waitUntil(photo, mentions: "猫")
    audit("Media Library, with a photo from the account", in: app)
    goBack(in: app)
    let email = find("profile.account-email", in: app)
    openAccountRow("account.profile", showing: email, in: app)
    waitUntil(email, mentions: "learner@example.com")
    audit("Profile, signed in", in: app)
    goBack(in: app)
    tap(find("account.zenbu-account", in: app), toShow: find("zenbu-account.email", in: app))
    audit("Zenbu Account", in: app)
    tap(reveal(find("zenbu-account.delete", in: app), in: app))
    waitUntilStill(waitForSheet("delete-account.cancel", in: app))
    audit("Delete Account", in: app)
  }

  private static let subscriptions: [(state: String, held: [String: String])] = [
    ("a website subscription", ["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "stripe"]),
    ("both stores", ["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple,stripe"]),
    (
      "a payment retried",
      ["ZENBU_ACCOUNT_STAND_IN_PAYWALL": "1", "ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple:billing_retry"]
    ),
    (
      "a first payment pending",
      ["ZENBU_ACCOUNT_STAND_IN_PAYWALL": "1", "ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "stripe:pending"]
    ),
  ]

  private func openTheZenbuAccount(
    _ pass: AuditPass, _ environment: [String: String]
  ) -> XCUIApplication {
    let app = launch(pass, environment)
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app), toShow: find("zenbu-account.email", in: app))
    return app
  }

  private func auditASubscription(_ state: String, _ held: [String: String], _ pass: AuditPass) {
    let app = openTheZenbuAccount(pass, SubscriptionUITests.standIns(held))
    auditTheZenbuAccount(state, showing: find("subscription.status", in: app), in: app)
  }

  private func auditTheZenbuAccount(
    _ state: String, showing element: XCUIElement, in app: XCUIApplication
  ) {
    waitFor(element)
    audit("Zenbu Account, \(state)", in: app)
    auditAtTheLargestSize(
      "Zenbu Account, \(state), its subscription", showing: element, in: app, .allButTextSizes)
  }

  private func auditSubscribing(_ pass: AuditPass) {
    let app = openTheZenbuAccount(
      pass, SubscriptionUITests.standIns(["ZENBU_ACCOUNT_STAND_IN_PAYWALL": "1"]))
    let subscribe = find("subscription.subscribe", in: app)
    auditTheZenbuAccount("no subscription", showing: subscribe, in: app)
    tap(reveal(subscribe, in: app))
    waitUntilStill(waitForSheet("paywall.close", in: app))
    let plan = find(SubscriptionUITests.monthly, in: app)
    guard pass.size == .largest else {
      waitFor(plan)
      return audit("Subscribe", in: app)
    }
    audit("Subscribe", in: app)
    audit("Subscribe, its plans", placing: plan, in: app, .allButTextSizes)
    audit("Subscribe, its end", placing: find("paywall.restore", in: app), in: app, .allButTextSizes)
  }

  private func auditDeletingWithAnAppStoreSubscription(_ pass: AuditPass) {
    let app = openTheZenbuAccount(
      pass, SubscriptionUITests.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple"]))
    let status = find("subscription.status", in: app)
    auditTheZenbuAccount("an App Store subscription", showing: status, in: app)
    tap(reveal(find("zenbu-account.delete", in: app), in: app))
    waitUntilStill(waitForSheet("delete-account.cancel", in: app))
    let note = find("delete-account.app-store-subscription", in: app)
    audit("Delete Account, with an App Store subscription", in: app)
    waitUntil(reveal(note, in: app), mentions: "doesn't cancel your App Store subscription")
    auditAtTheLargestSize(
      "Delete Account, its App Store subscription", showing: note, in: app, .allButTextSizes)
    deleteSigningInWithApple(in: app)
    waitUntil(reveal(note, in: app), mentions: "Apple keeps billing for it until you cancel it")
    guard pass.size == .largest else { return audit("Deleted, with an App Store subscription", in: app) }
    let deleted = find("delete-account.done-note", in: app)
    audit("Deleted, with an App Store subscription", placing: deleted, in: app, .allButTextSizes)
    audit("Deleted, its App Store subscription", placing: note, in: app, .allButTextSizes)
  }

  private func auditPhotosTheAccountCantKeep(_ pass: AuditPass) throws {
    let notes = [
      ("too_many_photos", "a photo refused as too many", "Your Zenbu account holds as many photos"),
      ("photos_unavailable", "photos waiting for storage", "Photos wait to sync"),
    ]
    for (refusal, state, note) in notes {
      let app = try openFixtureImage(pass, Self.signedIn(["ZENBU_ACCOUNT_STAND_IN_REFUSES": refusal]))
      saveThePhotoOnAWord(in: app)
      signInWithApple(in: app)
      tap(find("account.zenbu-account", in: app), toShow: find("zenbu-account.email", in: app))
      waitFor(
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", note)).firstMatch)
      audit("Zenbu Account, \(state)", in: app)
    }
  }

  private static func signedIn(_ more: [String: String]) -> [String: String] {
    AccountSignedInUITests.standIns.merging(more) { $1 }
  }

  private func fill(_ identifier: String, with text: String, in app: XCUIApplication) {
    let field = find(identifier, in: app)
    guard device != .mac else { return type(text, into: field) }
    waitFor(field)
    gesture(on: field) { field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: Self.inputLine)).tap() }
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
