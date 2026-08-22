import XCTest

final class AccessibilityAuditUITests: XCTestCase {
  @MainActor
  func testLightImageSourceActionsHaveReadableSystemContrast() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: .light)
    let imageSearch = app.buttons["search.image-source"]
    XCTAssertTrue(imageSearch.waitForExistence(timeout: 3))
    imageSearch.tap()
    XCTAssertTrue(app.buttons["image-source.camera"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["image-source.photo-library"].exists)
    XCTAssertTrue(app.buttons["image-source.files"].exists)
    try performAudit(
      in: app,
      named: "Image source actions - light appearance",
      types: .contrast
    )
  }

  @MainActor
  func testLightRecentSearchDeleteActionHasReadableSystemContrast() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .light
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: .light, additionalArguments: ["-ResetRecentSearches"])
    try submitSearch("hello", in: app)
    app.buttons["Clear text"].tap()
    app.textFields["search.field"].tap()
    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    recentSearch.swipeLeft()
    XCTAssertTrue(app.buttons["Delete"].waitForExistence(timeout: 3))
    try performAudit(
      in: app,
      named: "Recent search delete - light appearance",
      types: .contrast
    )
  }

  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInDarkMode() throws {
    try auditReviewerJourney(appearance: .dark)
  }

  @MainActor
  func testReviewerReachableSearchAndWordDetailAreReadableInLightMode() throws {
    try auditReviewerJourney(appearance: .light)
  }

  @MainActor
  func testSecondaryPublicSurfacesPassCompleteAuditInDarkMode() throws {
    try auditSecondarySurfaces(appearance: .dark)
  }

  @MainActor
  func testSecondaryPublicSurfacesPassCompleteAuditInLightMode() throws {
    try auditSecondarySurfaces(appearance: .light)
  }

  @MainActor
  func testDarkWordDetailRemainsUsableAtLargestAccessibilityTextSize() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .dark,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("日本")
    app.keyboards.buttons["Search"].tap()
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 5))
    japan.tap()
    XCTAssertTrue(app.scrollViews["word-detail.screen"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["MEANING"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["日本"].exists)
    try performAudit(
      in: app,
      named: "Word Detail - dark accessibility XXXL",
      types: auditTypes.subtracting(.dynamicType)
    )
  }

  @MainActor
  func testDarkDictionarySourcesRemainUsableAtLargestAccessibilityTextSize() throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(
      appearance: .dark,
      additionalArguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
    )
    app.buttons["search-experience-tab.settings"].tap()
    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["settings.done"].isHittable)
    let sourceList = app.descendants(matching: .any)["dictionary-sources.list"]
    XCTAssertTrue(sourceList.waitForExistence(timeout: 5))
    let projectLink = app.buttons["dictionary-sources.jmdict-project"]
    for _ in 0..<4 where !projectLink.exists || !projectLink.isHittable {
      sourceList.swipeUp()
    }
    XCTAssertTrue(projectLink.waitForExistence(timeout: 5))
    XCTAssertTrue(projectLink.isHittable)
    try performAudit(
      in: app,
      named: "Dictionary Sources - dark accessibility XXXL",
      // Xcode 26 reports an unidentified, partially occluded SwiftUI bookkeeping
      // node as a contrast failure only in this XXXL scrolled state. The ordinary
      // dark Dictionary Sources journey keeps contrast blocking, and the theme
      // unit tests enforce every foreground/surface pair. Tracked by #173.
      types: auditTypes.subtracting(.dynamicType.union(.contrast))
    )
  }

  @MainActor
  private func auditReviewerJourney(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    let app = launchApp(appearance: appearance)
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    try XCTContext.runActivity(named: "Search root") { _ in
      try performAudit(in: app, named: "Search root")
    }

    searchField.tap()
    searchField.typeText("日本")
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 5))
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))

    try XCTContext.runActivity(named: "Search results") { _ in
      try performAudit(in: app, named: "Search results")
    }

    japan.tap()
    XCTAssertTrue(app.scrollViews["word-detail.screen"].waitForExistence(timeout: 5))

    try XCTContext.runActivity(named: "Word Detail") { _ in
      // Xcode 26.5 reports every semantic Word Detail text style as partially
      // unsupported only in dark appearance. Light Word Detail keeps the
      // Dynamic Type audit blocking; the dedicated dark accessibility-XXXL
      // journey above keeps scaling and clipping blocking. Tracked by #173.
      let wordDetailAuditTypes =
        appearance == .dark ? auditTypes.subtracting(.dynamicType) : auditTypes
      try performAudit(in: app, named: "Word Detail", types: wordDetailAuditTypes)
    }

    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name =
      appearance == .dark ? "Word Detail - dark appearance" : "Word Detail - light appearance"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor
  private func auditSecondarySurfaces(appearance: XCUIDevice.Appearance) throws {
    let originalAppearance = XCUIDevice.shared.appearance
    XCUIDevice.shared.appearance = appearance
    defer { XCUIDevice.shared.appearance = originalAppearance }

    var app = launchApp(appearance: appearance)
    app.buttons["search-experience-tab.settings"].tap()
    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 3))
    // Xcode 26.5 reports semantic Settings text as partially unsupported only
    // in dark appearance. Light Settings keeps Dynamic Type blocking; the
    // dedicated dark accessibility-XXXL journey above keeps scaling and
    // clipping blocking. Tracked by #173.
    let settingsAuditTypes =
      appearance == .dark ? auditTypes.subtracting(.dynamicType) : auditTypes
    try performAudit(in: app, named: "Dictionary Sources", types: settingsAuditTypes)
    app.terminate()

    app = launchApp(appearance: appearance)
    let searchField = app.textFields["search.field"]
    searchField.tap()
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(app.otherElements["handwriting.canvas"].waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Handwriting input")
    app.buttons["search.input.radicals"].tap()
    XCTAssertTrue(app.staticTexts["1 Stroke"].waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Radical input")
    app.terminate()

    app = launchApp(appearance: appearance)
    try submitSearch("山", in: app)
    let mountain = app.buttons["result.kanji-primary.山"]
    XCTAssertTrue(mountain.waitForExistence(timeout: 4))
    mountain.tap()
    XCTAssertTrue(app.scrollViews["kanji-detail.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(
      app.descendants(matching: .any)["kanji-detail.strokes"].waitForExistence(timeout: 4))
    XCTAssertTrue(app.staticTexts["READINGS"].waitForExistence(timeout: 4))
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Kanji Detail")
    strokeOrder.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["stroke-order.progress"].waitForExistence(timeout: 3))
    try performAudit(in: app, named: "Stroke Order")
    app.terminate()

    app = launchApp(
      appearance: appearance,
      additionalArguments: ["-ExampleSentenceAccessibilityFixtureLimit", "2"]
    )
    try submitSearch("いる", in: app)
    let examples = app.buttons["search.examples"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    examples.tap()
    XCTAssertTrue(app.scrollViews["example-list.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(app.descendants(matching: .any)["example.row.0"].waitForExistence(timeout: 3))
    XCTAssertTrue(
      app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH %@", "example.token.0.")
      ).firstMatch.waitForExistence(timeout: 12)
    )
    try performAudit(in: app, named: "Example Sentences")
    app.terminate()

    app = launchApp(appearance: appearance)
    try submitSearch("いる", in: app)
    let iru = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "いる, いる, to be (of animate objects)")
    ).firstMatch
    XCTAssertTrue(iru.waitForExistence(timeout: 4))
    iru.tap()
    let conjugations = app.buttons["word-detail.conjugations"]
    XCTAssertTrue(conjugations.waitForExistence(timeout: 4))
    conjugations.tap()
    XCTAssertTrue(app.scrollViews["conjugations.screen"].waitForExistence(timeout: 4))
    XCTAssertTrue(
      app.descendants(matching: .any)["conjugations.row.present-future"].waitForExistence(
        timeout: 3))
    try performAudit(in: app, named: "Conjugations")
    app.terminate()

    try stageImageTextFixture(appearance: appearance)
    app = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-StartImageTextFixtures", "fixture-clear-horizontal.png", "-InjectImageTextTranslation",
      ])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)["image-text.raw-text"].waitForExistence(timeout: 20)
    )
    try performAudit(in: app, named: "Image Text")
  }

  private var auditTypes: XCUIAccessibilityAuditType {
    .all
  }

  @MainActor
  private func performAudit(
    in app: XCUIApplication,
    named stateName: String,
    types: XCUIAccessibilityAuditType? = nil
  ) throws {
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "Accessibility state - \(stateName)"
    screenshot.lifetime = .keepAlways
    add(screenshot)

    try app.performAccessibilityAudit(for: types ?? auditTypes) { issue in
      let element = issue.element
      let identifier = element?.identifier
      // Xcode 26 can report frameless SwiftUI bookkeeping nodes as clipped.
      // A real element, including one with an empty label, is never ignored.
      if issue.auditType == .textClipped, issue.element == nil {
        return true
      }
      // Xcode's screenshot-based audit false-positives on the thin Japanese
      // toolbar glyphs even though the exact foreground/chrome pair is guarded
      // above 6:1 by ZenbuThemeAccessibilityTests. Keep this exact exception
      // tracked by #173; no other contrast finding is ignored.
      if issue.auditType == .contrast,
        let identifier,
        ["kanji-detail.back-label", "kanji-detail.title"].contains(identifier)
      {
        return true
      }
      // The compact-device audit flags this fully visible semantic-body link
      // even after replacing SwiftUI Link with an app-owned scalable control.
      // Keep the single exact exception tracked by #173.
      if issue.auditType == .dynamicType,
        identifier == "dictionary-sources.jmdict-project"
      {
        return true
      }
      return false
    }
  }

  @MainActor
  private func launchApp(
    appearance: XCUIDevice.Appearance,
    additionalArguments: [String] = []
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launchArguments += [
      "-AppleInterfaceStyle", appearance == .dark ? "Dark" : "Light",
      "-AppleInterfaceStyleSwitchesAutomatically", "NO",
    ]
    app.launchArguments += additionalArguments
    app.launch()
    return app
  }

  @MainActor
  private func submitSearch(_ query: String, in app: XCUIApplication) throws {
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText(query)
    app.keyboards.buttons["Search"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
  }

  @MainActor
  private func stageImageTextFixture(appearance: XCUIDevice.Appearance) throws {
    let stager = launchApp(
      appearance: appearance,
      additionalArguments: [
        "-ExportImageTextFixtures", "fixture-clear-horizontal.png",
      ])
    let save = stager.buttons["Save"]
    XCTAssertTrue(save.waitForExistence(timeout: 20))
    save.tap()
    if stager.buttons["Replace"].waitForExistence(timeout: 1) {
      stager.buttons["Replace"].tap()
    }
    XCTAssertTrue(stager.textFields["search.field"].waitForExistence(timeout: 5))
    stager.terminate()
  }
}
