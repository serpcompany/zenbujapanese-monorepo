import XCTest

final class AccountUITests: ZenbuUITestCase {
  static let rows = [
    "account.profile", "account.sign-in", "account.media-library", "account.known-words",
    "account.lists", "account.translations", "account.reading-aids",
    "account.frequency-dictionaries", "account.support", "account.privacy-policy",
    "account.credits", "account.about",
  ]

  func testAccountListsEveryArea() {
    let app = launch()
    open(.account, in: app)
    for row in Self.rows {
      reveal(find(row, in: app), in: app)
    }
  }

  func testKnownWordsAndTheMediaLibraryStartEmptyAndListsStartWithFavorites() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.known-words", in: app), in: app))
    assertOnScreen(find("known-words.empty", in: app), in: app)
    goBack(in: app)
    tap(reveal(find("account.lists", in: app), in: app))
    waitFor(labeled("Favorites", in: app))
    goBack(in: app)
    tap(reveal(find("account.media-library", in: app), in: app))
    assertOnScreen(find("media-library.empty", in: app), in: app)
  }

  func testTheProfileKeepsANameAndShowsItOnTheCard() {
    let app = launch()
    open(.account, in: app)
    tap(find("account.profile", in: app))
    type("Ada Lovelace", into: waitFor(find("profile.name", in: app)))
    goBack(in: app)
    let card = waitFor(find("account.profile", in: app))
    let named = NSPredicate(format: "label CONTAINS 'Ada Lovelace'")
    expectation(for: named, evaluatedWith: card)
    waitForExpectations(timeout: Self.patience)
  }

  func testSignInOffersAppleGoogleAndACodeAndSaysWhenTheServiceCantBeReached() {
    let app = launch(["ZENBU_SIGN_IN_STAND_IN": "1"])
    open(.account, in: app)
    tap(find("account.sign-in", in: app))
    tap(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch)
    assertOnScreen(find("account.sign-in.message", in: app), in: app)
    tap(find("account.sign-in.google", in: app))
    assertOnScreen(find("account.sign-in.message", in: app), in: app)
    type("learner@example.com", into: waitFor(find("account.email", in: app)))
    tap(find("account.send-code", in: app))
    assertOnScreen(find("account.sign-in.message", in: app), in: app)
  }

  func testAUITestBuildWithoutTheStandInSaysAppleIsUnavailable() {
    let app = launch()
    open(.account, in: app)
    tap(find("account.sign-in", in: app))
    waitFor(find("account.sign-in.apple-unavailable", in: app))
    waitFor(find("account.sign-in.google", in: app))
  }

  func testReadingAidsAndFrequencyDictionariesOpen() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.reading-aids", in: app), in: app))
    for toggle in ["show-furigana", "show-romaji", "show-word-meanings", "show-translations"] {
      waitFor(find("reading-aids.\(toggle)", in: app))
    }
    goBack(in: app)
    tap(reveal(find("account.frequency-dictionaries", in: app), in: app))
    waitFor(find("frequency-packs.list", in: app))
    let packs = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'frequency-pack.row.'"))
    XCTAssertGreaterThanOrEqual(packs.count, 2, "JLPT Levels and YouTube come with the app")
  }

  func testTranslationsAndCreditsOpenFromAccount() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.translations", in: app), in: app))
    waitFor(labeled("No Conversations Yet", in: app))
    goBack(in: app)
    tap(reveal(find("account.credits", in: app), in: app))
    waitFor(find("credits.list", in: app))
  }
}
