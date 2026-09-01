import XCTest

final class SearchExperienceJourneyUITests: XCTestCase {
  @MainActor
  func testMoreUtilitiesUseNativeListsAndEmptyPresentation() throws {
    let app = launchApp(additionalArguments: ["-ResetWordImageAttachments"])

    app.tabBars.buttons["More"].tap()
    XCTAssertTrue(app.collectionViews["more.list"].waitForExistence(timeout: 3))

    let mediaLibrary = app.buttons["more.media-library"]
    XCTAssertTrue(mediaLibrary.exists)
    XCTAssertTrue(mediaLibrary.isHittable)
    mediaLibrary.tap()

    let emptyState = app.descendants(matching: .any)["media-library.empty"]
    XCTAssertTrue(emptyState.waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["No Encounter Media"].exists)
    XCTAssertTrue(
      app.staticTexts["Images saved with words from Image Text will appear here."].exists)
  }

  @MainActor
  func testSearchChromeKeepsImageSearchOutsideTheFieldAndMovesSourcesToMore() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    let imageSearch = app.buttons["search.image-source"]
    XCTAssertTrue(imageSearch.exists)
    XCTAssertGreaterThanOrEqual(imageSearch.frame.minX, searchField.frame.maxX)
    XCTAssertFalse(app.buttons["search.sources"].exists)
    recordSettledScreenshot(named: "issue-216-after-search", app: app)

    app.tabBars.buttons["More"].tap()
    XCTAssertTrue(app.staticTexts["More"].waitForExistence(timeout: 2))
    recordSettledScreenshot(named: "issue-216-after-more", app: app)
    XCTAssertEqual(app.buttons["more.media-library"].label, "Media Library")
    XCTAssertEqual(app.buttons["more.credits"].label, "Credits & Attributions")
    app.buttons["more.credits"].tap()
    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["JMdict"].exists)
  }

  @MainActor
  func testBottomNavigationContainsOnlyReleaseDestinationsAndRestoresSearch() throws {
    let app = launchApp()

    for tab in ["Search", "More"] {
      let button = app.tabBars.buttons[tab]
      XCTAssertTrue(button.waitForExistence(timeout: 3))
      XCTAssertGreaterThanOrEqual(button.frame.height, 44)
      XCTAssertLessThanOrEqual(button.frame.maxY, app.windows.firstMatch.frame.maxY)
    }

    XCTAssertFalse(app.tabBars.buttons["Clippings"].exists)
    XCTAssertFalse(app.tabBars.buttons["Flashcards"].exists)

    let searchField = app.textFields["search.field"]
    searchField.tap()
    searchField.typeText("日本")
    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 3))
    japan.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))

    app.tabBars.buttons["Search"].tap()
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    XCTAssertFalse(app.collectionViews["word-detail.screen"].exists)
    recordSettledScreenshot(named: "acceptance-search-tab-restored", app: app)
  }

  @MainActor
  func testImageTextFilesSourceOpensThePublicMultipleSelectionPicker() throws {
    #if DEBUG
      stageImageTextFixtures(["fixture-clear-horizontal.png"])
    #endif

    let app = launchApp()
    let imageSource = app.buttons["search.image-source"]
    XCTAssertTrue(imageSource.waitForExistence(timeout: 3))

    imageSource.tap()
    let files = app.buttons.matching(identifier: "image-source.files").firstMatch
    XCTAssertTrue(files.waitForExistence(timeout: 2))
    XCTAssertTrue(app.buttons["image-source.camera"].exists)
    XCTAssertTrue(app.buttons["image-source.photo-library"].exists)
    recordSettledScreenshot(named: "production-image-source-menu-files", app: app)

    app.buttons.matching(identifier: "image-source.files").firstMatch.tap()
    _ = waitForSystemDocumentPicker(in: app)
    recordSettledScreenshot(named: "production-files-picker-clear-horizontal", app: app)
    let fixture = app.staticTexts.matching(
      NSPredicate(format: "label BEGINSWITH %@", "fixture-clear-horizontal")
    ).firstMatch
    if !fixture.waitForExistence(timeout: 3), isHostedCI {
      throw XCTSkip(
        "Hosted Simulator proves the system Files picker opens; staged-file selection remains physical HIL."
      )
    }
    XCTAssertTrue(fixture.exists)
    fixture.tap()
    XCTAssertTrue(app.buttons["Open"].isEnabled)
    app.buttons["Open"].tap()
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    let recognized = app.descendants(matching: .any)["image-text.raw-text"]
    XCTAssertTrue(recognized.waitForExistence(timeout: 10))
    XCTAssertTrue(recognized.label.contains("日本語"))
    recordSettledScreenshot(named: "production-image-text-files-recognized", app: app)
  }

  @MainActor
  func testImageTextFilesSourceCancelsWithoutReportingAnImportFailure() throws {
    let app = launchApp()
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.files").firstMatch.tap()

    let cancel = app.buttons["Cancel"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    cancel.tap()

    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.alerts["Unable to Import Images"].exists)
    XCTAssertFalse(app.buttons["image-text.close"].exists)
  }

  @MainActor
  private func waitForSystemDocumentPicker(in app: XCUIApplication) -> XCUIElement {
    let picker = app.windows.element(boundBy: 1)
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    return picker
  }

  @MainActor
  func testPhotoLibrarySourceOpensSystemPickerAndCancels() throws {
    let app = launchApp()
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.photo-library").firstMatch.tap()

    let picker = waitForSystemPhotoPicker(in: app)
    picker.coordinate(withNormalizedOffset: CGVector(dx: 0.10, dy: 0.12)).tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testPhotoLibrarySelectionStartsImageTextFlow() throws {
    let app = launchApp()
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.photo-library").firstMatch.tap()
    let picker = waitForSystemPhotoPicker(in: app)
    recordSettledScreenshot(named: "production-photo-library-picker", app: app)

    picker.coordinate(withNormalizedOffset: CGVector(dx: 0.16, dy: 0.42)).tap()

    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    let recognized = app.descendants(matching: .any)["image-text.raw-text"]
    XCTAssertTrue(recognized.waitForExistence(timeout: 20))
    if containsJapaneseText(recognized.label) {
      XCTAssertFalse(app.alerts["No Text Found"].exists)
    } else {
      let noText = app.alerts["No Text Found"]
      XCTAssertTrue(noText.waitForExistence(timeout: 3), recognized.label)
      XCTAssertTrue(noText.staticTexts["Japanese text was not found in this image."].exists)
    }
    recordSettledScreenshot(named: "production-image-text-photo-recognized", app: app)
  }

  @MainActor
  private func waitForSystemPhotoPicker(in app: XCUIApplication) -> XCUIElement {
    let picker = app.windows.element(boundBy: 1)
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    return picker
  }

  @MainActor
  func testPhotoLibraryProviderFailureReportsAndRecovers() throws {
    let app = launchApp(additionalArguments: ["-PhotoLibraryProviderFailure"])
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.photo-library").firstMatch.tap()

    let alert = app.alerts["Unable to Import Images"]
    XCTAssertTrue(alert.waitForExistence(timeout: 3))
    XCTAssertTrue(alert.staticTexts["The selected photos could not be read."].exists)
    alert.buttons["OK"].tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testCameraUnavailableOnSimulatorReportsHardwareBoundary() throws {
    let app = launchApp(additionalArguments: ["-CameraUnavailable"])
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.camera").firstMatch.tap()

    let alert = app.alerts["Camera Unavailable"]
    XCTAssertTrue(alert.waitForExistence(timeout: 3))
    XCTAssertTrue(
      alert.staticTexts["Camera capture requires a physical device with an available camera."]
        .exists)
    alert.buttons["OK"].tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testCameraDeniedPermissionOffersSettingsRecovery() throws {
    let app = launchApp(additionalArguments: ["-CameraAuthorizationDenied"])
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.camera").firstMatch.tap()

    let alert = app.alerts["Camera Access Denied"]
    XCTAssertTrue(alert.waitForExistence(timeout: 3))
    XCTAssertTrue(
      alert.staticTexts["Allow Camera access in Settings to capture Japanese text."].exists)
    XCTAssertTrue(alert.buttons["Open Settings"].exists)
    alert.buttons["Cancel"].tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testCameraRestrictedPermissionExplainsManagedBoundary() throws {
    let app = launchApp(additionalArguments: ["-CameraAuthorizationRestricted"])
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.camera").firstMatch.tap()

    let alert = app.alerts["Camera Access Restricted"]
    XCTAssertTrue(alert.waitForExistence(timeout: 3))
    XCTAssertTrue(alert.staticTexts["Camera access is restricted on this device."].exists)
    XCTAssertFalse(alert.buttons["Open Settings"].exists)
    alert.buttons["OK"].tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testCameraCaptureStartsImageTextFlow() throws {
    #if targetEnvironment(simulator)
      throw XCTSkip("Camera capture acceptance requires the signed physical-device fixture rig.")
    #else
      let app = launchApp()
      addUIInterruptionMonitor(withDescription: "Camera permission") { alert in
        if alert.buttons["Allow"].exists {
          alert.buttons["Allow"].tap()
          return true
        }
        return false
      }
      app.buttons["search.image-source"].tap()
      app.buttons.matching(identifier: "image-source.camera").firstMatch.tap()
      app.tap()

      let shutter = app.buttons.matching(
        NSPredicate(
          format: "label IN %@",
          ["Take Picture", "Shutter"]
        )
      ).firstMatch
      XCTAssertTrue(shutter.waitForExistence(timeout: 10))
      recordSettledScreenshot(named: "production-camera-preview", app: app)
      shutter.tap()
      let usePhoto = app.buttons["Use Photo"]
      XCTAssertTrue(usePhoto.waitForExistence(timeout: 10))
      usePhoto.tap()

      XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 30))
      let recognized = app.descendants(matching: .any)["image-text.raw-text"]
      XCTAssertTrue(recognized.waitForExistence(timeout: 30))
      XCTAssertTrue(containsJapaneseText(recognized.label), recognized.label)
      recordSettledScreenshot(named: "production-image-text-camera-recognized", app: app)
    #endif
  }

  @MainActor
  func testImageTextClearFileSupportsHighlightsGlossNestedWordSharingAndClose() throws {
    let app = launchImageTextFixtures(["fixture-clear-horizontal.png"])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    let quiet = app.descendants(matching: .any).matching(identifier: "image-text.region.静か")
      .firstMatch
    XCTAssertTrue(quiet.waitForExistence(timeout: 10))
    let recognizedText = app.descendants(matching: .any)["image-text.raw-text"]
    XCTAssertTrue(recognizedText.waitForExistence(timeout: 10))
    let expectedCopiedText = recognizedText.label
      .replacingOccurrences(of: "Recognized text ", with: "")
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
    recordSettledScreenshot(named: "image-text-clear-recognized", app: app)

    let translate = app.buttons["image-text.translate"]
    XCTAssertTrue(translate.exists)
    translate.tap()
    let translation = app.staticTexts["image-text.translation"]
    XCTAssertTrue(translation.waitForExistence(timeout: 3))
    XCTAssertTrue(translation.label.contains("quiet park"))
    assertImageTextToolbarIsHittable(in: app)
    let translationHighlights = app.buttons["image-text.highlights"]
    translationHighlights.tap()
    translationHighlights.tap()
    XCTAssertTrue(translation.waitForExistence(timeout: 2))
    recordSettledScreenshot(named: "image-text-natural-translation", app: app)

    quiet.tap()
    let gloss = app.buttons["image-text.gloss"]
    XCTAssertTrue(gloss.waitForExistence(timeout: 2))
    XCTAssertTrue(gloss.label.contains("quiet"))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.静か.静=しず|か"].exists)
    recordSettledScreenshot(named: "image-text-clear-shizuka-selected", app: app)
    gloss.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.静か.静=しず|か"].exists)
    XCTAssertTrue(nativeBackButton(in: app).isHittable)
    let attachment = app.buttons["word-detail.image-attachment"]
    XCTAssertTrue(attachment.exists)
    attachment.tap()
    XCTAssertTrue(app.buttons["word-detail.image-attachment-done"].waitForExistence(timeout: 2))
    app.buttons["word-detail.image-attachment-done"].tap()
    recordSettledScreenshot(named: "image-text-shizuka-word-detail", app: app)
    tapNativeBack(in: app)
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 3))
    XCTAssertTrue(translation.exists)
    XCTAssertTrue(translation.label.contains("quiet park"))
    XCTAssertFalse(gloss.exists)

    let highlights = app.buttons["image-text.highlights"]
    highlights.tap()
    XCTAssertFalse(quiet.exists)
    highlights.tap()
    XCTAssertTrue(quiet.waitForExistence(timeout: 2))

    app.buttons["image-text.share"].tap()
    let copyText = app.descendants(matching: .any)
      .matching(identifier: "image-text.copy-text")
      .firstMatch
    XCTAssertTrue(copyText.waitForExistence(timeout: 2))
    XCTAssertTrue(app.buttons.matching(identifier: "image-text.share-image").firstMatch.exists)
    app.buttons.matching(identifier: "image-text.share-image").firstMatch.tap()
    let shareSheet = app.otherElements["ShareSheet.RemoteContainerView"]
    XCTAssertTrue(shareSheet.waitForExistence(timeout: 3))
    XCTAssertTrue(app.navigationBars["fixture-clear-horizontal.png"].exists)
    XCTAssertTrue(shareSheet.images.firstMatch.exists)
    let dismissShareSheet = app.otherElements["PopoverDismissRegion"]
    XCTAssertTrue(dismissShareSheet.exists)
    dismissShareSheet.tap()
    XCTAssertTrue(shareSheet.waitForNonExistence(timeout: 3))
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 3))
    assertImageTextToolbarIsHittable(in: app)

    app.buttons["image-text.share"].tap()
    let reopenedCopyText = app.descendants(matching: .any)
      .matching(identifier: "image-text.copy-text")
      .firstMatch
    XCTAssertTrue(reopenedCopyText.waitForExistence(timeout: 3))
    reopenedCopyText.tap()

    app.buttons["image-text.close"].tap()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.press(forDuration: 1)
    XCTAssertTrue(app.menuItems["Paste"].waitForExistence(timeout: 2))
    app.menuItems["Paste"].tap()
    let pasted = searchField.value as? String
    XCTAssertEqual(pasted, expectedCopiedText)
  }

  @MainActor
  func testImageTextEncounterMediaPersistsIntoLaterSearchAndAppearsInMediaLibrary() throws {
    var app = launchApp(additionalArguments: [
      "-StartImageTextFixtures", "fixture-clear-horizontal.png",
      "-InjectImageTextTranslation",
      "-ResetWordImageAttachments",
    ])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    let quiet = app.descendants(matching: .any).matching(identifier: "image-text.region.静か")
      .firstMatch
    XCTAssertTrue(quiet.waitForExistence(timeout: 10))
    quiet.tap()
    let gloss = app.buttons["image-text.gloss"]
    XCTAssertTrue(gloss.waitForExistence(timeout: 3))
    gloss.tap()

    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["word-detail.image-attachment"].waitForExistence(timeout: 3))
    tapNativeBack(in: app)
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 3))
    app.buttons["image-text.close"].tap()

    app.tabBars.buttons["More"].tap()
    XCTAssertTrue(app.staticTexts["More"].waitForExistence(timeout: 2))
    let mediaLibrary = app.buttons["more.media-library"]
    XCTAssertTrue(mediaLibrary.exists)
    mediaLibrary.tap()
    XCTAssertTrue(app.staticTexts["Media Library"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.descendants(matching: .any)["media-library.list"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["fixture-clear-horizontal.png"].exists)
    XCTAssertTrue(app.staticTexts["静か"].exists)

    app.terminate()
    app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("静か", in: app, searchField: searchField)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "静か, しずか")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    let savedAttachment = app.buttons["word-detail.image-attachment"]
    XCTAssertTrue(
      savedAttachment.waitForExistence(timeout: 3),
      "Image Text word context must survive an ordinary Search route."
    )
    XCTAssertTrue(savedAttachment.label.contains("Saved encounter images"))
    savedAttachment.tap()
    let remove = app.buttons["word-detail.image-attachment-remove"]
    XCTAssertTrue(remove.waitForExistence(timeout: 3))
    remove.tap()
    XCTAssertTrue(savedAttachment.waitForNonExistence(timeout: 3))

    app.terminate()
    app = launchApp()
    let relaunchedSearchField = app.textFields["search.field"]
    XCTAssertTrue(relaunchedSearchField.waitForExistence(timeout: 3))
    submitSearch("静か", in: app, searchField: relaunchedSearchField)
    let relaunchedResult = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "静か, しずか")
    ).firstMatch
    XCTAssertTrue(relaunchedResult.waitForExistence(timeout: 3))
    relaunchedResult.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.buttons["word-detail.image-attachment"].exists)
  }

  @MainActor
  func testWordDetailEncounterMediaViewerPagesAndRemovesOnlyTheSelectedImage() throws {
    var app = launchApp(additionalArguments: [
      "-StartImageTextFixtures", "fixture-clear-horizontal.png",
      "-InjectImageTextTranslation",
      "-ResetWordImageAttachments",
    ])
    let quiet = app.descendants(matching: .any).matching(identifier: "image-text.region.静か")
      .firstMatch
    XCTAssertTrue(quiet.waitForExistence(timeout: 10))
    quiet.tap()
    app.buttons["image-text.gloss"].tap()
    XCTAssertTrue(app.buttons["word-detail.image-attachment"].waitForExistence(timeout: 3))
    tapNativeBack(in: app)
    app.buttons["image-text.close"].tap()
    app.terminate()

    app = launchApp(additionalArguments: [
      "-StartImageTextFixtures", "fixture-vertical.png",
      "-InjectVerticalImageTextRecognition",
    ])
    let secondQuiet = app.descendants(matching: .any).matching(identifier: "image-text.region.静か")
      .firstMatch
    XCTAssertTrue(secondQuiet.waitForExistence(timeout: 10))
    secondQuiet.tap()
    let gloss = app.buttons["image-text.gloss"]
    XCTAssertTrue(gloss.waitForExistence(timeout: 3))
    gloss.tap()

    let attachment = app.buttons["word-detail.image-attachment"]
    XCTAssertTrue(attachment.waitForExistence(timeout: 3))
    XCTAssertTrue(attachment.label.contains("2"))
    attachment.tap()
    XCTAssertTrue(app.staticTexts["fixture-vertical.png"].waitForExistence(timeout: 3))
    app.swipeLeft()
    XCTAssertTrue(app.staticTexts["fixture-clear-horizontal.png"].waitForExistence(timeout: 3))
    app.buttons["word-detail.image-attachment-remove"].tap()
    XCTAssertTrue(app.buttons["word-detail.image-attachment-done"].waitForExistence(timeout: 3))
    app.buttons["word-detail.image-attachment-done"].tap()
    XCTAssertTrue(attachment.waitForExistence(timeout: 3))
    XCTAssertTrue(attachment.label.contains("1"))
  }

  @MainActor
  func testImageTextVerticalFileProducesSelectableJapaneseRegions() throws {
    let app = launchImageTextFixtures(["fixture-vertical.png"])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)
        .matching(identifier: "image-text.region.いる")
        .firstMatch.waitForExistence(timeout: 10)
    )
    let region = app.descendants(matching: .any).matching(identifier: "image-text.region.読本")
      .firstMatch
    XCTAssertTrue(region.waitForExistence(timeout: 10))
    region.tap()
    let gloss = app.buttons["image-text.gloss"]
    XCTAssertTrue(gloss.waitForExistence(timeout: 2))
    XCTAssertTrue(gloss.label.contains("読本"))
    XCTAssertTrue(gloss.label.localizedCaseInsensitiveContains("reading-book"))
    recordSettledScreenshot(named: "image-text-vertical-selected", app: app)
  }

  @MainActor
  func testImageTextMultipleFilesRecoverFromEmptyAndRemainTransient() throws {
    let names = [
      "fixture-empty.png",
      "fixture-noisy-horizontal.png",
      "fixture-sparse.png",
    ]
    stageImageTextFixtures(names)
    let app = launchApp(additionalArguments: ["-InjectSparseImageTextRecognition"])
    app.buttons["search.image-source"].tap()
    app.buttons.matching(identifier: "image-source.files").firstMatch.tap()
    if isHostedCI {
      XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5))
      throw XCTSkip(
        "Hosted Simulator proves the system Files picker opens; multi-file selection remains physical HIL."
      )
    }
    if app.buttons["Select"].waitForExistence(timeout: 2) {
      app.buttons["Select"].tap()
    }
    for name in names {
      let baseName = String(name.dropLast(4))
      let file = app.staticTexts.matching(
        NSPredicate(format: "label BEGINSWITH %@", baseName)
      ).firstMatch
      if !file.waitForExistence(timeout: 3), isHostedCI {
        throw XCTSkip(
          "Hosted Simulator proves the system Files picker opens; multi-file selection remains physical HIL."
        )
      }
      XCTAssertTrue(file.exists)
      file.tap()
    }
    XCTAssertTrue(app.buttons["Open"].isEnabled)
    app.buttons["Open"].tap()
    XCTAssertTrue(selectImageTextPage(named: "fixture-empty", pageCount: names.count, in: app))
    XCTAssertTrue(app.alerts["No Text Found"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Japanese text was not found in this image."].exists)
    recordSettledScreenshot(named: "image-text-multiple-empty-alert", app: app)
    app.alerts["No Text Found"].buttons["OK"].firstMatch.tap()

    XCTAssertTrue(
      selectImageTextPage(named: "fixture-noisy-horizontal", pageCount: names.count, in: app))
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    let noisyText = app.descendants(matching: .any)["image-text.raw-text"]
    XCTAssertTrue(noisyText.waitForExistence(timeout: 20))
    XCTAssertTrue(noisyText.label.contains("日本語"))
    XCTAssertTrue(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH %@", "image-text.region."))
        .firstMatch.exists
    )
    recordSettledScreenshot(named: "image-text-multiple-noisy", app: app)
    XCTAssertTrue(selectImageTextPage(named: "fixture-sparse", pageCount: names.count, in: app))
    let still = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "image-text.region.")
    ).firstMatch
    XCTAssertTrue(
      still.waitForExistence(timeout: 20),
      app.descendants(matching: .any)["image-text.raw-text"].label
    )
    XCTAssertTrue(still.label.contains("静"))
    still.tap()
    XCTAssertTrue(app.buttons["image-text.gloss"].label.contains("still"))
    assertImageTextToolbarIsHittable(in: app)
    let highlights = app.buttons["image-text.highlights"]
    highlights.tap()
    highlights.tap()
    XCTAssertTrue(still.waitForExistence(timeout: 2))
    recordSettledScreenshot(named: "image-text-multiple-sparse-selected", app: app)

    app.terminate()
    let relaunched = launchApp()
    XCTAssertTrue(relaunched.textFields["search.field"].waitForExistence(timeout: 3))
    XCTAssertFalse(relaunched.buttons["image-text.close"].exists)
    recordSettledScreenshot(named: "image-text-cold-relaunch-search", app: relaunched)
  }

  @MainActor
  func testImageTextMultipleImagesUseNativePagingWithoutCustomPageButtons() throws {
    let names = [
      "fixture-clear-horizontal.png",
      "fixture-vertical.png",
    ]
    let app = launchImageTextFixtures(names)

    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.descendants(matching: .any)["image-text.current-page"].waitForExistence(timeout: 20)
    )
    XCTAssertFalse(app.buttons["image-text.page.1"].exists)
    XCTAssertFalse(app.buttons["image-text.page.2"].exists)
    XCTAssertTrue(app.pageIndicators.firstMatch.exists)
    XCTAssertFalse(
      app.descendants(matching: .any).matching(
        NSPredicate(
          format: "identifier == %@ AND label CONTAINS %@",
          "image-text.current-page", "fixture-vertical")
      ).firstMatch.exists
    )
    XCTAssertTrue(selectImageTextPage(named: "fixture-vertical", pageCount: names.count, in: app))
    XCTAssertFalse(
      app.descendants(matching: .any).matching(
        NSPredicate(
          format: "identifier == %@ AND label CONTAINS %@",
          "image-text.current-page", "fixture-clear-horizontal")
      ).firstMatch.exists
    )
    XCTAssertTrue(
      selectImageTextPage(named: "fixture-clear-horizontal", pageCount: names.count, in: app))
  }

  @MainActor
  func testImageTextRecognitionFailureKeepsExplicitCloseRecovery() throws {
    let app = launchApp(additionalArguments: [
      "-StartImageTextFixtures", "fixture-clear-horizontal.png",
      "-InjectImageTextRecognitionFailure",
    ])

    XCTAssertTrue(app.staticTexts["Image text unavailable"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Close and choose the file again."].exists)
    XCTAssertFalse(app.descendants(matching: .any)["image-text.raw-text"].exists)
    XCTAssertFalse(app.buttons["BackButton"].exists)

    let window = app.windows.firstMatch
    window.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
      .press(
        forDuration: 0.1,
        thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
      )
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.textFields["search.field"].exists)

    app.buttons["image-text.close"].tap()
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))
  }

  @MainActor
  func testImageTextJapaneseWithoutDictionaryMatchIsNotReportedAsNoText() throws {
    let app = launchApp(additionalArguments: [
      "-StartImageTextFixtures", "fixture-empty.png",
      "-InjectUnlinkedImageTextRecognition",
    ])
    XCTAssertTrue(app.buttons["image-text.close"].waitForExistence(timeout: 10))
    let rawText = app.descendants(matching: .any)["image-text.raw-text"]
    XCTAssertTrue(rawText.waitForExistence(timeout: 5))
    XCTAssertTrue(rawText.label.contains("龘龘"))
    XCTAssertFalse(app.alerts["No Text Found"].exists)
    XCTAssertFalse(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH %@", "image-text.region."))
        .firstMatch.exists
    )
  }

  @MainActor
  func testKanjiElementFailureOffersRetryAndRecoversFromTheLiveSource() throws {
    let app = launchApp(additionalArguments: ["-InjectKanjiElementFailureOnce"])
    let kanjiDetail = openKanjiDetail(for: "静", in: app)
    let element = app.buttons["kanji-detail.element.青"]
    for _ in 0..<6 where !element.isHittable || element.frame.maxY > app.frame.maxY - 140 {
      kanjiDetail.swipeUp()
    }
    XCTAssertTrue(element.isHittable)
    XCTAssertLessThan(element.frame.maxY, app.frame.maxY - 140)
    element.tap()

    let retry = app.buttons["kanji-element.retry"]
    XCTAssertTrue(retry.waitForExistence(timeout: 3))
    XCTAssertFalse(app.staticTexts["SOUND PATTERNS"].exists)
    recordSettledScreenshot(named: "kanji-element-source-failure-retry", app: app)

    retry.tap()
    XCTAssertTrue(app.staticTexts["SOUND PATTERNS"].waitForExistence(timeout: 3))
    let elementScreen = app.collectionViews["kanji-element.screen"]
    let linkedKanji = app.buttons["kanji-element.contribution.清"]
    scrollElementIntoSafeTapRegion(linkedKanji, in: elementScreen, app: app)
    XCTAssertTrue(linkedKanji.exists)
    recordSettledScreenshot(named: "kanji-element-source-recovered", app: app)
    let structureSource = app.staticTexts["kanji-element.structure-source"]
    scrollElementIntoSafeTapRegion(structureSource, in: elementScreen, app: app)
    XCTAssertTrue(structureSource.exists)
    XCTAssertTrue(structureSource.label.contains("kanjium"))
    let metadataSource = app.staticTexts["kanji-element.metadata-source"]
    scrollElementIntoSafeTapRegion(metadataSource, in: elementScreen, app: app)
    XCTAssertTrue(metadataSource.exists)
    XCTAssertTrue(metadataSource.label.contains("edrdg.kanjidic2"))
  }

  @MainActor
  func testKanjiDetailPartialFailureKeepsReferenceContentAndRetryLoadsWords() throws {
    let app = launchApp(additionalArguments: ["-InjectKanjiRelatedWordsFailureOnce"])
    let kanjiDetail = openKanjiDetail(for: "静", in: app)

    let retry = app.buttons["kanji-detail.retry"]
    XCTAssertTrue(retry.waitForExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "静")
    XCTAssertEqual(
      app.descendants(matching: .any)["kanji-detail.strokes"].label,
      "14 Strokes"
    )
    XCTAssertTrue(app.staticTexts["READINGS"].exists)
    let element = app.buttons["kanji-detail.element.青"]
    for _ in 0..<12 where !element.isHittable { kanjiDetail.swipeUp() }
    XCTAssertTrue(element.exists)
    XCTAssertFalse(app.staticTexts["WORDS"].exists)

    for _ in 0..<12 where !retry.isHittable { kanjiDetail.swipeDown() }
    XCTAssertTrue(retry.isHittable)
    retry.tap()
    let relatedWord = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "kanji-detail.word.", "静寂, せいじゃく"
      )
    ).firstMatch
    for _ in 0..<12 where !relatedWord.isHittable { kanjiDetail.swipeUp() }
    XCTAssertTrue(relatedWord.exists)
    XCTAssertFalse(retry.exists)
  }

  @MainActor
  func testKanjiElementAlternativeStandaloneAndNestedBackRestoreEveryPriorState() throws {
    let app = launchApp()
    let kanjiDetail = openKanjiDetail(for: "静", in: app)
    let soundElement = app.buttons["kanji-detail.element.争"]
    scrollElementIntoSafeTapRegion(soundElement, in: kanjiDetail, app: app)
    recordSettledScreenshot(named: "kanji-element-shizu-entry", app: app)
    soundElement.tap()

    let elementScreen = app.collectionViews["kanji-element.screen"]
    XCTAssertTrue(elementScreen.waitForExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["kanji-element.glyph"].label, "争")
    XCTAssertTrue(app.staticTexts["SOUND PATTERNS"].exists)
    XCTAssertTrue(app.staticTexts["AS A STANDALONE KANJI"].exists)
    let traditional = app.buttons["kanji-element.alternative.爭"]
    XCTAssertTrue(traditional.waitForExistence(timeout: 2))
    recordSettledScreenshot(named: "kanji-element-sou", app: app)
    traditional.tap()

    XCTAssertTrue(elementScreen.waitForExistence(timeout: 2))
    XCTAssertEqual(app.staticTexts["kanji-element.glyph"].label, "爭")
    let contribution = app.buttons["kanji-element.contribution.靜"]
    for _ in 0..<8 where !contribution.isHittable { elementScreen.swipeUp() }
    XCTAssertTrue(contribution.isHittable)
    recordSettledScreenshot(named: "kanji-element-traditional-sou-scrolled", app: app)

    let standalone = app.buttons["kanji-element.standalone.争"]
    for _ in 0..<8 where !standalone.isHittable { elementScreen.swipeDown() }
    XCTAssertTrue(standalone.isHittable)
    standalone.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "争")
    recordSettledScreenshot(named: "kanji-element-standalone-sou-destination", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(elementScreen.waitForExistence(timeout: 2))
    let restoredStandalone = app.buttons["kanji-element.standalone.争"]
    XCTAssertTrue(restoredStandalone.isHittable)

    tapNativeBack(in: app)
    XCTAssertTrue(elementScreen.waitForExistence(timeout: 2))
    XCTAssertEqual(app.staticTexts["kanji-element.glyph"].label, "争")
    let restoredTraditional = app.buttons["kanji-element.alternative.爭"]
    XCTAssertTrue(restoredTraditional.isHittable)
    tapNativeBack(in: app)
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 2))
    XCTAssertTrue(soundElement.isHittable)
    XCTAssertLessThan(soundElement.frame.maxY, app.frame.maxY - 120)
    recordSettledScreenshot(named: "kanji-element-back-restores-shizu", app: app)
  }

  @MainActor
  func testEveryRenderedKanjiElementRoleRowUsesPublicKanjiNavigation() throws {
    let app = launchApp()
    let kanjiDetail = openKanjiDetail(for: "静", in: app)
    let meaningElement = app.buttons["kanji-detail.element.青"]
    for _ in 0..<6
    where !meaningElement.isHittable
      || meaningElement.frame.maxY > app.frame.maxY - 140
    {
      kanjiDetail.swipeUp()
    }
    XCTAssertTrue(meaningElement.isHittable)
    XCTAssertLessThan(meaningElement.frame.maxY, app.frame.maxY - 140)
    meaningElement.tap()

    let elementScreen = app.collectionViews["kanji-element.screen"]
    if !elementScreen.waitForExistence(timeout: 3) {
      XCTAssertTrue(meaningElement.isHittable)
      meaningElement.tap()
    }
    XCTAssertTrue(elementScreen.waitForExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["kanji-element.glyph"].label, "青")
    XCTAssertTrue(app.staticTexts["MEANING / STRUCTURE"].exists)
    XCTAssertTrue(app.staticTexts["SOUND PATTERNS"].exists)
    let linkedKanji = app.buttons["kanji-element.contribution.清"]
    for _ in 0..<8
    where !linkedKanji.exists
      || linkedKanji.frame.maxY > app.frame.maxY - 140
    {
      elementScreen.swipeUp()
    }
    XCTAssertTrue(linkedKanji.isHittable)
    XCTAssertLessThan(linkedKanji.frame.maxY, app.frame.maxY - 140)
    linkedKanji.tap()

    let linkedDetail = app.collectionViews["kanji-detail.screen"]
    if !linkedDetail.waitForExistence(timeout: 2) {
      XCTAssertTrue(linkedKanji.isHittable)
      linkedKanji.tap()
    }
    XCTAssertTrue(linkedDetail.waitForExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "清")
    tapNativeBack(in: app)
    XCTAssertTrue(elementScreen.waitForExistence(timeout: 2))
    let restoredPosition = XCTNSPredicateExpectation(
      predicate: NSPredicate { object, _ in
        guard let element = object as? XCUIElement, element.exists, element.isHittable else {
          return false
        }
        return element.frame.maxY < app.frame.maxY - 140
      },
      object: linkedKanji
    )
    XCTAssertEqual(XCTWaiter.wait(for: [restoredPosition], timeout: 10), .completed)
    XCTAssertTrue(linkedKanji.isHittable)
    XCTAssertLessThan(linkedKanji.frame.maxY, app.frame.maxY - 140)
    recordSettledScreenshot(named: "kanji-element-role-linked-back-restored", app: app)
  }

  @MainActor
  func testKanjiStrokeOrderFailureOffersRetryAndRecovers() throws {
    let app = launchApp(additionalArguments: ["-InjectStrokeOrderFailureOnce"])
    _ = openKanjiDetail(for: "争", in: app)

    let retry = app.buttons["kanji-detail.stroke-order-retry"]
    XCTAssertTrue(retry.waitForExistence(timeout: 8))
    XCTAssertFalse(app.buttons["kanji-detail.stroke-order"].exists)
    recordSettledScreenshot(named: "stroke-order-source-failure-retry", app: app)

    retry.tap()
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    strokeOrder.tap()
    XCTAssertTrue(app.otherElements["stroke-order.screen"].waitForExistence(timeout: 2))
    XCTAssertEqual(
      app.descendants(matching: .any)["stroke-order.progress"].value as? String,
      "0 of 6 complete"
    )
    recordSettledScreenshot(named: "stroke-order-source-recovered", app: app)
    app.buttons["stroke-order.close"].tap()
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 2))
  }

  @MainActor
  func testKanjiStrokeOrderStepsForwardAndBackThenClosesToKanjiDetail() throws {
    let app = launchApp()
    let kanjiDetail = openKanjiDetail(for: "争", in: app)

    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    strokeOrder.tap()

    XCTAssertTrue(app.otherElements["stroke-order.screen"].waitForExistence(timeout: 2))
    let progress = app.descendants(matching: .any)["stroke-order.progress"]
    XCTAssertEqual(progress.value as? String, "0 of 6 complete")
    XCTAssertFalse(app.buttons["stroke-order.previous"].isEnabled)
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-sou-initial", app: app)

    app.buttons["stroke-order.next"].tap()
    let firstStrokeSettled = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "1 of 6 complete"),
      object: progress
    )
    XCTAssertEqual(XCTWaiter.wait(for: [firstStrokeSettled], timeout: 3), .completed)
    XCTAssertTrue(app.buttons["stroke-order.previous"].isEnabled)
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-sou-step-one", app: app)

    app.buttons["stroke-order.previous"].tap()
    XCTAssertEqual(progress.value as? String, "0 of 6 complete")
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-sou-initial-after-step-back", app: app)

    app.buttons["stroke-order.close"].tap()
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 2))
    XCTAssertTrue(strokeOrder.isHittable)
    XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "争")
  }

  @MainActor
  func testKanjiStrokeOrderPlayPausesResumesAndCompletesLongDiagram() throws {
    let app = launchApp()
    _ = openKanjiDetail(for: "鬱", in: app)
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    strokeOrder.tap()

    let progress = app.descendants(matching: .any)["stroke-order.progress"]
    XCTAssertTrue(progress.waitForExistence(timeout: 2))
    XCTAssertEqual(progress.value as? String, "0 of 29 complete")
    app.buttons["stroke-order.play"].tap()
    let pause = app.buttons["stroke-order.pause"]
    XCTAssertTrue(pause.waitForExistence(timeout: 2))
    Thread.sleep(forTimeInterval: 1.2)
    pause.tap()

    let pausedValue = progress.value as? String
    let pausedCount = completedStrokeCount(from: pausedValue)
    XCTAssertGreaterThan(pausedCount, 0)
    XCTAssertLessThan(pausedCount, 29)
    XCTAssertTrue(app.buttons["stroke-order.play"].isEnabled)
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-utsu-paused", app: app)

    Thread.sleep(forTimeInterval: 0.8)
    XCTAssertEqual(progress.value as? String, pausedValue)
    app.buttons["stroke-order.play"].tap()

    let completion = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "29 of 29 complete"),
      object: progress
    )
    XCTAssertEqual(XCTWaiter.wait(for: [completion], timeout: 20), .completed)
    XCTAssertTrue(app.buttons["stroke-order.play"].isEnabled)
    XCTAssertFalse(app.buttons["stroke-order.next"].isEnabled)
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-utsu-complete", app: app)

    app.buttons["stroke-order.play"].tap()
    XCTAssertTrue(app.buttons["stroke-order.pause"].waitForExistence(timeout: 2))
    XCTAssertNotEqual(progress.value as? String, "29 of 29 complete")
    app.buttons["stroke-order.pause"].tap()
  }

  @MainActor
  func testKanjiStrokeOrderOneStrokeCompletesAndColdRelaunchReturnsToSearch() throws {
    let app = launchApp()
    _ = openKanjiDetail(for: "一", in: app)
    let strokeOrder = app.buttons["kanji-detail.stroke-order"]
    XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
    strokeOrder.tap()

    let progress = app.descendants(matching: .any)["stroke-order.progress"]
    XCTAssertTrue(progress.waitForExistence(timeout: 2))
    XCTAssertEqual(progress.value as? String, "0 of 1 complete")
    app.buttons["stroke-order.play"].tap()
    let completion = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "1 of 1 complete"),
      object: progress
    )
    XCTAssertEqual(XCTWaiter.wait(for: [completion], timeout: 3), .completed)
    XCTAssertTrue(app.buttons["stroke-order.play"].isEnabled)
    waitForStrokeOrderCaptureToSettle(in: app)
    recordSettledScreenshot(named: "stroke-order-ichi-complete", app: app)

    app.terminate()
    app.launch()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    XCTAssertEqual(searchField.value as? String, "Search Japanese or English")
    XCTAssertFalse(app.otherElements["stroke-order.screen"].exists)
    XCTAssertFalse(app.collectionViews["kanji-detail.screen"].exists)
    recordScreenshot(named: "stroke-order-cold-relaunch-search-root", app: app)
  }

  @MainActor
  func testYamaInputsReachKanjiDetailAndPlayStrokeOrder() throws {
    for query in ["yama", "やま", "山"] {
      let app = launchApp()
      let searchField = app.textFields["search.field"]
      XCTAssertTrue(searchField.waitForExistence(timeout: 3))
      submitSearch(query, in: app, searchField: searchField)

      if query == "山" {
        let kanji = app.buttons["result.kanji-primary.山"]
        XCTAssertTrue(kanji.waitForExistence(timeout: 3))
        kanji.tap()
      } else {
        if query == "yama" {
          let refinement = app.buttons["search.reading-refinement"]
          XCTAssertTrue(refinement.waitForExistence(timeout: 3))
          XCTAssertEqual(refinement.label, "Search for Japanese reading やま")
          refinement.tap()
        }
        let mountain = app.buttons.matching(
          NSPredicate(format: "label BEGINSWITH %@", "山, やま,")
        ).firstMatch
        XCTAssertTrue(mountain.waitForExistence(timeout: 3))
        mountain.tap()
        let wordDetail = app.collectionViews["word-detail.screen"]
        XCTAssertTrue(wordDetail.waitForExistence(timeout: 3))
        let linkedKanji = app.buttons["word-detail.kanji.山"]
        scrollElementIntoSafeTapRegion(linkedKanji, in: wordDetail, app: app)
        XCTAssertTrue(linkedKanji.exists)
        linkedKanji.tap()
      }

      XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 3))
      XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "山")
      recordSettledScreenshot(named: "yama-\(query)-kanji-detail", app: app)
      let strokeOrder = app.buttons["kanji-detail.stroke-order"]
      XCTAssertTrue(strokeOrder.waitForExistence(timeout: 3))
      strokeOrder.tap()
      let progress = app.descendants(matching: .any)["stroke-order.progress"]
      XCTAssertEqual(progress.value as? String, "0 of 3 complete")
      waitForStrokeOrderCaptureToSettle(in: app)
      recordSettledScreenshot(named: "yama-\(query)-stroke-order-initial", app: app)
      app.buttons["stroke-order.play"].tap()
      let completed = XCTNSPredicateExpectation(
        predicate: NSPredicate(format: "value == %@", "3 of 3 complete"),
        object: progress
      )
      XCTAssertEqual(XCTWaiter.wait(for: [completed], timeout: 20), .completed)
      recordScreenshot(named: "yama-\(query)-stroke-order-complete", app: app)
      app.terminate()
    }
  }

  @MainActor
  func testKanjiDetailShowsSourceBackedClassificationAndReadings() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("静か", in: app, searchField: searchField)

    let quiet = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "静か, しずか")
    ).firstMatch
    XCTAssertTrue(quiet.waitForExistence(timeout: 3))
    quiet.tap()

    let wordDetail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(wordDetail.waitForExistence(timeout: 2))
    let linkedKanji = app.buttons["word-detail.kanji.静"]
    for _ in 0..<5 where !linkedKanji.exists { wordDetail.swipeUp() }
    XCTAssertTrue(linkedKanji.exists)
    linkedKanji.tap()

    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.staticTexts["kanji-detail.glyph"].label, "静")
    let strokes = app.descendants(matching: .any)["kanji-detail.strokes"]
    XCTAssertTrue(strokes.waitForExistence(timeout: 3))
    XCTAssertEqual(strokes.label, "14 Strokes")
    XCTAssertEqual(app.descendants(matching: .any)["kanji-detail.grade"].label, "Grade 4")
    XCTAssertEqual(app.descendants(matching: .any)["kanji-detail.jlpt"].label, "JLPT N2")
    XCTAssertTrue(app.staticTexts["quiet"].exists)
    XCTAssertTrue(app.staticTexts["READINGS"].exists)
    XCTAssertTrue(app.buttons["kanji-detail.reading.on.セイ"].exists)
    let linkedReading = app.buttons["kanji-detail.reading.kun.しず-"]
    XCTAssertTrue(linkedReading.exists)
    recordScreenshot(named: "kanji-shizu-source-backed-top", app: app)

    linkedReading.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.静.静=しず"].exists)
    tapNativeBack(in: app)
    let restoredKanjiDetail = app.collectionViews["kanji-detail.screen"]
    XCTAssertTrue(restoredKanjiDetail.waitForExistence(timeout: 2))
    let restoredReadingWord = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "kanji-detail.word.", "静, しず,"
      )
    ).firstMatch
    XCTAssertTrue(restoredReadingWord.waitForExistence(timeout: 2))
    XCTAssertTrue(restoredReadingWord.isHittable)

    let back = nativeBackButton(in: app)
    XCTAssertTrue(back.isHittable)
    back.tap()
    XCTAssertTrue(wordDetail.waitForExistence(timeout: 2))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.静か.静=しず|か"].exists)
    XCTAssertTrue(linkedKanji.exists)
    XCTAssertTrue(nativeBackButton(in: app).isHittable)
    Thread.sleep(forTimeInterval: 2)
    recordSettledScreenshot(named: "kanji-back-restores-shizuka-word-detail", app: app)
  }

  @MainActor
  func testKanjiDetailRelatedWordOpensWordDetailAndBackRestoresPosition() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("静か", in: app, searchField: searchField)

    let quiet = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "静か, しずか")
    ).firstMatch
    XCTAssertTrue(quiet.waitForExistence(timeout: 3))
    quiet.tap()
    let wordDetail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(wordDetail.waitForExistence(timeout: 2))
    let linkedKanji = app.buttons["word-detail.kanji.静"]
    scrollElementIntoSafeTapRegion(linkedKanji, in: wordDetail, app: app)
    linkedKanji.tap()

    let kanjiDetail = app.collectionViews["kanji-detail.screen"]
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 2))
    XCTAssertFalse(app.staticTexts["kanji-detail.elements"].exists)
    let soundElement = app.buttons["kanji-detail.element.争"]
    scrollElementIntoSafeTapRegion(soundElement, in: kanjiDetail, app: app)
    XCTAssertTrue(soundElement.exists)
    let meaningElement = app.buttons["kanji-detail.element.青"]
    scrollElementIntoSafeTapRegion(meaningElement, in: kanjiDetail, app: app)
    XCTAssertTrue(meaningElement.exists)

    let relatedQuiet = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "kanji-detail.word.", "静寂, せいじゃく"
      )
    ).firstMatch
    scrollElementIntoSafeTapRegion(relatedQuiet, in: kanjiDetail, app: app)
    recordScreenshot(named: "kanji-shizu-elements-and-related-words", app: app)

    relatedQuiet.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.静寂.静寂=せいじゃく"].exists)
    XCTAssertTrue(app.staticTexts["silence, stillness, quietness"].exists)
    XCTAssertTrue(nativeBackButton(in: app).isHittable)
    Thread.sleep(forTimeInterval: 2)
    recordSettledScreenshot(named: "kanji-related-word-seijaku-detail", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 2))
    for _ in 0..<20 where !relatedQuiet.isHittable { Thread.sleep(forTimeInterval: 0.1) }
    XCTAssertTrue(relatedQuiet.isHittable)
    recordScreenshot(named: "kanji-related-word-back-restores-position", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(wordDetail.waitForExistence(timeout: 2))
    tapNativeBack(in: app)
    XCTAssertTrue(searchField.waitForExistence(timeout: 2))
    app.buttons["Clear text"].tap()
    submitSearch("静", in: app, searchField: searchField)
    let searchResults = app.descendants(matching: .any)["search.results"]
    let kanjiPrimary = app.buttons["result.kanji-primary.静"]
    scrollElementIntoSafeTapRegion(kanjiPrimary, in: searchResults, app: app)
    kanjiPrimary.tap()

    XCTAssertTrue(kanjiDetail.waitForExistence(timeout: 2))
    let glyph = app.staticTexts["kanji-detail.glyph"]
    XCTAssertTrue(glyph.waitForExistence(timeout: 2))
    XCTAssertTrue(glyph.isHittable)
    XCTAssertFalse(relatedQuiet.exists)
  }

  @MainActor
  func testSearchInputModesUseNativeSelectionAndCandidateSubmissionControls() throws {
    let app = launchApp(additionalArguments: ["-HandwritingRecognitionFixture", "cho"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()

    let modePicker = app.segmentedControls["search.input.mode"]
    XCTAssertTrue(modePicker.waitForExistence(timeout: 2))
    for label in ["Keyboard", "Handwriting", "Radicals"] {
      XCTAssertTrue(modePicker.buttons[label].exists, "Missing visible \(label) input mode")
    }
    XCTAssertTrue(modePicker.buttons["Keyboard"].isSelected)

    modePicker.buttons["Handwriting"].tap()
    XCTAssertTrue(modePicker.buttons["Handwriting"].isSelected)
    let erase = app.buttons["handwriting.erase"]
    XCTAssertTrue(erase.exists)
    XCTAssertFalse(app.buttons["handwriting.search"].exists)
    assertUsesNativeTabSafeArea(erase, in: app)

    modePicker.buttons["Radicals"].tap()
    XCTAssertTrue(modePicker.buttons["Radicals"].isSelected)
    let remove = app.buttons["radical.remove"]
    XCTAssertTrue(remove.waitForExistence(timeout: 2))
    XCTAssertFalse(app.buttons["radical.search"].exists)
    assertUsesNativeTabSafeArea(remove, in: app)
  }

  @MainActor
  func testRadicalSelectionNarrowsAndRemovalBroadensRealCandidates() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openRadicals(in: app)
    let candidateStrip = app.scrollViews["radical.candidate-strip"]

    XCTAssertFalse(app.buttons["radical.search"].exists)
    XCTAssertTrue(app.staticTexts["1 Stroke"].exists)
    XCTAssertTrue(app.staticTexts["2 Strokes"].exists)
    recordScreenshot(named: "radical-unselected-stroke-groups", app: app)

    let grass = radicalButton("radical.grass", in: app)
    grass.tap()
    XCTAssertEqual(grass.value as? String, "Selected")
    XCTAssertTrue(candidateStrip.waitForExistence(timeout: 3))
    let broadCount = candidateCount(in: candidateStrip)
    XCTAssertGreaterThan(broadCount, 1)
    recordScreenshot(named: "radical-single-selection-broad-candidates", app: app)

    let strike = radicalButton("radical.strike", in: app)
    strike.tap()
    XCTAssertEqual(strike.value as? String, "Selected")
    let narrowCount = candidateCount(in: candidateStrip)
    XCTAssertLessThan(narrowCount, broadCount)
    XCTAssertTrue(app.buttons["radical.candidate.薮"].exists)
    recordScreenshot(named: "radical-multiple-selection-narrow-candidates", app: app)

    radicalButton("radical.strike", in: app).tap()
    let broadCandidatesRestored = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "\(broadCount) candidates"),
      object: candidateStrip
    )
    XCTAssertEqual(XCTWaiter.wait(for: [broadCandidatesRestored], timeout: 10), .completed)
    XCTAssertEqual(candidateCount(in: candidateStrip), broadCount)

    app.buttons["radical.remove"].tap()
    XCTAssertFalse(candidateStrip.exists)
    XCTAssertTrue(app.staticTexts["Select one or more radicals"].exists)

    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(app.otherElements["handwriting.canvas"].waitForExistence(timeout: 2))
    app.buttons["search.input.radicals"].tap()
    _ = radicalButton("radical.grass", in: app, navigationStrategy: .restoreTopBeforeSearching)
    app.buttons["search.input.keyboard"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 2))
    XCTAssertEqual(surface.searchField.value as? String, "Search Japanese or English")
  }

  @MainActor
  func testRadicalGridKeepsTopMiddleAndLowerComponentsReachable() throws {
    let app = launchApp()
    _ = openRadicals(in: app)

    for identifier in ["radical.one", "radical.grass", "radical.龠"] {
      XCTAssertTrue(radicalButton(identifier, in: app).isHittable)
    }

    XCTAssertTrue(
      radicalButton("radical.grass", in: app, navigationStrategy: .restoreTopBeforeSearching)
        .isHittable
    )
  }

  @MainActor
  func testRadicalCandidateSubmitsKanjiResultAndEntersHistory() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openRadicals(in: app)
    radicalButton("radical.grass", in: app).tap()
    radicalButton("radical.strike", in: app).tap()

    let candidate = app.buttons["radical.candidate.薮"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 3))
    let candidateValue = candidate.value as? String
    XCTAssertTrue(candidateValue?.contains("Candidate rank ") == true)
    candidate.tap()
    XCTAssertEqual(surface.searchField.value as? String, "薮")
    XCTAssertTrue(app.scrollViews["radical.grid"].waitForNonExistence(timeout: 2))
    XCTAssertFalse(app.buttons["radical.search"].exists)
    let kanjiPrimary = app.buttons["result.kanji-primary.薮"]
    XCTAssertTrue(kanjiPrimary.waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Best Matches"].exists)
    let wordRow = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 2"))
      .firstMatch
    XCTAssertTrue(wordRow.exists)
    XCTAssertTrue(wordRow.label.contains("藪"))
    XCTAssertFalse(app.staticTexts["Additional Matches"].exists)
    recordScreenshot(named: "radical-yabu-kanji-primary-results", app: app)

    showRecentSearches(in: app, searchField: surface.searchField)
    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "薮")
  }

  @MainActor
  func testRadicalSearchRequiresCandidateWhenEnteringWithPopulatedQuery() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("think")
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))

    app.buttons["search.input.radicals"].tap()
    XCTAssertEqual(searchField.value as? String, "think")
    XCTAssertFalse(app.buttons["radical.search"].exists)
    recordScreenshot(named: "radical-populated-query-still-requires-candidate", app: app)

    radicalButton("radical.one", in: app).tap()
    let candidate = app.buttons["radical.candidate.丁"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 2))
    candidate.tap()
    XCTAssertEqual(searchField.value as? String, "丁")
    XCTAssertTrue(app.buttons["result.kanji-primary.丁"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.scrollViews["radical.grid"].exists)
  }

  @MainActor
  func testRealRadicalCandidateWithoutAnyDictionaryMatchStillOpensKanjiResult() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openRadicals(in: app)
    recordSettledScreenshot(named: "radical-production-empty", app: app)
    radicalButton("radical.丶", in: app).tap()

    let candidate = app.buttons["radical.candidate.丶"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 2))
    recordSettledScreenshot(named: "radical-production-selected", app: app)
    candidate.tap()

    let kanjiPrimary = app.buttons["result.kanji-primary.丶"]
    XCTAssertTrue(kanjiPrimary.waitForExistence(timeout: 3))
    XCTAssertFalse(app.otherElements["search.no-results"].exists)
    recordScreenshot(named: "radical-kanji-primary-without-dictionary-row", app: app)

    kanjiPrimary.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    let detailGlyph = app.staticTexts["kanji-detail.glyph"]
    XCTAssertTrue(detailGlyph.waitForExistence(timeout: 2))
    XCTAssertEqual(detailGlyph.label, "丶")
    tapNativeBack(in: app)

    showRecentSearches(in: app, searchField: surface.searchField)
    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "丶")
  }

  @MainActor
  func testHandwritingCandidatesComposeCommonKanjiAndEnterHistory() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openHandwriting(in: app)
    let searchField = surface.searchField
    let canvas = surface.canvas
    XCTAssertEqual(canvas.label, "Drawing grid")
    XCTAssertEqual(canvas.value as? String, "Empty drawing")

    drawSyntheticSun(in: canvas)
    let sunCandidate = app.buttons["handwriting.candidate.日"]
    XCTAssertTrue(sunCandidate.waitForExistence(timeout: 3))
    XCTAssertEqual(sunCandidate.value as? String, "Candidate rank 1")
    XCTAssertTrue(app.buttons["handwriting.candidate.目"].exists)
    XCTAssertTrue(app.buttons["handwriting.candidate.田"].exists)
    recordScreenshot(named: "handwriting-candidates-first-character", app: app)
    sunCandidate.tap()
    XCTAssertEqual(searchField.value as? String, "日")
    XCTAssertTrue(canvas.waitForNonExistence(timeout: 2))

    searchField.tap()
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(canvas.waitForExistence(timeout: 2))

    drawSyntheticOrigin(in: canvas)
    let bookCandidate = app.buttons["handwriting.candidate.本"]
    XCTAssertTrue(bookCandidate.waitForExistence(timeout: 3))
    bookCandidate.tap()
    XCTAssertEqual(searchField.value as? String, "日本")
    XCTAssertTrue(app.buttons["result.japan"].waitForExistence(timeout: 3))
    XCTAssertTrue(canvas.waitForNonExistence(timeout: 2))
    XCTAssertFalse(app.buttons["handwriting.erase"].exists)
    XCTAssertFalse(app.segmentedControls["search.input.mode"].exists)
    recordScreenshot(named: "handwriting-common-kanji-results", app: app)

    showRecentSearches(in: app, searchField: searchField)
    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    XCTAssertEqual(recentSearch.label, "日本")
  }

  @MainActor
  func testHandwritingEraseClearsPendingDrawingAndModeControlsNavigate() throws {
    let app = launchApp(additionalArguments: ["-HandwritingRecognitionFixture", "cho"])
    let surface = openHandwriting(in: app)
    let canvas = surface.canvas
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.5), to: CGVector(dx: 0.8, dy: 0.5))
    XCTAssertTrue(app.buttons["handwriting.candidate.丁"].waitForExistence(timeout: 3))
    XCTAssertEqual(canvas.value as? String, "1 stroke")

    let erase = app.buttons["handwriting.erase"]
    XCTAssertTrue(erase.isEnabled)
    erase.tap()
    XCTAssertEqual(canvas.value as? String, "Empty drawing")
    XCTAssertFalse(app.buttons["handwriting.candidate.丁"].exists)
    XCTAssertFalse(app.buttons["handwriting.search"].exists)
    recordScreenshot(named: "handwriting-erased-app-owned-drawing", app: app)

    app.buttons["search.input.radicals"].tap()
    XCTAssertTrue(app.staticTexts["1 Stroke"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["2 Strokes"].exists)
    let oneRadical = app.buttons["radical.one"]
    XCTAssertTrue(oneRadical.exists)
    oneRadical.tap()
    XCTAssertEqual(oneRadical.value as? String, "Selected")
    XCTAssertTrue(app.buttons["radical.candidate.丁"].waitForExistence(timeout: 2))
    recordScreenshot(named: "radical-grouped-grid-from-handwriting", app: app)
    oneRadical.tap()
    XCTAssertEqual(oneRadical.value as? String, "Not selected")
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(canvas.waitForExistence(timeout: 2))
    app.buttons["search.input.keyboard"].tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 2))
  }

  @MainActor
  func testSelectedHandwritingCandidateSubmitsSingleKanji() throws {
    let app = launchApp(additionalArguments: [
      "-ResetRecentSearches", "-HandwritingRecognitionFixture", "cho",
    ])
    let surface = openHandwriting(in: app)
    let searchField = surface.searchField
    let canvas = surface.canvas
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.4), to: CGVector(dx: 0.8, dy: 0.4))
    let candidate = app.buttons["handwriting.candidate.丁"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 3))
    candidate.tap()
    XCTAssertEqual(searchField.value as? String, "丁")
    XCTAssertTrue(surface.canvas.waitForNonExistence(timeout: 2))
    XCTAssertFalse(app.buttons["handwriting.search"].exists)
    let kanjiPrimary = app.buttons["result.kanji-primary.丁"]
    XCTAssertTrue(kanjiPrimary.waitForExistence(timeout: 3))
    XCTAssertTrue(kanjiPrimary.label.contains("丁"))
    let bestMatches = app.staticTexts["Best Matches"]
    XCTAssertTrue(bestMatches.exists)
    XCTAssertLessThan(bestMatches.frame.minY, kanjiPrimary.frame.minY)
    let resultSurface = app.descendants(matching: .any)["search.results"]
    let additionalMatches = app.staticTexts["Additional Matches"]
    scrollElementIntoSafeTapRegion(additionalMatches, in: resultSurface, app: app, step: 0.12)
    recordScreenshot(named: "handwriting-single-kanji-results", app: app)

    scrollElementIntoSafeTapRegion(
      kanjiPrimary,
      in: resultSurface,
      app: app,
      step: 0.12,
      searchesBackwardWhenAbsent: true
    )
    kanjiPrimary.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    let detailGlyph = app.staticTexts["kanji-detail.glyph"]
    XCTAssertTrue(detailGlyph.waitForExistence(timeout: 2))
    XCTAssertEqual(detailGlyph.label, "丁")
    recordScreenshot(named: "handwriting-single-kanji-detail", app: app)
    tapNativeBack(in: app)

  }

  @MainActor
  func testHandwritingSearchIncludesPendingRecognizedStroke() throws {
    let app = launchApp(additionalArguments: [
      "-ResetRecentSearches", "-HandwritingRecognitionFixture", "pending",
    ])
    let surface = openHandwriting(in: app)
    let searchField = surface.searchField
    let canvas = surface.canvas
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.35), to: CGVector(dx: 0.8, dy: 0.35))
    let selectedCandidate = app.buttons["handwriting.candidate.丁"]
    XCTAssertTrue(selectedCandidate.waitForExistence(timeout: 3))
    selectedCandidate.tap()
    XCTAssertTrue(canvas.waitForNonExistence(timeout: 2))

    searchField.tap()
    app.buttons["search.input.handwriting"].tap()
    XCTAssertTrue(canvas.waitForExistence(timeout: 2))

    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.55), to: CGVector(dx: 0.8, dy: 0.55))
    let nextCandidate = app.buttons["handwriting.candidate.一"]
    XCTAssertTrue(nextCandidate.waitForExistence(timeout: 3))
    XCTAssertEqual(searchField.value as? String, "丁")
    nextCandidate.tap()

    XCTAssertEqual(searchField.value as? String, "丁一")
    XCTAssertTrue(app.staticTexts["Discovered Words"].waitForExistence(timeout: 3))
    let discoveredRows = app.buttons.matching(
      NSPredicate(format: "value BEGINSWITH %@", "Discovered word"))
    XCTAssertGreaterThanOrEqual(discoveredRows.count, 2)
    XCTAssertTrue(discoveredRows.element(boundBy: 0).label.contains("丁"))
    XCTAssertTrue(discoveredRows.element(boundBy: 1).label.contains("一"))
    recordScreenshot(named: "handwriting-pending-stroke-discovered-words", app: app)

    showRecentSearches(in: app, searchField: searchField)
    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "丁一")
  }

  @MainActor
  func testHandwritingNoCandidateStateRecoversAfterEraseAndRedraw() throws {
    let app = launchApp(additionalArguments: ["-HandwritingRecognitionFixture", "recover"])
    let surface = openHandwriting(in: app)
    let canvas = surface.canvas
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.2), to: CGVector(dx: 0.35, dy: 0.25))
    XCTAssertTrue(app.staticTexts["handwriting.no-candidates"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.buttons["handwriting.search"].exists)
    recordScreenshot(named: "handwriting-no-candidates-app-owned-state", app: app)

    app.buttons["handwriting.erase"].tap()
    XCTAssertEqual(canvas.value as? String, "Empty drawing")
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.45), to: CGVector(dx: 0.8, dy: 0.45))
    XCTAssertTrue(app.buttons["handwriting.candidate.丁"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.staticTexts["handwriting.no-candidates"].exists)
  }

  @MainActor
  func testLiveHandwritingRecognitionProducesCandidatesForSyntheticKanji() throws {
    let app = launchApp()
    let canvas = openHandwriting(in: app).canvas
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.15, dy: 0.25), to: CGVector(dx: 0.85, dy: 0.25))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.5, dy: 0.25), to: CGVector(dx: 0.5, dy: 0.8))
    let candidate = app.buttons["handwriting.candidate.丁"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 10))
    XCTAssertEqual(candidate.label, "Use handwriting candidate 丁")
    recordScreenshot(named: "handwriting-live-offline-candidate", app: app)
  }

  @MainActor
  func testNaturalHandwritingRecognizesYamaWithoutFixture() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openHandwriting(in: app)
    let canvas = surface.canvas
    recordSettledScreenshot(named: "handwriting-natural-yama-empty", app: app)
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.5, dy: 0.2),
      to: CGVector(dx: 0.5, dy: 0.78)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.18, dy: 0.42),
      to: CGVector(dx: 0.5, dy: 0.78)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.82, dy: 0.38),
      to: CGVector(dx: 0.82, dy: 0.78)
    )

    let candidate = app.buttons["handwriting.candidate.山"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 10))
    recordSettledScreenshot(named: "handwriting-natural-yama-candidates", app: app)
    candidate.tap()
    XCTAssertEqual(surface.searchField.value as? String, "山")
    XCTAssertTrue(app.buttons["result.kanji-primary.山"].waitForExistence(timeout: 3))
    recordScreenshot(named: "handwriting-natural-yama-results", app: app)
  }

  @MainActor
  func testRecordedPhysicalPhoneYamaGestureIncludesYamaCandidate() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let surface = openHandwriting(in: app)
    let canvas = surface.canvas

    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.22, dy: 0.2),
      to: CGVector(dx: 0.48, dy: 0.76)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.52, dy: 0.18),
      to: CGVector(dx: 0.52, dy: 0.78)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.82, dy: 0.2),
      to: CGVector(dx: 0.82, dy: 0.76)
    )

    let candidate = app.buttons["handwriting.candidate.山"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 10))
    XCTAssertLessThanOrEqual(
      canvas.frame.maxY, nativeTabBar(in: app).frame.minY)
    recordSettledScreenshot(named: "handwriting-recorded-yama-candidate", app: app)
  }

  @MainActor
  func testSameYamaShapeRecognizesAcrossNoncanonicalStrokeOrder() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let canvas = openHandwriting(in: app).canvas

    // Learners may draw the right, left, and center strokes in any order. The
    // finished shape is the recognition input; canonical stroke order is not.
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.82, dy: 0.76),
      to: CGVector(dx: 0.82, dy: 0.2)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.48, dy: 0.76),
      to: CGVector(dx: 0.22, dy: 0.2)
    )
    drawSyntheticStroke(
      in: canvas,
      from: CGVector(dx: 0.52, dy: 0.78),
      to: CGVector(dx: 0.52, dy: 0.18)
    )

    let candidate = app.buttons["handwriting.candidate.山"]
    XCTAssertTrue(candidate.waitForExistence(timeout: 10))
    recordSettledScreenshot(named: "handwriting-yama-noncanonical-order", app: app)
  }

  @MainActor
  func testHandwritingCanvasProvidesUncrampedPhysicalPhoneDrawingArea() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let canvas = openHandwriting(in: app).canvas

    XCTAssertGreaterThanOrEqual(canvas.frame.width, 240)
    XCTAssertGreaterThanOrEqual(canvas.frame.height, 240)
    assertUsesNativeTabSafeArea(canvas, in: app)
    recordSettledScreenshot(named: "handwriting-uncramped-canvas", app: app)
  }

  @MainActor
  func testNewestRecentSearchRerunsItsResultSet() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("mondai")

    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    refinement.tap()
    XCTAssertTrue(app.buttons["result.problem"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Additional Matches"].waitForExistence(timeout: 2))
    let originalRanking = representativeRanking(in: app)

    showRecentSearches(in: app, searchField: searchField)

    let newestRecentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(newestRecentSearch.waitForExistence(timeout: 3))
    XCTAssertEqual(newestRecentSearch.label, "もんだい")
    XCTAssertEqual(newestRecentSearch.value as? String, "Recent search 1")
    recordScreenshot(named: "recent-search-session-created-mondai-top", app: app)
    newestRecentSearch.tap()

    XCTAssertEqual(searchField.value as? String, "もんだい")
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
    let restoredLeader = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(restoredLeader.waitForExistence(timeout: 3))
    XCTAssertTrue(restoredLeader.label.contains("問題"))
    XCTAssertTrue(app.staticTexts["Additional Matches"].exists)
    XCTAssertEqual(representativeRanking(in: app), originalRanking)
    recordScreenshot(named: "search-results-rerun-recent-mondai", app: app)
  }

  @MainActor
  func testPersistedRecentSearchesAppearImmediatelyOnColdRelaunch() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    submitSearch("think", in: app, searchField: searchField)
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))

    app.terminate()
    app.launchArguments.removeAll { $0 == "-ResetRecentSearches" }
    app.launch()

    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    XCTAssertEqual(recentSearch.label, "think")
    XCTAssertGreaterThanOrEqual(recentSearch.frame.height, 44)
    XCTAssertLessThanOrEqual(recentSearch.frame.height, 52)
    XCTAssertFalse(app.keyboards.firstMatch.exists)
    XCTAssertFalse(app.buttons["search.cancel"].exists)
  }

  @MainActor
  func testSelectingOlderRecentSearchMovesNormalizedQueryToTopWithoutDuplication() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    submitSearch("think", in: app, searchField: searchField)
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))
    showRecentSearches(in: app, searchField: searchField)

    submitSearch("日本", in: app, searchField: searchField)
    XCTAssertTrue(app.buttons["result.japan"].waitForExistence(timeout: 3))
    showRecentSearches(in: app, searchField: searchField)

    XCTAssertEqual(app.buttons["recent-search.0"].label, "日本")
    let older = app.buttons["recent-search.1"]
    XCTAssertTrue(older.exists)
    XCTAssertEqual(older.label, "think")
    older.tap()

    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))
    XCTAssertFalse(app.keyboards.firstMatch.exists)
    app.buttons["Clear text"].tap()

    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 3))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "think")
    XCTAssertEqual(app.buttons["recent-search.1"].label, "日本")
    XCTAssertFalse(app.buttons["recent-search.2"].exists)
  }

  @MainActor
  func testEmptyHistoryShowsCleanIdleSearchSurface() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    XCTAssertTrue(app.textFields["search.field"].waitForExistence(timeout: 3))

    XCTAssertFalse(app.staticTexts["Recent Searches"].exists)
    XCTAssertFalse(app.buttons["recent-search.clear-all"].exists)
    XCTAssertFalse(app.staticTexts["No Dictionary Matches"].exists)
    XCTAssertFalse(app.staticTexts["Dictionary unavailable"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["search.loading"].exists)
  }

  @MainActor
  func testDisposableRecentSearchCanBeRemovedWithoutAffectingAnotherRow() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    submitSearch("think", in: app, searchField: searchField)
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))

    showRecentSearches(in: app, searchField: searchField)
    submitSearch("日本", in: app, searchField: searchField)
    XCTAssertTrue(app.buttons["result.japan"].waitForExistence(timeout: 3))

    showRecentSearches(in: app, searchField: searchField)
    let newest = app.buttons["recent-search.0"]
    let older = app.buttons["recent-search.1"]
    XCTAssertTrue(newest.waitForExistence(timeout: 3))
    XCTAssertEqual(newest.label, "日本")
    XCTAssertTrue(older.exists)
    XCTAssertEqual(older.label, "think")

    newest.swipeLeft()
    let delete = app.buttons["Delete"]
    XCTAssertTrue(delete.waitForExistence(timeout: 2))
    delete.tap()

    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "think")
    XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label == %@", "日本")).firstMatch.exists)
    recordScreenshot(named: "recent-search-single-row-deletion", app: app)

    app.terminate()
    app.launchArguments.removeAll { $0 == "-ResetRecentSearches" }
    app.launch()
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    XCTAssertTrue(app.buttons["recent-search.0"].waitForExistence(timeout: 3))
    XCTAssertEqual(app.buttons["recent-search.0"].label, "think")
    XCTAssertFalse(app.buttons["recent-search.1"].exists)
  }

  @MainActor
  func testDisposableHistoryClearAllConfirmsAndCancelLeavesSearchRoot() throws {
    let app = launchApp(additionalArguments: ["-ResetRecentSearches"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    submitSearch("think", in: app, searchField: searchField)
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))
    showRecentSearches(in: app, searchField: searchField)

    let recentSearch = app.buttons["recent-search.0"]
    XCTAssertTrue(recentSearch.waitForExistence(timeout: 3))
    let clearAll = app.buttons["recent-search.clear-all"]
    XCTAssertTrue(clearAll.exists)

    clearAll.tap()

    let alert = app.alerts["Clear Recent Searches?"]
    XCTAssertTrue(alert.waitForExistence(timeout: 2))
    alert.buttons["Cancel"].tap()
    XCTAssertTrue(recentSearch.exists)

    clearAll.tap()
    XCTAssertTrue(alert.waitForExistence(timeout: 2))
    alert.buttons["Clear All"].tap()

    XCTAssertFalse(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertFalse(app.staticTexts["Recent Searches"].exists)
    recordScreenshot(named: "recent-search-cleared-disposable-history", app: app)

    let cancel = app.buttons["search.cancel"]
    XCTAssertTrue(cancel.exists)
    cancel.tap()
    XCTAssertFalse(app.keyboards.firstMatch.exists)
    XCTAssertEqual(searchField.value as? String, "Search Japanese or English")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-ResetRecentSearches" }
    app.launch()
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    XCTAssertFalse(app.buttons["recent-search.0"].waitForExistence(timeout: 2))
    XCTAssertFalse(app.staticTexts["Recent Searches"].exists)
    XCTAssertFalse(app.buttons["recent-search.clear-all"].exists)
  }

  @MainActor
  func testAmbiguousRomajiCanRefineToJapaneseReading() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("mondai")

    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    XCTAssertEqual(refinement.label, "Search for Japanese reading もんだい")
    XCTAssertEqual(searchField.value as? String, "mondai")
    XCTAssertTrue(app.staticTexts["Best Matches"].exists)
    let literalLeader = app.buttons.matching(
      NSPredicate(format: "value BEGINSWITH %@ AND label BEGINSWITH %@", "Best match", "月曜, げつよう,")
    ).firstMatch
    XCTAssertTrue(literalLeader.waitForExistence(timeout: 2))
    let literalMonday = app.buttons.matching(
      NSPredicate(
        format: "value BEGINSWITH %@ AND label BEGINSWITH %@",
        "Additional match",
        "月曜日, げつようび,"
      )
    ).firstMatch
    XCTAssertTrue(literalMonday.waitForExistence(timeout: 2))
    recordScreenshot(named: "search-results-literal-romaji-mondai", app: app)

    refinement.tap()

    let normalized = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "もんだい"),
      object: searchField
    )
    XCTAssertEqual(XCTWaiter.wait(for: [normalized], timeout: 3), .completed)
    XCTAssertFalse(refinement.exists)
    let refinedLeader = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    guard refinedLeader.waitForExistence(timeout: 8) else {
      XCTFail("Expected reranked Japanese results after selecting the captured refinement")
      return
    }
    XCTAssertTrue(refinedLeader.label.contains("問題"))
    XCTAssertTrue(app.staticTexts["Best Matches"].exists)
    XCTAssertTrue(app.staticTexts["Additional Matches"].exists)
    recordScreenshot(named: "search-results-refined-japanese-mondai", app: app)
  }

  @MainActor
  func testNihonOffersJapaneseReadingRefinement() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("nihon")

    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    XCTAssertEqual(refinement.label, "Search for Japanese reading にほん")

    refinement.tap()

    let normalized = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "にほん"),
      object: searchField
    )
    XCTAssertEqual(XCTWaiter.wait(for: [normalized], timeout: 3), .completed)
    let refinedLeader = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(refinedLeader.waitForExistence(timeout: 3))
    XCTAssertTrue(refinedLeader.label.contains("日本"))
    let japan = app.buttons["result.japan"]
    XCTAssertEqual(japan.value as? String, "Best match 1")
    let additionalLeader = app.buttons.matching(
      NSPredicate(
        format: "value == %@ AND label BEGINSWITH %@", "Additional match 1", "二本, にほん,"
      )
    ).firstMatch
    XCTAssertTrue(additionalLeader.waitForExistence(timeout: 5))
    XCTAssertTrue(additionalLeader.label.hasPrefix("二本, にほん,"))
    XCTAssertFalse(
      app.buttons.matching(NSPredicate(format: "value == %@", "Best match 2")).firstMatch.exists
    )
    XCTAssertFalse(app.buttons["search.reading-refinement"].exists)
    recordScreenshot(named: "search-results-refined-japanese-nihon", app: app)
  }

  @MainActor
  func testIruOffersJapaneseReadingRefinement() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("iru")

    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    XCTAssertEqual(refinement.label, "Search for Japanese reading いる")
    refinement.tap()

    let normalized = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "いる"),
      object: searchField
    )
    XCTAssertEqual(XCTWaiter.wait(for: [normalized], timeout: 3), .completed)
    XCTAssertFalse(refinement.exists)
    let kanaVerb = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "いる, いる")
    ).firstMatch
    XCTAssertTrue(kanaVerb.waitForExistence(timeout: 3))
  }

  @MainActor
  func testMixedScriptWordDetailPlacesRubyOnlyAboveKanji() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("女らしい", in: app, searchField: searchField)

    let feminine = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "女らしい, おんならしい")
    ).firstMatch
    XCTAssertTrue(feminine.waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.女らしい.女=おんな|らしい"].exists)
    feminine.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))

    let ruby = app.descendants(matching: .any)["ruby.女らしい.女=おんな|らしい"]
    XCTAssertTrue(
      ruby.waitForExistence(timeout: 3),
      "Word Detail must expose the kanji-aligned visual ruby presentation."
    )
  }

  @MainActor
  func testSourceBackedRomajiOffersJapaneseReadingBeyondCapturedExamples() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("sushi")

    XCTAssertTrue(resultButton(headword: "寿司", in: app).waitForExistence(timeout: 3))
    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    XCTAssertEqual(refinement.label, "Search for Japanese reading すし")
  }

  @MainActor
  func testEnglishQueryReturnsRankedDictionaryResults() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("think")

    let resultSurface = app.descendants(matching: .any)["search.results"]
    XCTAssertTrue(resultSurface.waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Best Matches"].waitForExistence(timeout: 3))
    let bestMatches = app.buttons.matching(NSPredicate(format: "value BEGINSWITH %@", "Best match"))
    XCTAssertEqual(bestMatches.count, 1)
    XCTAssertTrue(bestMatches.element(boundBy: 0).label.contains("がる"))
    XCTAssertTrue(app.staticTexts["Additional Matches"].exists)
    let additionalMatches = app.buttons.matching(
      NSPredicate(format: "value BEGINSWITH %@", "Additional match")
    )
    XCTAssertTrue(
      additionalMatches.matching(NSPredicate(format: "label BEGINSWITH %@", "思う, おもう,")).firstMatch
        .exists
    )
    XCTAssertLessThan(
      app.staticTexts["Best Matches"].frame.minY,
      app.staticTexts["Additional Matches"].frame.minY
    )
    let consider = additionalMatches.matching(
      NSPredicate(format: "label BEGINSWITH %@", "考える, かんがえる,")
    )
    .firstMatch
    scrollElementIntoSafeTapRegion(consider, in: resultSurface, app: app, step: 0.12)
    recordScreenshot(named: "search-results-english-think", app: app)
  }

  @MainActor
  func testHelloRanksTheJapaneseGreetingAheadOfTheLoanwordAndSubstringNoise() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("hello")

    let first = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1")).firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 3))
    XCTAssertTrue(first.label.hasPrefix("今日は, こんにちは,"), first.label)
    XCTAssertTrue(resultButton(headword: "ハロー", in: app).exists)
    XCTAssertFalse(resultButton(headword: "石", in: app).exists)
    XCTAssertFalse(resultButton(headword: "ウイング", in: app).exists)
    XCTAssertFalse(resultButton(headword: "ボックス", in: app).exists)
  }

  @MainActor
  func testGreetingWordDetailShowsCleanAlternativesPitchAndLearnerFacingExamples() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("hello")

    let greeting = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(greeting.waitForExistence(timeout: 3))
    greeting.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["word-detail.pitch"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["word-detail.alternative.こんにちわ"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["word-detail.alternative.今日わ"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["word-detail.alternative.こにちわ"].exists)
    XCTAssertFalse(app.descendants(matching: .any)["word-detail.alternative.こにちは"].exists)
    XCTAssertEqual(
      app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Search only")).count,
      0
    )
    XCTAssertEqual(
      app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Tatoeba sentence"))
        .count,
      0
    )
  }

  @MainActor
  func testWordDetailFinalContentClearsBottomNavigation() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("hello")
    app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1")).firstMatch.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    let finalExample = app.descendants(matching: .any)["word-detail.example.2"]
    scrollWordDetailElementIntoView(finalExample, in: detail, app: app)
    XCTAssertTrue(finalExample.exists)
    let tabBarTop = nativeTabBar(in: app).frame.minY
    for _ in 0..<8 where !finalExample.isHittable || finalExample.frame.maxY > tabBarTop - 24 {
      detail.swipeUp()
    }

    XCTAssertTrue(finalExample.isHittable)
    XCTAssertLessThanOrEqual(finalExample.frame.maxY, tabBarTop - 24)
    recordSettledScreenshot(named: "word-detail-bottom-navigation-clearance", app: app)
  }

  @MainActor
  func testPartialEnglishQueryUpdatesLiveResults() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("tab")

    XCTAssertTrue(app.staticTexts["Best Matches"].waitForExistence(timeout: 3))
    XCTAssertTrue(resultButton(headword: "タブ", in: app).waitForExistence(timeout: 10))
    recordScreenshot(named: "search-results-partial-tab", app: app)
  }

  @MainActor
  func testCancelDismissesFocusAndRetainsPopulatedResults() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("think")

    let bestMatches = app.staticTexts["Best Matches"]
    XCTAssertTrue(bestMatches.waitForExistence(timeout: 3))
    let cancel = app.buttons["Cancel"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 2))
    cancel.tap()

    let keyboardDismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"),
      object: app.keyboards.firstMatch
    )
    XCTAssertEqual(XCTWaiter.wait(for: [keyboardDismissed], timeout: 10), .completed)
    XCTAssertEqual(searchField.value as? String, "think")
    XCTAssertTrue(bestMatches.exists)
    recordScreenshot(named: "search-results-retained-after-cancel", app: app)
  }

  @MainActor
  func testNoMatchKeepsQueryAboveNativeNoResultsState() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("zzzxqv")

    XCTAssertTrue(app.staticTexts["No Dictionary Matches"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["Try another Japanese or English Search query."].exists)
    XCTAssertTrue(app.descendants(matching: .any)["search.no-results"].exists)
    XCTAssertEqual(searchField.value as? String, "zzzxqv")
    XCTAssertFalse(app.staticTexts["Best Matches"].exists)
    XCTAssertFalse(app.staticTexts["Additional Matches"].exists)
    recordScreenshot(named: "search-results-no-match-native", app: app)
  }

  @MainActor
  func testTrailingWhitespaceIsNormalizedBeforeShowingRomajiResults() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("taberu ")

    XCTAssertTrue(resultButton(headword: "食べる", in: app).waitForExistence(timeout: 3))
    let examples = app.buttons["search.examples"]
    XCTAssertTrue(examples.waitForExistence(timeout: 3))
    XCTAssertEqual(examples.label, "View 50+ Example Sentences")
    XCTAssertTrue(examples.isHittable)
    let refinement = app.buttons["search.reading-refinement"]
    XCTAssertTrue(refinement.waitForExistence(timeout: 3))
    XCTAssertEqual(refinement.label, "Search for Japanese reading たべる")
    recordScreenshot(named: "search-results-whitespace-normalized-taberu", app: app)
  }

  @MainActor
  func testMultiWordSearchPreservesSpaceAsItIsTyped() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("hello ")

    XCTAssertTrue(app.staticTexts["Best Matches"].waitForExistence(timeout: 3))

    searchField.typeText("world")
    XCTAssertEqual(searchField.value as? String, "hello world")
  }

  @MainActor
  func testHumanPacedMultiWordSearchReturnsFrozenSentenceResultsWithoutQueuedDelay() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()

    searchField.typeText("set")
    XCTAssertTrue(resultButton(headword: "セット", in: app).waitForExistence(timeout: 3))
    searchField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 3))

    for character in "scared you" {
      searchField.typeText(String(character))
      usleep(150_000)
    }
    XCTAssertEqual(searchField.value as? String, "scared you")
    let start = ContinuousClock.now

    let examples = app.buttons["search.examples"]
    let expectedResult = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "label == %@", "View 5 Example Sentences"),
      object: examples
    )
    let appeared = XCTWaiter.wait(for: [expectedResult], timeout: 15) == .completed
    let elapsed = start.duration(to: .now)
    print("HUMAN_PACED_MULTI_WORD_FINAL_LATENCY \(elapsed)")
    XCTAssertTrue(appeared)
    XCTAssertEqual(examples.label, "View 5 Example Sentences")
    XCTAssertLessThan(elapsed, .seconds(2))
    XCTAssertFalse(app.buttons["result.e31152bffef387608184ec15e5ed6416"].isHittable)
  }

  @MainActor
  func testOrdinaryJapaneseResultOpensItsOwnLanguageReferenceData() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("日本")

    let japan = app.buttons["result.japan"]
    XCTAssertTrue(japan.waitForExistence(timeout: 3))
    japan.tap()

    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["Japan"].exists)
    XCTAssertFalse(app.staticTexts["問題ない。"].exists)
    recordScreenshot(named: "word-detail-japan-language-reference-data", app: app)
  }

  @MainActor
  func testDictionarySourceAttributionIsReachableFromSearch() throws {
    let app = launchApp()

    let sources = app.tabBars.buttons["More"]
    XCTAssertTrue(sources.waitForExistence(timeout: 3))
    sources.tap()
    let credits = app.buttons["more.credits"]
    XCTAssertTrue(credits.waitForExistence(timeout: 2))
    credits.tap()

    XCTAssertTrue(app.staticTexts["Dictionary Sources"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["JMdict"].exists)
    XCTAssertTrue(app.staticTexts["License, CC BY-SA 4.0"].exists)
    let sourceList = app.descendants(matching: .any)["dictionary-sources.list"]
    XCTAssertTrue(sourceList.waitForExistence(timeout: 2))

    let kanjidic = app.staticTexts["KANJIDIC2"]
    scrollUpUntilExists(kanjidic, in: sourceList, attempts: 4)
    XCTAssertTrue(kanjidic.exists)

    let kradfile = app.staticTexts["KRADFILE / RADKFILE"]
    scrollUpUntilHittable(kradfile, in: sourceList, attempts: 6)
    XCTAssertTrue(kradfile.isHittable)
    recordScreenshot(named: "dictionary-source-attribution", app: app)

    let kanjiVG = app.staticTexts["KanjiVG"]
    scrollUpUntilHittable(kanjiVG, in: sourceList, attempts: 6)
    XCTAssertTrue(kanjiVG.isHittable)
    let kanjiVGDescription = app.staticTexts.matching(
      NSPredicate(format: "label CONTAINS %@", "KanjiVG by Ulrich Apel")
    ).firstMatch
    scrollUpUntilExists(kanjiVGDescription, in: sourceList, attempts: 4)
    XCTAssertTrue(kanjiVGDescription.waitForExistence(timeout: 2))
    let kanjiVGLicenseName = app.staticTexts["License, CC BY-SA 3.0"]
    scrollUpUntilExists(kanjiVGLicenseName, in: sourceList, attempts: 4)
    XCTAssertTrue(kanjiVGLicenseName.waitForExistence(timeout: 2))
    let kanjiVGLicense = app.buttons["dictionary-sources.kanjivg-license"]
    scrollUpUntilHittable(kanjiVGLicense, in: sourceList, attempts: 4)
    XCTAssertTrue(kanjiVGLicense.waitForExistence(timeout: 2))
    XCTAssertTrue(kanjiVGLicense.isHittable)
    kanjiVGLicense.tap()
    XCTAssertTrue(app.staticTexts["KanjiVG CC BY-SA 3.0 License"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "Attribution, ShareAlike")
      ).firstMatch.exists)
    let licenseBack = app.navigationBars["KanjiVG CC BY-SA 3.0 License"].buttons.firstMatch
    XCTAssertTrue(licenseBack.waitForExistence(timeout: 2))
    licenseBack.tap()

    let unidic = app.staticTexts["UniDic"]
    scrollUpUntilHittable(unidic, in: sourceList, attempts: 8)
    XCTAssertTrue(unidic.isHittable)
    let unidicLicenseName = app.staticTexts["License, New BSD"]
    scrollUpUntilHittable(unidicLicenseName, in: sourceList, attempts: 4)
    XCTAssertTrue(unidicLicenseName.isHittable)

    let tatoeba = app.staticTexts["Tatoeba"]
    scrollUpUntilHittable(tatoeba, in: sourceList, attempts: 8)
    XCTAssertTrue(tatoeba.isHittable)
    let tatoebaLicense = app.staticTexts["License, CC BY 2.0 FR"]
    scrollUpUntilHittable(tatoebaLicense, in: sourceList, attempts: 4)
    XCTAssertTrue(tatoebaLicense.isHittable)
    recordScreenshot(named: "dictionary-source-word-data-attribution", app: app)

    let contributors = app.buttons["dictionary-sources.tatoeba-contributors"]
    scrollUpUntilHittable(contributors, in: sourceList, attempts: 4)
    XCTAssertTrue(contributors.isHittable)
    contributors.tap()
    XCTAssertTrue(app.staticTexts["Tatoeba Contributors"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Named contributors ("))
        .firstMatch.exists)
    app.navigationBars["Tatoeba Contributors"].buttons.firstMatch.tap()

    let daKanji = app.staticTexts["DaKanji handwriting recognition"]
    scrollUpUntilHittable(daKanji, in: sourceList, attempts: 8)
    XCTAssertTrue(daKanji.isHittable)
    let daKanjiLicense = app.buttons["dictionary-sources.dakanji-license"]
    scrollUpUntilHittable(daKanjiLicense, in: sourceList, attempts: 4)
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "Single Kanji Recognition v1.2")
      ).firstMatch.exists)
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "MIT")
      ).firstMatch.exists)
    XCTAssertTrue(daKanjiLicense.isHittable)
    daKanjiLicense.tap()
    XCTAssertTrue(app.staticTexts["DaKanji MIT License"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "Copyright (c) 2021 CaptainDario")
      ).firstMatch.exists)
    let daKanjiBack = app.navigationBars["DaKanji MIT License"].buttons.firstMatch
    XCTAssertTrue(daKanjiBack.waitForExistence(timeout: 2))
    daKanjiBack.tap()

    let bundledLicense = app.buttons["dictionary-sources.unidic-license"]
    scrollDownUntilHittable(bundledLicense, in: sourceList, attempts: 10)
    XCTAssertTrue(bundledLicense.isHittable)
    bundledLicense.tap()
    XCTAssertTrue(app.staticTexts["UniDic New BSD License"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "Copyright (c) 2011-2021, The UniDic Consortium")
      ).firstMatch.exists)
    recordScreenshot(named: "dictionary-source-unidic-bundled-license", app: app)
  }

  @MainActor
  func testPrivacyAndSupportAreReachableFromMore() throws {
    let app = launchApp()

    let more = app.tabBars.buttons["More"]
    XCTAssertTrue(more.waitForExistence(timeout: 3))
    more.tap()
    let credits = app.buttons["more.credits"]
    XCTAssertTrue(credits.waitForExistence(timeout: 2))
    credits.tap()

    XCTAssertTrue(app.staticTexts["Zenbu Japanese"].waitForExistence(timeout: 2))
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@", "Encounter Media stay on this device")
      ).firstMatch.exists)
    XCTAssertTrue(app.descendants(matching: .any)["settings.privacy-policy"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["settings.support"].exists)
  }

  @MainActor
  func testLookupFailureIsNotPresentedAsNoMatchAndRetryRecovers() throws {
    let app = launchApp(
      additionalArguments: ["-InjectLookupFailureOnceQuery", "think"])

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("think")

    XCTAssertTrue(app.staticTexts["Dictionary unavailable"].waitForExistence(timeout: 3))
    let retry = app.buttons["Retry"]
    XCTAssertTrue(retry.exists)
    XCTAssertFalse(app.otherElements["search.no-results"].exists)
    recordScreenshot(named: "search-results-dictionary-failure", app: app)

    app.buttons["search.cancel"].tap()
    XCTAssertTrue(app.staticTexts["Dictionary unavailable"].waitForExistence(timeout: 2))
    XCTAssertTrue(retry.exists)
    XCTAssertFalse(resultButton(headword: "思う", in: app).exists)

    retry.tap()

    XCTAssertTrue(app.staticTexts["Best Matches"].waitForExistence(timeout: 3))
    XCTAssertTrue(resultButton(headword: "思う", in: app).exists)
    XCTAssertEqual(
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "思う, おもう,")).count,
      1
    )
    XCTAssertFalse(app.staticTexts["Dictionary unavailable"].exists)
    recordScreenshot(named: "search-results-recovered-after-retry", app: app)
  }

  @MainActor
  func testEditingAFailedLookupReplacesTheFailureNormally() throws {
    let app = launchApp(
      additionalArguments: ["-InjectLookupFailureOnceQuery", "think"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("think")
    XCTAssertTrue(app.staticTexts["Dictionary unavailable"].waitForExistence(timeout: 3))

    app.buttons["Clear text"].tap()
    XCTAssertTrue(searchField.waitForExistence(timeout: 2))
    XCTAssertFalse(app.staticTexts["Dictionary unavailable"].exists)
    XCTAssertFalse(app.buttons["Retry"].exists)

    searchField.typeText("日本")
    XCTAssertTrue(app.buttons["result.japan"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.staticTexts["Dictionary unavailable"].exists)

    app.buttons["Clear text"].tap()
    searchField.typeText("think")
    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 3))
    XCTAssertFalse(app.buttons["Retry"].exists)
  }

  @MainActor
  func testSearchPresentsNativeLoadingStateBeforeDelayedResults() throws {
    let app = launchApp(additionalArguments: ["-InjectLookupDelay"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("think")

    let loading = app.descendants(matching: .any)["search.loading"]
    XCTAssertTrue(loading.waitForExistence(timeout: 2))
    XCTAssertEqual(loading.label, "Searching")

    XCTAssertTrue(resultButton(headword: "思う", in: app).waitForExistence(timeout: 8))
    XCTAssertFalse(loading.exists)
  }

  @MainActor
  func testRapidQueryChangeCancelsStaleSearchWithoutFlashingOldResults() throws {
    let app = launchApp(additionalArguments: ["-InjectLookupDelayQuery", "think"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("think")
    XCTAssertTrue(
      app.descendants(matching: .any)["search.loading"].waitForExistence(timeout: 2))

    app.buttons["Clear text"].tap()
    searchField.typeText("日本")

    let staleResult = resultButton(headword: "思う", in: app)
    let staleResultAppears = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == true"),
      object: staleResult
    )
    staleResultAppears.isInverted = true
    XCTAssertEqual(XCTWaiter.wait(for: [staleResultAppears], timeout: 3.5), .completed)
    XCTAssertTrue(app.buttons["result.japan"].waitForExistence(timeout: 4))
    XCTAssertFalse(staleResult.exists)
    XCTAssertFalse(app.descendants(matching: .any)["search.loading"].exists)
  }

  @MainActor
  func testInflectedRomajiFindsDictionaryForm() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("tabeta")

    let examples = app.buttons["search.examples"]
    XCTAssertTrue(examples.waitForExistence(timeout: 3))
    XCTAssertEqual(examples.label, "View 50+ Example Sentences")
    XCTAssertTrue(examples.isHittable)
    let bestMatchesHeader = app.staticTexts["Best Matches"]
    XCTAssertTrue(bestMatchesHeader.exists)
    XCTAssertLessThan(examples.frame.minY, bestMatchesHeader.frame.minY)
    recordScreenshot(named: "search-results-deinflected-tabeta", app: app)

    let bestMatches = app.buttons.matching(NSPredicate(format: "value BEGINSWITH %@", "Best match"))
    XCTAssertEqual(bestMatches.count, 1)
    XCTAssertTrue(bestMatches.firstMatch.label.hasPrefix("食べる, たべる,"))

    XCTAssertFalse(resultButton(headword: "ベタベタ", in: app).exists)
    XCTAssertFalse(resultButton(headword: "食べるラー油", in: app).exists)
    XCTAssertFalse(app.buttons["search.reading-refinement"].exists)

    examples.tap()
    XCTAssertTrue(app.collectionViews["example-list.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["example.row.0"].exists)
  }

  @MainActor
  func testInflectedRomajiTeFormFindsDictionaryForm() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("makasete")

    let entrust = resultButton(headword: "任せる", in: app)
    XCTAssertTrue(entrust.waitForExistence(timeout: 3))
    XCTAssertTrue(resultButton(headword: "任す", in: app).exists)
    XCTAssertTrue(resultButton(headword: "負かす", in: app).exists)
    XCTAssertTrue(app.staticTexts["to defeat"].exists)
    XCTAssertFalse(app.buttons["search.reading-refinement"].exists)
    recordScreenshot(named: "search-results-deinflected-makasete", app: app)
  }

  @MainActor
  func testMixedScriptShowsDiscoveredWords() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    searchField.typeText("にほんabc")

    XCTAssertTrue(app.staticTexts["Discovered Words"].waitForExistence(timeout: 3))
    let discoveredWords = app.buttons.matching(
      NSPredicate(format: "value BEGINSWITH %@", "Discovered word")
    )
    XCTAssertEqual(discoveredWords.count, 1)
    XCTAssertTrue(discoveredWords.firstMatch.label.hasPrefix("本, ほん,"))
    XCTAssertFalse(resultButton(headword: "日本", in: app).exists)
    XCTAssertFalse(app.staticTexts["Best Matches"].exists)
    XCTAssertFalse(app.staticTexts["Additional Matches"].exists)
    recordScreenshot(named: "search-results-mixed-script-discovered-words", app: app)
  }

  @MainActor
  func testCommonWordDetailShowsStructuredLanguageReferenceDataAndRelatedNavigation() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("見る", in: app, searchField: searchField)

    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 2))
    let miruRuby = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "見る, みる")
    ).firstMatch
    XCTAssertTrue(miruRuby.exists)
    XCTAssertTrue(app.staticTexts["COMMON"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["word-detail.pitch"].exists)
    XCTAssertTrue(app.buttons["word-detail.toolbar-note"].exists)
    XCTAssertFalse(app.buttons["word-detail.toolbar-flashcards"].exists)
    app.buttons["word-detail.toolbar-image"].tap()
    let picker = waitForSystemPhotoPicker(in: app)
    picker.coordinate(withNormalizedOffset: CGVector(dx: 0.10, dy: 0.12)).tap()
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    app.buttons["word-detail.toolbar-note"].tap()
    XCTAssertTrue(app.textFields["word-note.editor"].waitForExistence(timeout: 2))
    app.buttons["word-note.done"].tap()
    for _ in 0..<5 { detail.swipeDown() }
    XCTAssertTrue(app.buttons["word-detail.pronounce"].exists)
    app.buttons["word-detail.pronounce"].tap()
    XCTAssertTrue(app.staticTexts["Ichidan Verb · Transitive Verb"].exists)
    XCTAssertTrue(app.staticTexts["to see, to look, to watch, to view, to observe"].exists)
    recordScreenshot(named: "word-detail-miru-structured-top", app: app)

    let alternative = app.buttons["word-detail.alternative.観る"]
    for _ in 0..<5 where !alternative.exists { detail.swipeUp() }
    XCTAssertTrue(app.staticTexts["ALTERNATIVES"].exists)
    XCTAssertTrue(alternative.exists)
    XCTAssertLessThan(
      app.staticTexts["ALTERNATIVES"].frame.minY,
      app.staticTexts["MEANING"].frame.minY
    )

    let related = app.buttons["word-detail.related.見える"]
    for _ in 0..<5 where !related.exists { detail.swipeUp() }
    XCTAssertTrue(app.staticTexts["RELATED WORDS"].exists)
    XCTAssertTrue(related.exists)
    let addNote = app.buttons["word-detail.add-note"]
    scrollWordDetailElementIntoView(addNote, in: detail, app: app)
    XCTAssertTrue(app.staticTexts["NOTES"].exists)
    XCTAssertTrue(addNote.exists)
    let firstExample = app.descendants(matching: .any)["word-detail.example.0"]
    scrollWordDetailElementIntoView(firstExample, in: detail, app: app)
    XCTAssertTrue(app.staticTexts["EXAMPLES"].exists)
    XCTAssertTrue(firstExample.exists)
    recordScreenshot(named: "word-detail-miru-structured-and-related", app: app)

    scrollElementIntoSafeTapRegion(
      related,
      in: detail,
      app: app,
      searchesBackwardWhenAbsent: true
    )
    related.tap()
    let mieruRuby = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "見える, みえる")
    ).firstMatch
    XCTAssertTrue(mieruRuby.waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["to be seen, to be visible, to be in sight"].exists)
    recordScreenshot(named: "word-detail-related-mieru", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(detail.waitForExistence(timeout: 2))
    scrollElementIntoSafeTapRegion(
      miruRuby,
      in: detail,
      app: app,
      searchesBackwardWhenAbsent: true
    )
    XCTAssertTrue(miruRuby.exists)
  }

  @MainActor
  func testMultipleReadingUncommonAndLinkedAlternativeKanjiClassesArePubliclyOperable() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("蝶々", in: app, searchField: searchField)

    let butterfly = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "蝶々, ちょうちょう")
    ).firstMatch
    XCTAssertTrue(butterfly.waitForExistence(timeout: 3))
    butterfly.tap()
    XCTAssertTrue(app.staticTexts["COMMON"].exists)
    let alternateReading = app.descendants(matching: .any)["word-detail.alternative.ちょうちょ"]
    let butterflyDetail = app.collectionViews["word-detail.screen"]
    for _ in 0..<4 where !alternateReading.exists { butterflyDetail.swipeUp() }
    XCTAssertTrue(alternateReading.exists)
    recordScreenshot(named: "word-detail-choucho-current-source-multiple-readings", app: app)

    tapNativeBack(in: app)
    app.buttons["Clear text"].tap()
    submitSearch("茨", in: app, searchField: searchField)
    let uncommon = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "茨, いばら")
    ).firstMatch
    XCTAssertTrue(uncommon.waitForExistence(timeout: 3))
    uncommon.tap()
    XCTAssertTrue(app.staticTexts["UNMARKED"].exists)
    let uncommonDetail = app.collectionViews["word-detail.screen"]
    let uncommonReading = app.descendants(matching: .any)["word-detail.alternative.イバラ"]
    for _ in 0..<4 where !uncommonReading.exists { uncommonDetail.swipeUp() }
    XCTAssertTrue(uncommonReading.exists)
    recordScreenshot(named: "word-detail-uncommon-multiple-reading-source-class", app: app)

    tapNativeBack(in: app)
    app.buttons["Clear text"].tap()
    submitSearch("いる", in: app, searchField: searchField)
    let kanaVerb = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "いる, いる")
    ).firstMatch
    XCTAssertTrue(kanaVerb.waitForExistence(timeout: 3))
    kanaVerb.tap()

    let linkedKanji = app.buttons["word-detail.alternative.居る"]
    let kanaDetail = app.collectionViews["word-detail.screen"]
    for _ in 0..<4 where !linkedKanji.exists { kanaDetail.swipeUp() }
    XCTAssertTrue(linkedKanji.exists)
    linkedKanji.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    let detailGlyph = app.staticTexts["kanji-detail.glyph"]
    XCTAssertTrue(detailGlyph.waitForExistence(timeout: 2))
    XCTAssertEqual(detailGlyph.label, "居")
    recordScreenshot(named: "word-detail-alternative-kanji-destination", app: app)
  }

  @MainActor
  func testEditedWordNotePersistsWhenTheEntryIsReopened() throws {
    let app = launchApp(additionalArguments: ["-ResetWordNotes"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("問題", in: app, searchField: searchField)
    let problem = app.buttons["result.problem"]
    XCTAssertTrue(problem.waitForExistence(timeout: 3))
    problem.tap()

    let detail = app.collectionViews["word-detail.screen"]
    let problemKanji = app.buttons["word-detail.kanji.問"]
    let topicKanji = app.buttons["word-detail.kanji.題"]
    XCTAssertTrue(problemKanji.waitForExistence(timeout: 2))
    XCTAssertTrue(topicKanji.exists)
    recordScreenshot(named: "word-detail-mondai-primary-kanji", app: app)
    problemKanji.tap()
    XCTAssertTrue(app.collectionViews["kanji-detail.screen"].waitForExistence(timeout: 2))
    let detailGlyph = app.staticTexts["kanji-detail.glyph"]
    XCTAssertTrue(detailGlyph.waitForExistence(timeout: 2))
    XCTAssertEqual(detailGlyph.label, "問")
    tapNativeBack(in: app)
    XCTAssertTrue(detail.waitForExistence(timeout: 2))

    let addNote = app.buttons["word-detail.add-note"]
    scrollWordDetailElementIntoView(addNote, in: detail, app: app)
    addNote.tap()

    let editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    editor.tap()
    editor.typeText("Review this rich noun")
    recordScreenshot(named: "word-note-editor-populated", app: app)
    app.buttons["word-note.done"].tap()
    let editorDismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"),
      object: editor
    )
    XCTAssertEqual(XCTWaiter.wait(for: [editorDismissed], timeout: 10), .completed)
    XCTAssertTrue(app.buttons["word-detail.note"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.buttons["word-detail.note"].label, "Review this rich noun")

    tapNativeBack(in: app)
    let detailDismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"),
      object: detail
    )
    XCTAssertEqual(XCTWaiter.wait(for: [detailDismissed], timeout: 2), .completed)
    XCTAssertTrue(problem.waitForExistence(timeout: 2))
    problem.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 2))
    let restoredNote = app.buttons["word-detail.note"]
    for _ in 0..<8 where !restoredNote.isHittable {
      app.collectionViews["word-detail.screen"].swipeUp()
    }
    XCTAssertTrue(restoredNote.isHittable)
    XCTAssertEqual(restoredNote.label, "Review this rich noun")
    recordScreenshot(named: "word-detail-note-restored-after-navigation", app: app)
  }

  @MainActor
  func testWordNoteCanBeAddedPersistedAcrossColdRelaunchAndDeleted() throws {
    let app = launchApp(additionalArguments: ["-ResetWordNotes"])
    var searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openWordDetail(
      for: "いる",
      resultLabelPrefix: "いる, いる, to be (of animate objects)",
      in: app,
      searchField: searchField
    )

    let detail = app.collectionViews["word-detail.screen"]
    let addNote = app.buttons["word-detail.add-note"]
    for _ in 0..<8 where !addNote.exists { detail.swipeUp() }
    XCTAssertTrue(addNote.exists)
    addNote.tap()

    var editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    XCTAssertEqual(editor.value as? String, "Add Note")
    XCTAssertTrue(app.buttons["word-note.done"].exists)
    dismissSoftwareKeyboard(in: app)
    scrollWordDetailElementIntoView(editor, in: detail, app: app)
    waitForWordNoteCaptureToSettle(in: app)
    recordScreenshot(named: "word-note-editor-empty", app: app)

    editor.tap()
    editor.typeText("Review animate existence")
    let anotherAddNote = app.buttons["word-detail.add-note"]
    XCTAssertTrue(anotherAddNote.exists)
    dismissSoftwareKeyboard(in: app)
    scrollWordDetailElementIntoView(anotherAddNote, in: detail, app: app)
    waitForWordNoteCaptureToSettle(in: app)
    recordScreenshot(named: "word-note-editor-populated", app: app)
    app.buttons["word-note.done"].tap()

    var savedNote = app.buttons["word-detail.note"]
    XCTAssertTrue(savedNote.waitForExistence(timeout: 2))
    XCTAssertEqual(savedNote.label, "Review animate existence")
    XCTAssertTrue(app.buttons["word-detail.add-note"].exists)
    recordScreenshot(named: "word-note-saved", app: app)

    tapNativeBack(in: app)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "いる, いる, to be (of animate objects)")
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 2))
    result.tap()
    savedNote = app.buttons["word-detail.note"]
    scrollWordDetailElementIntoView(
      savedNote,
      in: app.collectionViews["word-detail.screen"],
      app: app
    )
    XCTAssertEqual(savedNote.label, "Review animate existence")

    app.launchArguments.removeAll { $0 == "-ResetWordNotes" }
    app.terminate()
    app.launch()
    searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openWordDetail(
      for: "いる",
      resultLabelPrefix: "いる, いる, to be (of animate objects)",
      in: app,
      searchField: searchField
    )
    savedNote = app.buttons["word-detail.note"]
    scrollWordDetailElementIntoView(
      savedNote,
      in: app.collectionViews["word-detail.screen"],
      app: app
    )
    XCTAssertEqual(savedNote.label, "Review animate existence")
    recordScreenshot(named: "word-note-cold-relaunch-persisted", app: app)

    savedNote.tap()
    editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    editor.tap()
    for _ in 0..<3 {
      guard let value = editor.value as? String, value != "Add Note" else { break }
      editor.typeText(
        String(repeating: XCUIKeyboardKey.delete.rawValue, count: max(value.count, 1))
      )
    }
    let noteCleared = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", "Add Note"),
      object: editor
    )
    XCTAssertEqual(XCTWaiter.wait(for: [noteCleared], timeout: 10), .completed)
    app.buttons["word-note.done"].tap()
    XCTAssertFalse(app.buttons["word-detail.note"].exists)
    XCTAssertTrue(app.buttons["word-detail.add-note"].exists)
    recordScreenshot(named: "word-note-restored-empty", app: app)
  }

  @MainActor
  func testEmptyWordNoteDoneIsANoOpAndBackAutosavesPopulatedText() throws {
    let app = launchApp(additionalArguments: ["-ResetWordNotes"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openWordDetail(
      for: "問題",
      resultLabelPrefix: "問題, もんだい",
      in: app,
      searchField: searchField
    )

    var detail = app.collectionViews["word-detail.screen"]
    var addNote = app.buttons["word-detail.add-note"]
    scrollWordDetailElementIntoView(addNote, in: detail, app: app)
    addNote.tap()
    var editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    app.buttons["word-note.done"].tap()
    XCTAssertFalse(app.buttons["word-detail.note"].exists)
    XCTAssertTrue(addNote.exists)

    addNote.tap()
    editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    editor.tap()
    editor.typeText("Back autosave probe")
    app.swipeRight()

    let problem = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "問題, もんだい")
    ).firstMatch
    XCTAssertTrue(problem.waitForExistence(timeout: 2))
    app.tabBars.buttons["More"].tap()
    XCTAssertTrue(app.staticTexts["More"].waitForExistence(timeout: 2))
    app.tabBars.buttons["Search"].tap()
    XCTAssertTrue(problem.waitForExistence(timeout: 2))
    problem.tap()
    detail = app.collectionViews["word-detail.screen"]
    let restoredNote = app.buttons["word-detail.note"]
    scrollWordDetailElementIntoView(restoredNote, in: detail, app: app)
    XCTAssertEqual(restoredNote.label, "Back autosave probe")
    recordScreenshot(named: "word-note-back-autosaved", app: app)

    restoredNote.tap()
    editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    addNote = app.buttons["word-detail.add-note"]
    XCTAssertTrue(addNote.exists)
    scrollWordDetailElementIntoView(addNote, in: detail, app: app)
    addNote.tap()
    editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    XCTAssertEqual(editor.value as? String, "Add Note")
    editor.tap()
    editor.typeText("Second note")
    app.buttons["word-note.done"].tap()
    tapNativeBack(in: app)

    app.launchArguments.removeAll { $0 == "-ResetWordNotes" }
    app.terminate()
    app.launch()
    let relaunchedSearchField = app.textFields["search.field"]
    XCTAssertTrue(relaunchedSearchField.waitForExistence(timeout: 3))
    openWordDetail(
      for: "問題",
      resultLabelPrefix: "問題, もんだい",
      in: app,
      searchField: relaunchedSearchField
    )
    detail = app.collectionViews["word-detail.screen"]
    let firstNote = app.buttons["word-detail.note"]
    for _ in 0..<8 where !firstNote.isHittable { detail.swipeUp() }
    XCTAssertEqual(firstNote.label, "Back autosave probe")
    XCTAssertEqual(app.buttons["word-detail.note.1"].label, "Second note")
  }

  @MainActor
  func testWordNotesRemainIsolatedAcrossSameSpellingHomographs() throws {
    let app = launchApp(additionalArguments: ["-ResetWordNotes"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("モール", in: app, searchField: searchField)

    let shoppingMall = app.buttons.matching(
      NSPredicate(format: "label CONTAINS %@", "(shopping) mall")
    ).firstMatch
    let moor = app.buttons.matching(
      NSPredicate(format: "label CONTAINS %@", ", Moor")
    ).firstMatch
    XCTAssertTrue(shoppingMall.waitForExistence(timeout: 3))
    XCTAssertTrue(moor.exists)
    shoppingMall.tap()

    var detail = app.collectionViews["word-detail.screen"]
    var addNote = app.buttons["word-detail.add-note"]
    for _ in 0..<8 where !addNote.isHittable { detail.swipeUp() }
    XCTAssertTrue(addNote.isHittable)
    addNote.tap()
    let editor = app.textFields["word-note.editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 2))
    editor.tap()
    editor.typeText("Shopping mall only")
    app.buttons["word-note.done"].tap()
    XCTAssertTrue(app.buttons["word-detail.note"].waitForExistence(timeout: 2))

    tapNativeBack(in: app)
    XCTAssertTrue(moor.waitForExistence(timeout: 2))
    moor.tap()
    detail = app.collectionViews["word-detail.screen"]
    addNote = app.buttons["word-detail.add-note"]
    for _ in 0..<8 where !addNote.isHittable { detail.swipeUp() }
    XCTAssertTrue(addNote.isHittable)
    XCTAssertEqual(addNote.label, "Add Note")
    XCTAssertFalse(app.buttons["word-detail.note"].exists)
    XCTAssertTrue(app.staticTexts["No source-matched examples"].exists)
    recordScreenshot(named: "word-note-homograph-isolation", app: app)
  }

  @MainActor
  func testDedicatedExampleTokenCompactionDoesNotChangeWordDetailTokenHitRegions() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let primaryResult = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(primaryResult.waitForExistence(timeout: 3))
    primaryResult.tap()

    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    let inlineToken = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "word-detail.example-token.")
    ).firstMatch
    for _ in 0..<8 where !inlineToken.exists || !inlineToken.isHittable {
      detail.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(inlineToken.waitForExistence(timeout: 3))
    XCTAssertTrue(inlineToken.isHittable)
    XCTAssertGreaterThanOrEqual(inlineToken.frame.width, 44)
    XCTAssertGreaterThanOrEqual(inlineToken.frame.height, 44)
  }

  @MainActor
  func testRepresentativeExampleSentencesKeepCompactContentNavigationAndSpeech() throws {
    let app = launchApp(
      additionalArguments: [
        "-ExampleSentenceAccessibilityFixtureLimit", "8",
        "-RecordSpeechRequests",
      ]
    )
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    XCTAssertEqual(openExamples.label, "View 50+ Example Sentences")
    openExamples.tap()

    let examples = app.collectionViews["example-list.screen"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    for expected in RepresentativeExampleSentences.rows {
      let row = RepresentativeExampleSentences.reachRow(
        expected,
        requiringSpeaker: expected.index == 7,
        in: app,
        list: examples
      )
      XCTAssertTrue(row.isHittable)
      XCTAssertEqual(
        RepresentativeExampleSentences.japaneseText(for: expected, in: app),
        expected.japanese
      )
      let english = RepresentativeExampleSentences.englishText(for: expected, in: app)
      XCTAssertTrue(english.exists)
      XCTAssertEqual(english.label, expected.english)

      if expected.index == 2 {
        let linkedDrawToken = RepresentativeExampleSentences.linkedDrawToken(in: app)
        XCTAssertTrue(linkedDrawToken.waitForExistence(timeout: 3))
        XCTAssertTrue(linkedDrawToken.isHittable)
        XCTAssertLessThan(linkedDrawToken.frame.width, 44)
        linkedDrawToken.tap()
        XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["draw (in go, poetry contest, etc.), tie"].exists)
        tapNativeBack(in: app)
        XCTAssertTrue(examples.waitForExistence(timeout: 3))
      }
    }

    examples.swipeUp(velocity: .slow)
    XCTAssertFalse(app.descendants(matching: .any)["example.row.8"].exists)
    let speaker = app.buttons["example.speaker.7"]
    XCTAssertTrue(speaker.isHittable)
    speaker.tap()
    let speechRequest = app.descendants(matching: .any)["speech.request"]
    XCTAssertTrue(speechRequest.waitForExistence(timeout: 2))
    XCTAssertEqual(
      speechRequest.label,
      "Speech requested 今いる市民が逃げ出すという事態が危惧されます。"
    )
  }

  @MainActor
  func testExampleSentencesCanBeOpenedScrolledSpokenAndTraversed() throws {
    let app = launchApp(additionalArguments: ["-RecordSpeechRequests"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    XCTAssertEqual(openExamples.label, "View 50+ Example Sentences")
    openExamples.tap()

    let examples = app.collectionViews["example-list.screen"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    XCTAssertTrue(app.staticTexts["いる"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["example.row.0"].exists)
    recordScreenshot(named: "example-sentences-iru-top", app: app)

    let linkedMite = app.buttons["example.token.23.0.見て"]
    for _ in 0..<30
    where !linkedMite.isHittable
      || linkedMite.frame.maxY > app.frame.maxY - 200
    {
      examples.swipeUp()
    }
    Thread.sleep(forTimeInterval: 2)
    XCTAssertTrue(linkedMite.isHittable)
    XCTAssertLessThan(linkedMite.frame.maxY, app.frame.maxY - 200)
    recordScreenshot(named: "example-sentences-iru-scrolled", app: app)

    let speaker = app.buttons["example.speaker.23"]
    XCTAssertTrue(speaker.isHittable)
    speaker.tap()
    let speechRequest = app.descendants(matching: .any)["speech.request"]
    XCTAssertTrue(speechRequest.waitForExistence(timeout: 2))
    XCTAssertEqual(speechRequest.label, "Speech requested 見ているだけだ。")

    XCTAssertTrue(linkedMite.isHittable)
    linkedMite.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["ruby.見る.見=み|る"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["to see, to look, to watch, to view, to observe"].exists)
    recordScreenshot(named: "word-detail-example-token-miru", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(examples.waitForExistence(timeout: 2))
    tapNativeBack(in: app)
    XCTAssertTrue(openExamples.waitForExistence(timeout: 2))
  }

  @MainActor
  func testExampleOnlyPunctuationQueryOpensItsSourceBackedSentence() throws {
    let app = launchApp(additionalArguments: ["-RecordSpeechRequests"])
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("hello-world", in: app, searchField: searchField)

    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    XCTAssertEqual(openExamples.label, "View 2 Example Sentences")
    XCTAssertFalse(app.staticTexts["Best Matches"].exists)
    XCTAssertFalse(app.staticTexts["Additional Matches"].exists)
    openExamples.tap()

    XCTAssertTrue(app.descendants(matching: .any)["example.row.0"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["example.row.1"].exists)
    XCTAssertTrue(app.staticTexts["Hello world."].exists)
    XCTAssertTrue(app.staticTexts["Hello, world!"].exists)
    let linkedWorld = app.buttons["example.token.0.0.世界"]
    XCTAssertTrue(linkedWorld.waitForExistence(timeout: 2))
    let speaker = app.buttons["example.speaker.0"]
    XCTAssertTrue(speaker.exists)
    speaker.tap()
    let speechRequest = app.descendants(matching: .any)["speech.request"]
    XCTAssertTrue(speechRequest.waitForExistence(timeout: 2))
    XCTAssertEqual(speechRequest.label, "Speech requested 世界、こんにちは！")
    recordScreenshot(named: "example-only-hello-world", app: app)

    linkedWorld.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["the world, society, the universe"].exists)
  }

  @MainActor
  func testProductionExamplesOpenScrollAndLinkedWordRemainOperable() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    openExamples.tap()

    let examples = app.collectionViews["example-list.screen"]
    XCTAssertTrue(examples.waitForExistence(timeout: 4))
    let linkedKey = app.buttons["example.token.9.0.鍵"]
    for _ in 0..<8
    where !linkedKey.isHittable || linkedKey.frame.maxY > app.frame.maxY - 200 {
      examples.swipeUp()
    }
    XCTAssertTrue(linkedKey.isHittable)
    XCTAssertLessThan(linkedKey.frame.maxY, app.frame.maxY - 200)
    recordSettledScreenshot(named: "production-examples-linked-key", app: app)

    linkedKey.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.鍵.鍵=かぎ"].exists)
    tapNativeBack(in: app)
    XCTAssertTrue(examples.waitForExistence(timeout: 2))
    tapNativeBack(in: app)
    XCTAssertTrue(openExamples.waitForExistence(timeout: 2))
  }

  @MainActor
  func testProductionSpeechControlsRemainOperableAcrossWordAndExamples() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let primaryResult = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(primaryResult.waitForExistence(timeout: 3))
    primaryResult.tap()
    let detail = app.collectionViews["word-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))

    let wordSpeaker = app.buttons["word-detail.pronounce"]
    XCTAssertTrue(wordSpeaker.isHittable)
    wordSpeaker.tap()
    Thread.sleep(forTimeInterval: 2)
    XCTAssertTrue(wordSpeaker.isHittable)

    let inlineExampleSpeaker = app.buttons["word-detail.example-speaker.1"]
    for _ in 0..<8 where inlineExampleSpeaker.frame.maxY > app.frame.maxY - 120 {
      detail.swipeUp()
    }
    XCTAssertTrue(inlineExampleSpeaker.isHittable)
    inlineExampleSpeaker.tap()
    Thread.sleep(forTimeInterval: 2)
    XCTAssertTrue(inlineExampleSpeaker.isHittable)
    recordSettledScreenshot(named: "production-speech-word-and-example", app: app)

    tapNativeBack(in: app)
    XCTAssertTrue(searchField.waitForExistence(timeout: 2))
    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    openExamples.tap()
    XCTAssertTrue(app.collectionViews["example-list.screen"].waitForExistence(timeout: 4))
    let exampleSpeaker = app.buttons["example.speaker.0"]
    XCTAssertTrue(exampleSpeaker.isHittable)
    exampleSpeaker.tap()
    Thread.sleep(forTimeInterval: 2)
    XCTAssertTrue(exampleSpeaker.isHittable)
    recordSettledScreenshot(named: "production-speech-example-list", app: app)
  }

  @MainActor
  func testWordAndExampleSpeakersCompleteLiveJapaneseSpeech() throws {
    let app = launchApp(additionalArguments: ["-ObserveSpeechPlayback"])
    var previousSpeechInvocation: String?
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch("いる", in: app, searchField: searchField)

    let primaryResult = app.buttons.matching(NSPredicate(format: "value == %@", "Best match 1"))
      .firstMatch
    XCTAssertTrue(primaryResult.waitForExistence(timeout: 3))
    XCTAssertTrue(primaryResult.label.contains("いる"))
    primaryResult.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))

    let wordSpeaker = app.buttons["word-detail.pronounce"]
    XCTAssertTrue(wordSpeaker.isHittable)
    wordSpeaker.tap()
    previousSpeechInvocation = assertSpeechCompletes(
      "いる",
      after: previousSpeechInvocation,
      in: app
    )
    XCTAssertTrue(wordSpeaker.isHittable)
    recordScreenshot(named: "pronunciation-word-after-settle", app: app)

    let detail = app.collectionViews["word-detail.screen"]
    let inlineExampleSpeaker = app.buttons["word-detail.example-speaker.1"]
    for _ in 0..<8 where inlineExampleSpeaker.frame.maxY > app.frame.maxY - 120 {
      detail.swipeUp()
    }
    XCTAssertTrue(inlineExampleSpeaker.isHittable)
    inlineExampleSpeaker.tap()
    previousSpeechInvocation = assertSpeechCompletes(
      "車が要るの？",
      after: previousSpeechInvocation,
      in: app
    )
    XCTAssertTrue(inlineExampleSpeaker.isHittable)
    let detailBack = nativeBackButton(in: app)
    XCTAssertTrue(detailBack.isHittable)
    Thread.sleep(forTimeInterval: 2)
    recordScreenshot(named: "pronunciation-word-example-after-settle", app: app)

    detailBack.tap()
    XCTAssertTrue(searchField.waitForExistence(timeout: 2))

    let openExamples = app.buttons["search.examples"]
    XCTAssertTrue(openExamples.waitForExistence(timeout: 4))
    openExamples.tap()
    XCTAssertTrue(app.collectionViews["example-list.screen"].waitForExistence(timeout: 4))

    let exampleSpeaker = app.buttons["example.speaker.0"]
    XCTAssertTrue(exampleSpeaker.isHittable)
    exampleSpeaker.tap()
    previousSpeechInvocation = assertSpeechCompletes(
      "いる？",
      after: previousSpeechInvocation,
      in: app
    )
    XCTAssertTrue(exampleSpeaker.isHittable)
    recordScreenshot(named: "pronunciation-example-after-settle", app: app)
  }

  @MainActor
  func testIchidanConjugationsSwitchBetweenPlainAndPoliteAndReturnToWordDetail() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openConjugations(
      for: "いる",
      resultLabelPrefix: "いる, いる, to be (of animate objects)",
      in: app,
      searchField: searchField
    )

    XCTAssertTrue(app.collectionViews["conjugations.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.staticTexts["る Verb"].exists)
    XCTAssertTrue(app.buttons["conjugations.mode.plain"].isSelected)
    assertConjugationRows(
      [
        ("present-future", "いる, Present/Future"),
        ("past", "いた, Past"),
        ("negative", "いない, Negative"),
        ("past-negative", "いなかった, Past Negative"),
        ("te-form", "いて, Te-Form"),
        ("potential", "いられる, Potential"),
        ("passive", "いられる, Passive"),
        ("causative", "いさせる, Causative"),
        ("conditional", "いれば, Conditional"),
        ("volitional", "いよう, Volitional"),
        ("imperative", "いろ, Imperative"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-ichidan-plain", app: app)

    app.buttons["conjugations.mode.polite"].tap()
    XCTAssertTrue(app.buttons["conjugations.mode.polite"].isSelected)
    assertConjugationRows(
      [
        ("present-future", "います, Present/Future"),
        ("past", "いました, Past"),
        ("negative", "いません, Negative"),
        ("past-negative", "いませんでした, Past Negative"),
        ("te-form", "いて, Te-Form"),
        ("potential", "いられます, Potential"),
        ("passive", "いられます, Passive"),
        ("causative", "いさせます, Causative"),
        ("conditional", "いれば, Conditional"),
        ("volitional", "いましょう, Volitional"),
        ("imperative", "いなさい, Imperative"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-ichidan-polite", app: app)

    app.buttons["conjugations.mode.plain"].tap()
    XCTAssertEqual(
      app.descendants(matching: .any)["conjugations.row.past"].label,
      "いた, Past"
    )
    tapNativeBack(in: app)
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.descendants(matching: .any)["ruby.いる.いる"].exists)
  }

  @MainActor
  func testGodanConjugationsExposeCapturedPlainAndPoliteForms() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openConjugations(for: "書く", resultLabelPrefix: "書く, かく", in: app, searchField: searchField)

    XCTAssertTrue(app.staticTexts["う Verb"].waitForExistence(timeout: 3))
    assertConjugationRows(
      [
        ("present-future", "書く, Present/Future"),
        ("past", "書いた, Past"),
        ("negative", "書かない, Negative"),
        ("past-negative", "書かなかった, Past Negative"),
        ("te-form", "書いて, Te-Form"),
        ("potential", "書ける, Potential"),
        ("passive", "書かれる, Passive"),
        ("causative", "書かせる, Causative"),
        ("conditional", "書けば, Conditional"),
        ("volitional", "書こう, Volitional"),
        ("imperative", "書け, Imperative"),
      ],
      in: app
    )
    XCTAssertEqual(app.descendants(matching: .any)["conjugations.row.past"].value as? String, "かいた")
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-godan-plain", app: app)

    app.buttons["conjugations.mode.polite"].tap()
    assertConjugationRows(
      [
        ("present-future", "書きます, Present/Future"),
        ("past", "書きました, Past"),
        ("negative", "書きません, Negative"),
        ("past-negative", "書きませんでした, Past Negative"),
        ("te-form", "書いて, Te-Form"),
        ("potential", "書けます, Potential"),
        ("passive", "書かれます, Passive"),
        ("causative", "書かせます, Causative"),
        ("conditional", "書けば, Conditional"),
        ("volitional", "書きましょう, Volitional"),
        ("imperative", "書きなさい, Imperative"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-godan-polite", app: app)
  }

  @MainActor
  func testTsubusuConjugationsKeepEveryAppOwnedFormReadableInPlainAndPoliteModes() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openConjugations(
      for: "潰す",
      resultLabelPrefix: ConjugationUITestSupport.tsubusuResultPrefix,
      in: app,
      searchField: searchField,
      verifyEntry: { ConjugationUITestSupport.assertTsubusuEntry(in: $0) }
    )

    XCTAssertTrue(app.staticTexts["う Verb"].waitForExistence(timeout: 3))
    assertConjugationRows(
      [
        ("present-future", "潰す, Present/Future"),
        ("past", "潰した, Past"),
        ("negative", "潰さない, Negative"),
        ("past-negative", "潰さなかった, Past Negative"),
        ("te-form", "潰して, Te-Form"),
        ("potential", "潰せる, Potential"),
        ("passive", "潰される, Passive"),
        ("causative", "潰させる, Causative"),
        ("conditional", "潰せば, Conditional"),
        ("volitional", "潰そう, Volitional"),
        ("imperative", "潰せ, Imperative"),
      ],
      in: app
    )
    assertConjugationReadings(ConjugationUITestSupport.tsubusuReadings(for: .plain), in: app)
    assertPresentFutureExplanation(in: app)
    recordScreenshot(named: "conjugations-tsubusu-plain", app: app)

    app.buttons["conjugations.mode.polite"].tap()
    assertConjugationRows(
      [
        ("present-future", "潰します, Present/Future"),
        ("past", "潰しました, Past"),
        ("negative", "潰しません, Negative"),
        ("past-negative", "潰しませんでした, Past Negative"),
        ("te-form", "潰して, Te-Form"),
        ("potential", "潰せます, Potential"),
        ("passive", "潰されます, Passive"),
        ("causative", "潰させます, Causative"),
        ("conditional", "潰せば, Conditional"),
        ("volitional", "潰しましょう, Volitional"),
        ("imperative", "潰しなさい, Imperative"),
      ],
      in: app
    )
    assertConjugationReadings(ConjugationUITestSupport.tsubusuReadings(for: .polite), in: app)
    recordScreenshot(named: "conjugations-tsubusu-polite", app: app)
  }

  @MainActor
  func testCapturedSuruAndKuruIrregularConjugationsArePubliclyReachable() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openConjugations(
      for: "する", resultLabelPrefix: "する, する, to do", in: app, searchField: searchField)
    XCTAssertTrue(app.staticTexts["する Verb"].waitForExistence(timeout: 3))
    assertConjugationRows(
      [
        ("present-future", "する, Present/Future"),
        ("past", "した, Past"),
        ("negative", "しない, Negative"),
        ("past-negative", "しなかった, Past Negative"),
        ("te-form", "して, Te-Form"),
        ("potential", "できる, Potential"),
        ("passive", "される, Passive"),
        ("causative", "させる, Causative"),
        ("conditional", "すれば, Conditional"),
        ("volitional", "しよう, Volitional"),
        ("imperative", "しろ, Imperative"),
      ],
      in: app
    )
    app.buttons["conjugations.mode.polite"].tap()
    assertConjugationRows(
      [
        ("present-future", "します, Present/Future"),
        ("past", "しました, Past"),
        ("negative", "しません, Negative"),
        ("past-negative", "しませんでした, Past Negative"),
        ("te-form", "して, Te-Form"),
        ("potential", "できます, Potential"),
        ("passive", "されます, Passive"),
        ("causative", "させます, Causative"),
        ("conditional", "すれば, Conditional"),
        ("volitional", "しましょう, Volitional"),
        ("imperative", "しなさい, Imperative"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-suru-polite", app: app)

    tapNativeBack(in: app)
    tapNativeBack(in: app)
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    app.buttons["Clear text"].tap()
    openConjugations(for: "来る", resultLabelPrefix: "来る, くる", in: app, searchField: searchField)
    XCTAssertTrue(app.staticTexts["Irregular Verb"].waitForExistence(timeout: 3))
    assertConjugationRows(
      [
        ("present-future", "来る, Present/Future"),
        ("past", "来た, Past"),
        ("negative", "来ない, Negative"),
        ("past-negative", "来なかった, Past Negative"),
        ("te-form", "来て, Te-Form"),
        ("potential", "来られる, Potential"),
        ("passive", "来られる, Passive"),
        ("causative", "来させる, Causative"),
        ("conditional", "来れば, Conditional"),
        ("volitional", "来よう, Volitional"),
        ("imperative", "来い, Imperative"),
      ],
      in: app
    )
    XCTAssertEqual(
      app.descendants(matching: .any)["conjugations.row.negative"].value as? String, "こない")
    app.buttons["conjugations.mode.polite"].tap()
    assertConjugationRows(
      [
        ("present-future", "来ます, Present/Future"),
        ("past", "来ました, Past"),
        ("negative", "来ません, Negative"),
        ("past-negative", "来ませんでした, Past Negative"),
        ("te-form", "来て, Te-Form"),
        ("potential", "来られます, Potential"),
        ("passive", "来られます, Passive"),
        ("causative", "来させます, Causative"),
        ("conditional", "来れば, Conditional"),
        ("volitional", "来ましょう, Volitional"),
        ("imperative", "来なさい, Imperative"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-kuru-polite", app: app)
  }

  @MainActor
  func testCapturedAdjectiveFormListsDoNotExposeVerbModeControls() throws {
    let app = launchApp()
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    openConjugations(
      for: "とんでもない",
      resultLabelPrefix: "とんでもない, とんでもない",
      in: app,
      searchField: searchField
    )
    XCTAssertTrue(app.staticTexts["い Adjective"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.descendants(matching: .any)["conjugations.mode"].exists)
    assertConjugationRows(
      [
        ("present-future", "とんでもない, Present/Future"),
        ("past", "とんでもなかった, Past"),
        ("negative", "とんでもなくない, Negative"),
        ("past-negative", "とんでもなくなかった, Past Negative"),
        ("te-form", "とんでもなくて, Te-Form"),
        ("adverb", "とんでもなく, Adverb"),
        ("noun", "とんでもなさ, Noun"),
      ],
      in: app
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-i-adjective", app: app)

    tapNativeBack(in: app)
    tapNativeBack(in: app)
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    app.buttons["Clear text"].tap()
    openConjugations(for: "静か", resultLabelPrefix: "静か, しずか", in: app, searchField: searchField)
    XCTAssertTrue(app.staticTexts["な Adjective"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.descendants(matching: .any)["conjugations.mode"].exists)
    assertConjugationRows(
      [
        ("standalone", "静か, Standalone"),
        ("modifying-a-noun", "静かな, Modifying a Noun"),
        ("te-form", "静かで, Te-Form"),
        ("adverb", "静かに, Adverb"),
        ("noun", "静かさ, Noun"),
      ],
      in: app
    )
    XCTAssertEqual(
      app.descendants(matching: .any)["conjugations.row.modifying-a-noun"].value as? String,
      "しずかな"
    )
    waitForConjugationCaptureToSettle(in: app)
    recordScreenshot(named: "conjugations-na-adjective", app: app)
  }

  @MainActor
  func testJapaneseQueryOpensWordDetailAndBackPreservesResults() throws {
    let app = launchApp()

    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))

    searchField.tap()
    searchField.typeText("問題")

    let bestMatches = app.staticTexts["Best Matches"]
    XCTAssertTrue(bestMatches.waitForExistence(timeout: 2))
    app.keyboards.buttons["Search"].tap()
    let keyboardDismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"),
      object: app.keyboards.firstMatch
    )
    XCTAssertEqual(XCTWaiter.wait(for: [keyboardDismissed], timeout: 2), .completed)
    recordScreenshot(named: "search-results-problem", app: app)

    let primaryResult = app.buttons["result.problem"]
    XCTAssertTrue(primaryResult.exists)
    primaryResult.tap()

    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["question (e.g. on a test), problem"].exists)
    recordScreenshot(named: "word-detail-problem", app: app)

    tapNativeBack(in: app)

    XCTAssertEqual(searchField.value as? String, "問題")
    XCTAssertTrue(bestMatches.exists)
    XCTAssertTrue(primaryResult.exists)
    recordScreenshot(named: "returned-search-results-problem", app: app)
  }

  @MainActor
  private func submitSearch(_ query: String, in app: XCUIApplication, searchField: XCUIElement) {
    searchField.tap()
    searchField.typeText(query)
    app.keyboards.buttons["Search"].tap()
  }

  @MainActor
  @discardableResult
  private func assertSpeechCompletes(
    _ expectedText: String,
    after previousInvocation: String?,
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) -> String {
    let started = app.descendants(matching: .any)["speech.playback.started"]
    let start = XCTNSPredicateExpectation(
      predicate: NSPredicate(
        format: "label == %@ AND value != %@",
        "Speech started \(expectedText)",
        previousInvocation ?? ""
      ),
      object: started
    )
    XCTAssertEqual(XCTWaiter.wait(for: [start], timeout: 5), .completed, file: file, line: line)
    guard let invocation = started.value as? String else {
      XCTFail("Speech start did not expose an invocation and voice", file: file, line: line)
      return ""
    }
    let fields = invocation.split(separator: "|", maxSplits: 1).map(String.init)
    XCTAssertEqual(fields.count, 2, file: file, line: line)
    if fields.count == 2 {
      XCTAssertTrue(fields[1].lowercased().hasPrefix("ja"), file: file, line: line)
    }

    let finished = app.descendants(matching: .any)["speech.playback.finished"]
    let completion = XCTNSPredicateExpectation(
      predicate: NSPredicate(
        format: "label == %@ AND value == %@",
        "Speech finished \(expectedText)",
        invocation
      ),
      object: finished
    )
    XCTAssertEqual(
      XCTWaiter.wait(for: [completion], timeout: 10), .completed, file: file, line: line)
    return invocation
  }

  @MainActor
  private func assertConjugationRows(
    _ expectedRows: [(id: String, label: String)],
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let list = app.collectionViews["conjugations.screen"]
    XCTAssertTrue(list.exists, file: file, line: line)
    let modePicker = app.descendants(matching: .any)["conjugations.mode"]
    let supportsModes = modePicker.exists
    var rowHeights: [CGFloat] = []
    for row in expectedRows {
      let section = ConjugationUITestSupport.reachSection(row.id, in: app, list: list)
      let element = section.row
      guard element.exists else {
        XCTFail("Missing conjugation row \(row.id)", file: file, line: line)
        return
      }
      XCTAssertEqual(element.label, row.label, file: file, line: line)
      ConjugationUITestSupport.assertSectionChrome(section, file: file, line: line)
      rowHeights.append(element.frame.height)
    }
    if let shortestRow = rowHeights.min(), let tallestRow = rowHeights.max() {
      XCTAssertLessThanOrEqual(
        tallestRow - shortestRow,
        24,
        "Conjugation rows should remain in one compact height class unless content wraps",
        file: file,
        line: line
      )
    }

    guard let firstExpectedRow = expectedRows.first else { return }
    ConjugationUITestSupport.restoreTop(
      firstRowID: firstExpectedRow.id,
      requiresModePicker: supportsModes,
      in: app,
      list: list
    )
    let firstRow = app.descendants(matching: .any)[
      "conjugations.row.\(firstExpectedRow.id)"
    ]
    XCTAssertTrue(firstRow.exists, file: file, line: line)
    if supportsModes {
      for _ in 0..<4 where !modePicker.exists || !modePicker.isHittable {
        list.swipeDown(velocity: .slow)
      }
      XCTAssertTrue(modePicker.isHittable, file: file, line: line)
    }
  }

  @MainActor
  private func assertConjugationReadings(
    _ expectedReadings: [ConjugationUITestSupport.ExpectedReading],
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let list = app.collectionViews["conjugations.screen"]
    for expected in expectedReadings {
      let row = ConjugationUITestSupport.reachRow(expected.id, in: app, list: list)
      guard row.exists else {
        XCTFail("Missing conjugation row \(expected.id)", file: file, line: line)
        return
      }
      XCTAssertEqual(row.value as? String, expected.value, file: file, line: line)
    }
    ConjugationUITestSupport.restoreTop(in: app, list: list)
  }

  @MainActor
  private func assertPresentFutureExplanation(
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let info = app.buttons["conjugations.info.present-future"]
    XCTAssertTrue(info.isHittable, file: file, line: line)
    info.tap()

    let explanation = app.staticTexts["conjugations.explanation.present-future"]
    XCTAssertTrue(explanation.waitForExistence(timeout: 3), file: file, line: line)
    XCTAssertEqual(
      explanation.label,
      "The non-past form. It can describe a present habit or fact, or a future action or state.",
      file: file,
      line: line
    )
    let done = app.buttons["conjugations.explanation.done"]
    XCTAssertTrue(done.isHittable, file: file, line: line)
    done.tap()
    XCTAssertTrue(explanation.waitForNonExistence(timeout: 3), file: file, line: line)
  }

  @MainActor
  private func openConjugations(
    for query: String,
    resultLabelPrefix: String,
    in app: XCUIApplication,
    searchField: XCUIElement,
    verifyEntry: ((XCUIApplication) -> Void)? = nil
  ) {
    submitSearch(query, in: app, searchField: searchField)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", resultLabelPrefix)
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    verifyEntry?(app)
    let conjugations = app.buttons["word-detail.conjugations"]
    XCTAssertTrue(conjugations.waitForExistence(timeout: 3))
    conjugations.tap()
    XCTAssertTrue(app.collectionViews["conjugations.screen"].waitForExistence(timeout: 3))
  }

  @MainActor
  private func openWordDetail(
    for query: String,
    resultLabelPrefix: String,
    in app: XCUIApplication,
    searchField: XCUIElement
  ) {
    submitSearch(query, in: app, searchField: searchField)
    let result = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", resultLabelPrefix)
    ).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    XCTAssertTrue(app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3))
  }

  @MainActor
  private func openKanjiDetail(for character: String, in app: XCUIApplication) -> XCUIElement {
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    submitSearch(character, in: app, searchField: searchField)
    let result = app.buttons["result.kanji-primary.\(character)"]
    XCTAssertTrue(result.waitForExistence(timeout: 3))
    result.tap()
    let detail = app.collectionViews["kanji-detail.screen"]
    XCTAssertTrue(detail.waitForExistence(timeout: 3))
    return detail
  }

  @MainActor
  private func scrollWordDetailElementIntoView(
    _ element: XCUIElement,
    in detail: XCUIElement,
    app: XCUIApplication
  ) {
    scrollElementIntoSafeTapRegion(element, in: detail, app: app)
  }

  @MainActor
  private func scrollElementIntoSafeTapRegion(
    _ element: XCUIElement,
    in scrollView: XCUIElement,
    app: XCUIApplication,
    step: CGFloat = 0.25,
    searchesBackwardWhenAbsent: Bool = false
  ) {
    for _ in 0..<16 {
      let lowerBoundary =
        app.keyboards.firstMatch.exists
        ? app.keyboards.firstMatch.frame.minY
        : app.frame.maxY - 120
      if element.exists,
        element.isHittable,
        element.frame.minY >= scrollView.frame.minY + 8,
        element.frame.maxY <= lowerBoundary - 8
      {
        break
      }
      if (element.exists && element.frame.maxY < scrollView.frame.minY + 8)
        || (!element.exists && searchesBackwardWhenAbsent)
      {
        scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4))
          .press(
            forDuration: 0.05,
            thenDragTo: scrollView.coordinate(
              withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4 + step)
            )
          )
      } else {
        scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
          .press(
            forDuration: 0.05,
            thenDragTo: scrollView.coordinate(
              withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - step)
            )
          )
      }
    }
    XCTAssertTrue(element.exists)
    XCTAssertTrue(element.isHittable)
    XCTAssertLessThanOrEqual(element.frame.maxY, app.frame.maxY - 128)
    Thread.sleep(forTimeInterval: 1)
  }

  @MainActor
  private func nativeTabBar(in app: XCUIApplication) -> XCUIElement {
    let tabBar = app.tabBars.firstMatch
    XCTAssertTrue(tabBar.waitForExistence(timeout: 3), "Expected a native tab bar")
    return tabBar
  }

  @MainActor
  private func assertUsesNativeTabSafeArea(
    _ bottomElement: XCUIElement,
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    XCTAssertTrue(bottomElement.waitForExistence(timeout: 3), file: file, line: line)
    let tabBarTop = nativeTabBar(in: app).frame.minY
    XCTAssertLessThanOrEqual(bottomElement.frame.maxY, tabBarTop, file: file, line: line)
  }

  @MainActor
  private func nativeBackButton(in app: XCUIApplication) -> XCUIElement {
    let navigationBar = app.navigationBars.firstMatch
    XCTAssertTrue(navigationBar.waitForExistence(timeout: 3), "Expected a native navigation bar")
    let backButton = navigationBar.buttons.firstMatch
    XCTAssertTrue(backButton.waitForExistence(timeout: 3), "Expected a native Back button")
    return backButton
  }

  @MainActor
  private func tapNativeBack(in app: XCUIApplication) {
    let backButton = nativeBackButton(in: app)
    XCTAssertTrue(backButton.isHittable, "Expected the native Back button to be hittable")
    backButton.tap()
  }

  @MainActor
  private func dismissSoftwareKeyboard(in app: XCUIApplication) {
    let keyboard = app.keyboards.firstMatch
    guard keyboard.exists else { return }
    app.collectionViews["word-detail.screen"].swipeDown()
    let dismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"),
      object: keyboard
    )
    _ = XCTWaiter.wait(for: [dismissed], timeout: 5)
  }

  @MainActor
  private func waitForWordNoteCaptureToSettle(in app: XCUIApplication) {
    let back = nativeBackButton(in: app)
    let done = app.buttons["word-note.done"]
    XCTAssertTrue(back.isHittable)
    XCTAssertTrue(done.isHittable)
    _ = back.label
    _ = done.label
    Thread.sleep(forTimeInterval: 2)
  }

  @MainActor
  private func waitForConjugationCaptureToSettle(in app: XCUIApplication) {
    let back = nativeBackButton(in: app)
    XCTAssertTrue(back.waitForExistence(timeout: 2))
    XCTAssertTrue(back.isHittable)
    _ = back.label
    Thread.sleep(forTimeInterval: 1)
  }

  @MainActor
  private func waitForStrokeOrderCaptureToSettle(in app: XCUIApplication) {
    let overlay = app.otherElements["stroke-order.screen"]
    let close = app.buttons["stroke-order.close"]
    let previous = app.buttons["stroke-order.previous"]
    let play = app.buttons["stroke-order.play"]
    let next = app.buttons["stroke-order.next"]
    XCTAssertTrue(overlay.waitForExistence(timeout: 2))
    XCTAssertTrue(close.isHittable)
    XCTAssertTrue(previous.exists)
    XCTAssertTrue(play.exists)
    XCTAssertTrue(next.exists)
    _ = close.label
    _ = play.label
  }

  @MainActor
  private func openHandwriting(in app: XCUIApplication) -> HandwritingSurface {
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    let mode = app.buttons["search.input.handwriting"]
    XCTAssertTrue(mode.waitForExistence(timeout: 2))
    mode.tap()
    let canvas = app.otherElements["handwriting.canvas"]
    XCTAssertTrue(canvas.waitForExistence(timeout: 2))
    return HandwritingSurface(searchField: searchField, canvas: canvas)
  }

  @MainActor
  private func openRadicals(in app: XCUIApplication) -> RadicalSurface {
    let searchField = app.textFields["search.field"]
    XCTAssertTrue(searchField.waitForExistence(timeout: 3))
    searchField.tap()
    let mode = app.buttons["search.input.radicals"]
    XCTAssertTrue(mode.waitForExistence(timeout: 2))
    mode.tap()
    XCTAssertTrue(app.staticTexts["Select one or more radicals"].waitForExistence(timeout: 2))
    return RadicalSurface(searchField: searchField)
  }

  @MainActor
  private func candidateCount(in candidateStrip: XCUIElement) -> Int {
    guard
      let value = candidateStrip.value as? String,
      let firstWord = value.split(separator: " ").first,
      let count = Int(firstWord)
    else {
      XCTFail("Expected a candidate-count accessibility value")
      return 0
    }
    return count
  }

  private func completedStrokeCount(from progressValue: String?) -> Int {
    guard let first = progressValue?.split(separator: " ").first,
      let count = Int(first)
    else {
      XCTFail("Expected a completed-stroke accessibility value")
      return 0
    }
    return count
  }

  private var isHostedCI: Bool {
    ProcessInfo.processInfo.environment["CI"] == "true"
  }

  private enum RadicalGridNavigationStrategy {
    case searchFromCurrentPosition
    case restoreTopBeforeSearching
  }

  @MainActor
  private func radicalButton(
    _ identifier: String,
    in app: XCUIApplication,
    navigationStrategy: RadicalGridNavigationStrategy = .searchFromCurrentPosition
  ) -> XCUIElement {
    let grid = app.scrollViews["radical.grid"]
    let tabBar = nativeTabBar(in: app)
    let button = app.buttons[identifier]

    func isFullyVisible(_ element: XCUIElement, requireHittable: Bool = true) -> Bool {
      guard element.exists, !requireHittable || element.isHittable else { return false }
      let visibleBottom = min(grid.frame.maxY, tabBar.frame.minY)
      return element.frame.minY >= grid.frame.minY && element.frame.maxY <= visibleBottom
    }

    if isFullyVisible(button) { return button }

    if navigationStrategy == .restoreTopBeforeSearching {
      let topAnchor = app.staticTexts["1 Stroke"]
      if !isFullyVisible(topAnchor, requireHittable: false) {
        for _ in 0..<12 {
          grid.swipeDown(velocity: .fast)
          if isFullyVisible(button) { return button }
          if isFullyVisible(topAnchor, requireHittable: false) { break }
        }
      }
      XCTAssertTrue(
        isFullyVisible(topAnchor, requireHittable: false),
        "Could not restore the radical grid to its 1 Stroke anchor"
      )
    }

    for _ in 0..<32 {
      if isFullyVisible(button) { return button }
      if button.exists, button.frame.minY < grid.frame.minY {
        grid.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42))
          .press(
            forDuration: 0.05,
            thenDragTo: grid.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.58))
          )
        continue
      }
      grid.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
        .press(
          forDuration: 0.05,
          thenDragTo: grid.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.48))
        )
    }
    XCTAssertTrue(button.exists, "Missing radical button \(identifier)")
    return button
  }

  @MainActor
  private func showRecentSearches(in app: XCUIApplication, searchField: XCUIElement) {
    app.buttons["Clear text"].tap()
    searchField.tap()
  }

  @MainActor
  private func representativeRanking(in app: XCUIApplication) -> [String] {
    ["Best match 1", "Additional match 1", "Additional match 2"].map { rank in
      let result = app.buttons.matching(NSPredicate(format: "value == %@", rank)).firstMatch
      XCTAssertTrue(result.waitForExistence(timeout: 2), "Missing representative result at \(rank)")
      return result.label
    }
  }

  @MainActor
  private func resultButton(headword: String, in app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "\(headword),")
    ).firstMatch
  }

  @MainActor
  private func drawSyntheticStroke(in canvas: XCUIElement, from start: CGVector, to end: CGVector) {
    canvas.coordinate(withNormalizedOffset: start)
      .press(forDuration: 0.05, thenDragTo: canvas.coordinate(withNormalizedOffset: end))
  }

  @MainActor
  private func drawSyntheticSun(in canvas: XCUIElement) {
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.25, dy: 0.2), to: CGVector(dx: 0.25, dy: 0.8))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.25, dy: 0.2), to: CGVector(dx: 0.75, dy: 0.2))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.75, dy: 0.2), to: CGVector(dx: 0.75, dy: 0.8))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.25, dy: 0.5), to: CGVector(dx: 0.75, dy: 0.5))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.25, dy: 0.8), to: CGVector(dx: 0.75, dy: 0.8))
  }

  @MainActor
  private func drawSyntheticOrigin(in canvas: XCUIElement) {
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.2, dy: 0.3), to: CGVector(dx: 0.8, dy: 0.3))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.5, dy: 0.15), to: CGVector(dx: 0.5, dy: 0.85))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.48, dy: 0.45), to: CGVector(dx: 0.2, dy: 0.8))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.52, dy: 0.45), to: CGVector(dx: 0.8, dy: 0.8))
    drawSyntheticStroke(
      in: canvas, from: CGVector(dx: 0.3, dy: 0.65), to: CGVector(dx: 0.7, dy: 0.65))
  }

  @MainActor
  private func launchApp(additionalArguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launchArguments += additionalArguments
    app.launch()
    return app
  }

  @MainActor
  private func launchImageTextFixtures(_ names: [String]) -> XCUIApplication {
    var arguments = [
      "-StartImageTextFixtures",
      names.joined(separator: ","),
    ]
    if names.contains("fixture-sparse.png") {
      arguments.append("-InjectSparseImageTextRecognition")
    }
    if names.contains("fixture-vertical.png") {
      arguments.append("-InjectVerticalImageTextRecognition")
    }
    if names.contains("fixture-clear-horizontal.png") {
      arguments.append("-InjectImageTextTranslation")
    }
    return launchApp(additionalArguments: arguments)
  }

  @MainActor
  private func selectImageTextPage(
    named name: String,
    pageCount: Int,
    in app: XCUIApplication
  ) -> Bool {
    let currentPage = app.descendants(matching: .any)["image-text.current-page"]
    let pages = app.collectionViews["image-text.pages"]
    guard currentPage.waitForExistence(timeout: 5) else { return false }
    guard pages.waitForExistence(timeout: 5) else { return false }
    if currentPage.label.contains(name) { return true }

    for _ in 1..<pageCount {
      pages.swipeRight()
    }
    if currentPage.waitForExistence(timeout: 3), currentPage.label.contains(name) { return true }

    for _ in 1..<pageCount {
      pages.swipeLeft()
      if currentPage.waitForExistence(timeout: 3), currentPage.label.contains(name) { return true }
    }
    return false
  }

  @MainActor
  private func stageImageTextFixtures(_ names: [String]) {
    let stager = launchApp(additionalArguments: [
      "-ExportImageTextFixtures",
      names.joined(separator: ","),
    ])
    let save = stager.buttons["Save"]
    XCTAssertTrue(save.waitForExistence(timeout: 5))
    save.tap()
    if stager.buttons["Replace"].waitForExistence(timeout: 1) {
      stager.buttons["Replace"].tap()
    }
    XCTAssertTrue(stager.textFields["search.field"].waitForExistence(timeout: 5))
    stager.terminate()
  }

  @MainActor
  private func scrollUpUntilExists(
    _ element: XCUIElement,
    in container: XCUIElement,
    attempts: Int
  ) {
    for _ in 0..<attempts where !element.exists {
      container.swipeUp(velocity: .slow)
    }
  }

  @MainActor
  private func scrollUpUntilHittable(
    _ element: XCUIElement,
    in container: XCUIElement,
    attempts: Int
  ) {
    for _ in 0..<attempts where !element.isHittable {
      container.swipeUp(velocity: .slow)
    }
  }

  @MainActor
  private func scrollDownUntilHittable(
    _ element: XCUIElement,
    in container: XCUIElement,
    attempts: Int
  ) {
    for _ in 0..<attempts where !element.isHittable {
      container.swipeDown(velocity: .slow)
    }
  }

  @MainActor
  private func recordScreenshot(named name: String, app: XCUIApplication) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  @MainActor
  private func recordSettledScreenshot(named name: String, app: XCUIApplication) {
    for _ in 0..<3 {
      _ = app.screenshot()
      Thread.sleep(forTimeInterval: 1)
    }
    recordScreenshot(named: name, app: app)
  }

  @MainActor
  private func assertImageTextToolbarIsHittable(in app: XCUIApplication) {
    for identifier in ["image-text.close", "image-text.highlights", "image-text.share"] {
      let button = app.buttons[identifier]
      var becameHittable = false
      for _ in 0..<50 {
        if button.exists {
          let frame = button.frame
          if frame.width > 0, frame.height > 0, frame.intersects(app.frame), button.isHittable {
            becameHittable = true
            break
          }
        }
        Thread.sleep(forTimeInterval: 0.1)
      }
      XCTAssertTrue(becameHittable, "Image Text toolbar button did not settle: \(identifier)")
    }
  }

  private func containsJapaneseText(_ value: String) -> Bool {
    value.unicodeScalars.contains { scalar in
      (0x3040...0x30FF).contains(scalar.value)
        || (0x3400...0x9FFF).contains(scalar.value)
    }
  }
}

enum RepresentativeExampleSentences {
  struct Row {
    let index: Int
    let japanese: String
    let english: String
  }

  static let rows = [
    Row(index: 0, japanese: "いる？", english: "Do you want it?"),
    Row(index: 1, japanese: "いるんだろ？", english: "I know you're in here."),
    Row(
      index: 2,
      japanese: "いるだけ持っていらっしゃい。",
      english: "Please take with you as much as you need."
    ),
    Row(index: 3, japanese: "彼いるの？", english: "Do you have a boyfriend?"),
    Row(index: 4, japanese: "今いるところにいなさい。", english: "Stay where you are."),
    Row(
      index: 5,
      japanese: "今いるところにいる方がいいだろう。",
      english: "You may as well stay where you are."
    ),
    Row(
      index: 6,
      japanese: "今いる場所にとどまった方がよさそうだよ。",
      english: "You may as well stay where you are."
    ),
    Row(
      index: 7,
      japanese: "今いる市民が逃げ出すという事態が危惧されます。",
      english: "It is feared that those citizens now present will run away."
    ),
  ]

  @MainActor
  static func reachRow(
    _ expected: Row,
    requiringSpeaker: Bool = false,
    in app: XCUIApplication,
    list: XCUIElement
  ) -> XCUIElement {
    let row = app.descendants(matching: .any)["example.row.\(expected.index)"]
    let speaker = app.buttons["example.speaker.\(expected.index)"]
    for _ in 0..<8
    where !row.exists || !row.isHittable || (requiringSpeaker && !speaker.isHittable) {
      list.swipeUp(velocity: .slow)
    }
    XCTAssertTrue(row.waitForExistence(timeout: 3))
    let firstToken = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "example.token.\(expected.index).")
    ).firstMatch
    XCTAssertTrue(firstToken.waitForExistence(timeout: 12))
    return row
  }

  @MainActor
  static func japaneseText(for expected: Row, in app: XCUIApplication) -> String {
    let prefix = "example.token.\(expected.index)."
    let tokenElements = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", prefix)
    ).allElementsBoundByIndex
    var surfacesByID: [Int: String] = [:]
    for element in tokenElements {
      let suffix = element.identifier.dropFirst(prefix.count)
      let components = suffix.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
      guard components.count == 2, let id = Int(components[0]) else { continue }
      surfacesByID[id] = String(components[1])
    }
    return surfacesByID.sorted { $0.key < $1.key }.map(\.value).joined()
  }

  @MainActor
  static func linkedDrawToken(in app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
        "example.token.2.",
        "持, じ, draw (in go, poetry contest, etc.), tie"
      )
    ).firstMatch
  }

  @MainActor
  static func englishText(for expected: Row, in app: XCUIApplication) -> XCUIElement {
    app.staticTexts["example.english.\(expected.index)"]
  }
}

private struct HandwritingSurface {
  let searchField: XCUIElement
  let canvas: XCUIElement
}

private struct RadicalSurface {
  let searchField: XCUIElement
}
