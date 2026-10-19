import XCTest

final class ShareSheetUITests: ZenbuUITestCase {
  private let taberu = "ruby.食べる.食=た|べる"

  private func shareToZenbu(_ environment: [String: String]) throws -> XCUIApplication {
    try XCTSkipIf(device == .mac, "the share sheet's card is on iPhone and iPad")
    let app = launch(environment)
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "label == 'Zenbu Japanese' AND NOT identifier BEGINSWITH 'share-card'"))
        .firstMatch)
    return app
  }

  private func sharingText(_ text: String) throws -> XCUIApplication {
    try shareToZenbu(["ZENBU_SHARE_TEXT": text])
  }

  private func closeTheCard(in app: XCUIApplication) {
    tap(find("share-card.done", in: app))
    waitUntilGone(find("share-card.done", in: app))
  }

  func testAWordsFormShowsItsCardAndSavesItToAListInTheApp() throws {
    let app = try sharingText("食べた")
    waitFor(find("share-card.word", in: app))
    waitFor(find(taberu, in: app))
    tap(find("share-card.add-to-list", in: app))
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'word-list-picker.list.' AND label CONTAINS 'Favorites'"))
        .firstMatch)
    tap(find("word-list-picker.done", in: app))
    closeTheCard(in: app)

    openTaberu(in: app)
    reveal(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'word-detail.list.' AND label CONTAINS 'Favorites'"))
        .firstMatch, in: app)
  }

  func testASentenceListsItsWordsAndEachOpensItsCard() throws {
    let app = try sharingText("猫が魚を食べました")
    waitFor(find("share-card.text", in: app))
    waitFor(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'share-card.translation'"))
        .firstMatch)
    let words = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'result.'"))
    tap(words.matching(NSPredicate(format: "label BEGINSWITH '食べる'")).firstMatch)
    waitFor(find("share-card.word", in: app))
    waitFor(find(taberu, in: app))
    closeTheCard(in: app)
  }

  func testAPhotoShowsTheJapaneseFoundInItAndItsWords() throws {
    let photo = fixtures.appending(path: "horizontal-japanese.png").path
    let app = try shareToZenbu(["ZENBU_SHARE_IMAGE": photo])
    waitFor(find("share-card.photo", in: app))
    waitUntil(find("share-card.text", in: app), mentions: "駅の近くに本屋があります")
    waitFor(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'result.' AND label BEGINSWITH '本屋'"))
        .firstMatch)
    closeTheCard(in: app)
  }
}
