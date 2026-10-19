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
    try XCTSkipIf(device == .mac, "the share sheet's card is on iPhone and iPad")
    let text = share(pass, ["ZENBU_SHARE_TEXT": "猫が魚を食べました"])
    waitFor(find("share-card.text", in: text))
    waitFor(firstElement(identifiedBy: "share-card.translation", in: text))
    audit("A shared sentence's card", in: text)
    let word = share(pass, ["ZENBU_SHARE_TEXT": "駅"])
    waitFor(find("share-card.word", in: word))
    audit("A shared word's card", in: word)
    let photo = share(pass, ["ZENBU_SHARE_IMAGE": fixtures.appending(path: "horizontal-japanese.png").path])
    waitFor(find("share-card.photo", in: photo))
    waitUntil(find("share-card.text", in: photo), mentions: "駅の近くに本屋があります")
    audit("A shared photo's card", in: photo)
  }

  private func share(_ pass: AuditPass, _ item: [String: String]) -> XCUIApplication {
    launch(pass, item.merging(["ZENBU_SHARE_CARD_IN_APP": "1"]) { $1 })
  }
}
