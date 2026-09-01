import XCTest

// PROTOTYPE evidence only for #234. It launches the DEBUG-only harness and is
// removed together with PROTOTYPEIssue234TextKitRubyLinks.swift.
final class PROTOTYPEIssue234UITests: XCTestCase {
  @MainActor
  func testTextKitPublishesTheRequiredRichLinkLabel() throws {
    let app = launchPrototype()
    let firstEnglish = app.staticTexts["Do you want it?"]
    XCTAssertTrue(firstEnglish.waitForExistence(timeout: 20), app.debugDescription)

    let expected = "持, じ, draw (in go, poetry contest, etc.), tie"
    let candidate = app.textViews["prototype.234.textkit.2"]
    XCTAssertTrue(candidate.exists)
    let links = candidate.descendants(matching: .link).allElementsBoundByIndex

    let hierarchy = XCTAttachment(string: app.debugDescription)
    hierarchy.name = "PROTOTYPE #234 default TextKit accessibility hierarchy"
    hierarchy.lifetime = .keepAlways
    add(hierarchy)
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "PROTOTYPE #234 default TextKit ruby links"
    screenshot.lifetime = .keepAlways
    add(screenshot)

    XCTAssertFalse(links.isEmpty, "UITextView did not publicly expose native link ranges")
    XCTAssertTrue(
      links.contains { $0.label == expected },
      "Expected exact rich link label; public links were: \(links.map(\.label))"
    )
    XCTAssertFalse(
      links.contains { $0.label == "持" },
      "The public link collapsed to its surface instead of surface, reading, summary"
    )
  }

  @MainActor
  private func launchPrototype() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += [
      "-AppleLanguages", "(en)",
      "-AppleLocale", "en_US",
      "-PROTOTYPEIssue234TextKitRubyLinks",
      "-RecordSpeechRequests",
    ]
    app.launch()
    return app
  }
}
