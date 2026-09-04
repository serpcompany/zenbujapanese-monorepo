import UIKit
import XCTest

final class PrototypeIssue293UITests: XCTestCase {
  @MainActor
  func test01AutomaticEdgeLightAX5() throws {
    let app = launch(variant: 1, appearance: .light)
    retainEvidence(app: app, name: "01-automatic-edge-light-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test02AutomaticEdgeDarkAX5() throws {
    let app = launch(variant: 1, appearance: .dark)
    retainEvidence(app: app, name: "02-automatic-edge-dark-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test03HardEdgeLightAX5() throws {
    let app = launch(variant: 2, appearance: .light)
    retainEvidence(app: app, name: "03-hard-edge-light-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test04HardEdgeDarkAX5() throws {
    let app = launch(variant: 2, appearance: .dark)
    retainEvidence(app: app, name: "04-hard-edge-dark-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test05DeliberateLowContrastLightAX5() throws {
    let app = launch(variant: 3, appearance: .light)
    retainEvidence(app: app, name: "05-deliberate-low-contrast-light-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test06DeliberateLowContrastDarkAX5() throws {
    let app = launch(variant: 3, appearance: .dark)
    retainEvidence(app: app, name: "06-deliberate-low-contrast-dark-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test07SemanticRepairLightAX5() throws {
    let app = launch(variant: 4, appearance: .light)
    retainEvidence(app: app, name: "07-semantic-repair-light-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  func test08SemanticRepairDarkAX5() throws {
    let app = launch(variant: 4, appearance: .dark)
    retainEvidence(app: app, name: "08-semantic-repair-dark-AX5")
    try app.performAccessibilityAudit(for: .contrast)
  }

  @MainActor
  private func launch(variant: Int, appearance: XCUIDevice.Appearance) -> XCUIApplication {
    let expectedIncreaseContrast =
      ProcessInfo.processInfo.environment["PROTOTYPE_EXPECT_INCREASE_CONTRAST"] == "1"
    XCTAssertEqual(
      UIAccessibility.isDarkerSystemColorsEnabled,
      expectedIncreaseContrast,
      "The UI test runner must observe the preregistered Increase Contrast state."
    )

    XCUIDevice.shared.appearance = appearance
    let app = XCUIApplication()
    app.launchArguments = [
      "-AppleLanguages", "(en)",
      "-AppleLocale", "en_US",
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      "-PrototypeVariant", String(variant),
    ]
    app.launch()
    XCTAssertTrue(app.collectionViews["prototype.screen"].waitForExistence(timeout: 5))
    XCTAssertEqual(XCUIDevice.shared.appearance, appearance)
    return app
  }

  @MainActor
  private func retainEvidence(app: XCUIApplication, name: String) {
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)

    let settings = XCTAttachment(
      string:
        "UIAccessibility.isDarkerSystemColorsEnabled=\(UIAccessibility.isDarkerSystemColorsEnabled)"
    )
    settings.name = "\(name)-public-accessibility-settings"
    settings.lifetime = .keepAlways
    add(settings)

    let elements = app.descendants(matching: .any).allElementsBoundByIndex.map { element in
      let frame = element.frame
      return [
        "type=\(element.elementType.rawValue)",
        "identifier=\(element.identifier.isEmpty ? "<unavailable>" : element.identifier)",
        "label=\(element.label.isEmpty ? "<unavailable>" : element.label)",
        "frame=\(frame.isNull || frame.isInfinite ? "<unavailable>" : NSCoder.string(for: frame))",
      ].joined(separator: " | ")
    }.joined(separator: "\n")
    let inventory = XCTAttachment(string: elements)
    inventory.name = "\(name)-accessibility-element-inventory"
    inventory.lifetime = .keepAlways
    add(inventory)
  }
}
