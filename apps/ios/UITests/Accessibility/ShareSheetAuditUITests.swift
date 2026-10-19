import XCTest

final class ShareSheetAuditUITests: AccessibilityAuditCase {
  func testTheShareSheetsCardPassesTheAuditAtTheDefaultTextSize() throws {
    try auditTheCard(.standard)
  }

  func testTheShareSheetsCardPassesTheAuditAtTheLargestTextSize() throws {
    try skipWithoutTextSizes()
    try auditTheCard(.largest)
  }

  func testTheShareSheetsCardPassesTheAuditInDarkAppearance() throws {
    try auditTheCard(.dark)
  }

  private func auditTheCard(_ pass: AuditPass) throws {
    try skipWithoutTheShareCard()
    let text = share(pass, ["ZENBU_SHARE_TEXT": "猫が魚を食べました"])
    waitFor(find("share-card.text", in: text))
    waitFor(firstElement(identifiedBy: "share-card.translation", in: text))
    let taberu = text.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'result.' AND label BEGINSWITH '食べる'"))
      .firstMatch
    waitFor(taberu)
    audit("A shared sentence's card", in: text)
    tap(taberu)
    waitFor(find("share-card.word", in: text))
    audit("A shared word's card", in: text)
    let photo = share(pass, ["ZENBU_SHARE_IMAGE": fixtures.appending(path: "horizontal-japanese.png").path])
    waitUntil(find("share-card.text", in: photo), mentions: "駅の近くに本屋があります")
    waitFor(firstElement(identifiedBy: "result.", in: photo))
    audit("A shared photo's card", in: photo)
  }

  private func share(_ pass: AuditPass, _ item: [String: String]) -> XCUIApplication {
    let app = launch(pass, item)
    chooseZenbuInTheShareSheet(in: app)
    return app
  }
}
