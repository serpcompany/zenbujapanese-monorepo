import UIKit
import XCTest

final class DefaultContrastControlUITests: XCTestCase {
  @MainActor func test01SearchLight() throws { try audit("search", appearance: .light) }
  @MainActor func test02SearchDark() throws { try audit("search", appearance: .dark) }
  @MainActor func test03DetailLight() throws { try audit("detail", appearance: .light) }
  @MainActor func test04DetailDark() throws { try audit("detail", appearance: .dark) }
  @MainActor func test05DeliberateDefect() throws { try audit("defect", appearance: .light) }
  @MainActor func test06SemanticRepair() throws { try audit("repair", appearance: .light) }
  @MainActor func test07SearchIncreaseContrast() throws {
    try audit("search", appearance: .light, increaseContrast: true)
  }
  @MainActor func test08DetailIncreaseContrast() throws {
    try audit("detail", appearance: .light, increaseContrast: true)
  }

  @MainActor
  private func audit(
    _ fixture: String, appearance: XCUIDevice.Appearance, increaseContrast: Bool = false
  ) throws {
    XCUIDevice.shared.appearance = appearance
    let app = XCUIApplication()
    app.launchArguments = [
      "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
      "-DefaultContrastControl", fixture,
    ]
    app.launch()
    let list = app.collectionViews["default-control.list"]
    XCTAssertTrue(list.waitForExistence(timeout: 5))
    let receipt = list.value as? String ?? "missing"
    XCTAssertTrue(receipt.contains("size=large"), receipt)
    XCTAssertTrue(
      receipt.contains(appearance == .dark ? "appearance=dark" : "appearance=light"), receipt)
    XCTAssertTrue(receipt.contains("increaseContrast=\(increaseContrast)"), receipt)
    XCTAssertTrue(receipt.contains("bold=false"), receipt)
    XCTAssertTrue(receipt.contains("reduceTransparency=false"), receipt)
    XCTAssertFalse(app.keyboards.firstMatch.exists)
    let labels =
      fixture == "detail"
      ? ["Noun", "ALTERNATIVES", "MEANING", "KANJI", "NOTES", "Add Note"]
      : ["Best Matches", "Additional Matches"]
    let top = app.navigationBars.firstMatch.frame.maxY
    let bottom = app.tabBars.firstMatch.frame.minY
    for label in labels {
      let text = app.staticTexts[label]
      XCTAssertTrue(text.exists, label)
      XCTAssertGreaterThanOrEqual(text.frame.minY, top, label)
      XCTAssertLessThanOrEqual(text.frame.maxY, bottom, label)
    }
    if fixture != "detail" {
      let row = app.buttons["default-control.rank-row"]
      XCTAssertTrue(row.exists)
      XCTAssertGreaterThanOrEqual(row.frame.minY, top)
      XCTAssertLessThanOrEqual(row.frame.maxY, bottom)
    }
    if fixture == "defect" || fixture == "repair" {
      let control = app.staticTexts["default-control.sensitivity"]
      XCTAssertGreaterThanOrEqual(control.frame.minY, top)
      XCTAssertLessThanOrEqual(control.frame.maxY, bottom)
    }
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "\(fixture)-\(appearance)-default"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    let inventory = app.descendants(matching: .any).allElementsBoundByIndex.map {
      "\($0.identifier) | \($0.label) | \(NSCoder.string(for: $0.frame))"
    }.joined(separator: "\n")
    let state = XCTAttachment(string: receipt + "\n" + inventory)
    state.name = "\(fixture)-\(appearance)-state"
    state.lifetime = .keepAlways
    add(state)
    try app.performAccessibilityAudit(for: .contrast)
    app.terminate()
  }
}
