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
    if device != .mac {
      let bar = waitFor(app.navigationBars["Account"])
      XCTAssertLessThan(bar.frame.height, 64, "Account has the small title the other tabs use")
    }
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
    type("ada.l", into: waitFor(find("profile.username", in: app)))
    type("not an address", into: waitFor(find("profile.email", in: app)))
    tap(find("profile.name", in: app))
    waitFor(labeled("A username is 3 to 30 letters a to z, digits, or underscores.", in: app))
    waitFor(labeled("Enter a valid email address, like name@example.com.", in: app))
    goBack(in: app)
    waitUntil(
      waitFor(find("account.profile", in: app)),
      "label CONTAINS 'Ada Lovelace' AND NOT (label CONTAINS 'ada.l')")
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
    waitForSheet("account.sign-in.google", in: app)
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
    XCTAssertGreaterThanOrEqual(packs.count, 9, "every pack in the catalog has a row")
    let downloads = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'frequency-pack.download.'"))
    XCTAssertEqual(downloads.count, 7, "Available offers each optional pack's download")
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

  func testAFrequencyDictionaryShowsItsDetailsAndTurnsOff() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.frequency-dictionaries", in: app), in: app))
    revealRowActions(on: find("frequency-pack.row.\(Self.jlpt)", in: app))
    tap(find("frequency-pack.details.\(Self.jlpt)", in: app))
    waitForSheet("frequency-pack.detail", in: app)
    tap(app.buttons["Done"].firstMatch)
    let toggle = waitFor(find("frequency-pack.toggle.\(Self.youTube)", in: app))
    XCTAssertEqual("\(toggle.value ?? "")", "1")
    flip(toggle)
    waitUntil(toggle, Self.switchedOff)
  }

  func testTurningADictionaryOffChangesAnOpenWordAndItsResultsAtOnce() {
    let app = launch()
    search("japan", in: app)
    let result = waitFor(find("result.japan", in: app))
    if device != .mac { waitUntil(result, "value CONTAINS 'YouTube frequency rank'") }
    tap(result)
    let ranked = find("word-detail.frequency.\(Self.youTube)", in: app)
    reveal(ranked, in: app)
    open(.account, in: app)
    tap(reveal(find("account.frequency-dictionaries", in: app), in: app))
    let toggle = waitFor(find("frequency-pack.toggle.\(Self.youTube)", in: app))
    flip(toggle)
    waitUntil(toggle, Self.switchedOff)
    tabItem(.search, in: app).tap()
    waitFor(find("word-detail.screen", in: app))
    waitUntilGone(ranked)
    waitFor(find("word-detail.frequency.\(Self.jlpt)", in: app))
    goBack(in: app)
    waitFor(result)
    if device != .mac {
      waitUntil(result, "value CONTAINS 'JLPT level N' AND NOT (value CONTAINS 'YouTube')")
    }
  }

  func testTurningFuriganaOffShowsTheReadingUnderTheHeadword() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.reading-aids", in: app), in: app))
    let furigana = waitFor(find("reading-aids.show-furigana", in: app))
    flip(furigana)
    waitUntil(furigana, Self.switchedOff)
    search("japan", in: app)
    tap(find("result.japan", in: app))
    waitFor(find("word-detail.identity-reading", in: app))
  }

  func testTurningRomajiOnWritesExampleSentencesAndAKanjisReadingsInRomaji() {
    let app = launch()
    open(.account, in: app)
    tap(reveal(find("account.reading-aids", in: app), in: app))
    let romaji = waitFor(find("reading-aids.show-romaji", in: app))
    flip(romaji)
    waitUntil(romaji, Self.switchedOn)
    search("japan", in: app)
    tap(find("search.examples", in: app))
    waitFor(find("example-list.screen", in: app))
    let sentence = waitFor(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier ENDSWITH '.romaji'")).firstMatch)
    waitUntil(sentence, mentions: "Romaji, ")
    goBack(in: app)
    tap(find("result.japan", in: app))
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.glyph", in: app))
    let reading = reveal(find("kanji-detail.reading.on.ジツ", in: app), in: app)
    waitUntil(reading, mentions: "Romaji, jitsu")
  }

  static let switchedOn = "value == '1' OR value == 1"
  static let switchedOff = "value == '0' OR value == 0"
  static let jlpt = "zenbu.jlpt.waller.levels"
  static let youTube = "zenbu.tubelex.youtube.ja.unidic-3.1"
}
