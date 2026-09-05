import CoreGraphics
import CryptoKit
import XCTest

@testable import SearchExperience

@MainActor
final class ImageTextFlowModelTests: XCTestCase {
  func testRepeatedFixturePreparationPreservesAnExportedFileIdentity() throws {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appending(path: UUID().uuidString)
    try manager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: root) }
    let source = root.appending(path: "fixture.png")
    let directory = root.appending(path: "prepared")
    let bytes = Data([1, 2, 3])
    try bytes.write(to: source)
    try ImageTextTestFixtures.prepareCopies(from: [source], in: directory)
    let destination = directory.appending(path: source.lastPathComponent)
    // Keep the original inode alive, as an active export can, so reuse cannot
    // disguise deleting and recreating the same file.
    let exportedFile = try FileHandle(forReadingFrom: destination)
    defer { try? exportedFile.close() }
    let originalIdentity = try XCTUnwrap(
      manager.attributesOfItem(atPath: destination.path)[.systemFileNumber] as? NSNumber)

    try ImageTextTestFixtures.prepareCopies(from: [source], in: directory)

    XCTAssertEqual(
      try manager.attributesOfItem(atPath: destination.path)[.systemFileNumber] as? NSNumber,
      originalIdentity)
    XCTAssertEqual(try Data(contentsOf: destination), bytes)
    XCTAssertEqual(try exportedFile.readToEnd(), bytes)
  }

  func testFixturePreparationReportsUnavailableSources() throws {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? manager.removeItem(at: root) }
    XCTAssertThrowsError(
      try ImageTextTestFixtures.prepareCopies(
        from: [root.appending(path: "missing.png")], in: root.appending(path: "prepared")))
  }

  func testInstalledTranslationAssetsTranslateWithoutPreparing() async throws {
    let probe = NaturalTranslationProbe()
    let model = ImageTextFlowModel(
      assets: [ImageTextAsset(name: "fixture.png", data: Data([0]))],
      recognitionClient: ImageTextRecognitionClient { _ in
        [
          RecognizedImageTextObservation(
            id: 0,
            text: "日本語",
            boundingBox: CGRect(x: 0, y: 0, width: 1, height: 1),
            confidence: 1
          )
        ]
      },
      textAnalysisClient: .characterFallback,
      translationClient: NaturalTranslationClient(
        availability: { .installed },
        translateInstalled: { source in
          await probe.recordTranslation(source)
          return "Japanese"
        }
      )
    )
    await model.load()

    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .translated("Japanese") = $0 { return true }
      return false
    }

    let translatedSources = await probe.translatedSources()
    XCTAssertEqual(translatedSources, ["日本語"])
    XCTAssertNil(model.pendingTranslationPreparation)
  }

  func testDownloadableTranslationAssetsRequestNativePreparation() async throws {
    let probe = NaturalTranslationProbe()
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .downloadable },
        translateInstalled: { source in
          await probe.recordTranslation(source)
          return "unexpected"
        }
      )
    )
    await model.load()

    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }

    XCTAssertEqual(model.pendingTranslationPreparation?.source, "日本語")
    let translatedSources = await probe.translatedSources()
    XCTAssertTrue(translatedSources.isEmpty)
  }

  func testSuccessfulPreparationResumesTheOriginalTranslationExactlyOnce() async throws {
    let probe = NaturalTranslationProbe()
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .downloadable },
        translateInstalled: { _ in "unexpected installed path" }
      )
    )
    await model.load()
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }
    let session = NaturalTranslationPreparationClient(
      prepare: { await probe.recordPreparation() },
      translate: { source in
        await probe.recordTranslation(source)
        return "Japanese"
      }
    )

    await model.performPendingTranslationPreparation(using: session)
    await model.performPendingTranslationPreparation(using: session)

    guard case .translated(let translation) = model.translationState else {
      return XCTFail("Expected the prepared translation")
    }
    XCTAssertEqual(translation, "Japanese")
    let preparationCount = await probe.preparationCount()
    let translatedSources = await probe.translatedSources()
    XCTAssertEqual(preparationCount, 1)
    XCTAssertEqual(translatedSources, ["日本語"])
  }

  func testCancelledPreparationPreservesImageTextStateAndCanRetry() async throws {
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .downloadable },
        translateInstalled: { _ in "unexpected installed path" }
      )
    )
    await model.load()
    let selectedRegion = ImageTextRegion(
      id: "selected",
      surface: "日本語",
      boundingBox: CGRect(x: 0, y: 0, width: 1, height: 1),
      entry: nil,
      candidateEntries: []
    )
    model.selectedRegion = selectedRegion
    model.showsHighlights = false
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }

    await model.performPendingTranslationPreparation(
      using: NaturalTranslationPreparationClient(
        prepare: { throw CancellationError() },
        translate: { _ in "unexpected" }
      )
    )

    guard case .cancelled = model.translationState else {
      return XCTFail("Expected a retryable cancellation state")
    }
    XCTAssertEqual(model.copiedText, "日本語")
    XCTAssertEqual(model.selectedPage, 0)
    XCTAssertFalse(model.showsHighlights)
    XCTAssertEqual(model.selectedRegion?.id, selectedRegion.id)

    model.retryTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }
    XCTAssertEqual(model.pendingTranslationPreparation?.source, "日本語")
  }

  func testUnsupportedLanguagePairHasItsOwnRecoveryState() async throws {
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .unsupported },
        translateInstalled: { _ in "unexpected" }
      )
    )
    await model.load()

    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .unsupported = $0 { return true }
      return false
    }

    XCTAssertNil(model.pendingTranslationPreparation)
    XCTAssertEqual(model.copiedText, "日本語")
  }

  func testPreparationFailureIsDistinctFromUnsupportedLanguagePair() async throws {
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .downloadable },
        translateInstalled: { _ in "unexpected" }
      )
    )
    await model.load()
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }

    await model.performPendingTranslationPreparation(
      using: NaturalTranslationPreparationClient(
        prepare: { throw NaturalTranslationTestError.preparationFailed },
        translate: { _ in "unexpected" }
      )
    )

    guard case .preparationFailed = model.translationState else {
      return XCTFail("Expected a retryable preparation failure")
    }
    XCTAssertEqual(model.copiedText, "日本語")
  }

  func testRepeatedTranslationTapsCannotStartDuplicateWork() async throws {
    let probe = NaturalTranslationProbe()
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: {
          await probe.recordAvailabilityCheck()
          try await Task.sleep(for: .milliseconds(10))
          return .installed
        },
        translateInstalled: { source in
          await probe.recordTranslation(source)
          return "Japanese"
        }
      )
    )
    await model.load()

    model.requestTranslation()
    model.requestTranslation()
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .translated = $0 { return true }
      return false
    }

    let availabilityChecks = await probe.availabilityCheckCount()
    let translatedSources = await probe.translatedSources()
    XCTAssertEqual(availabilityChecks, 1)
    XCTAssertEqual(translatedSources, ["日本語"])
  }

  func testLeavingImageTextCancelsOwnedWorkAndKeepsRecognitionState() async throws {
    let probe = NaturalTranslationProbe()
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .installed },
        translateInstalled: { source in
          await probe.recordTranslation(source)
          try await Task.sleep(for: .seconds(30))
          return "unexpected"
        }
      )
    )
    await model.load()
    model.showsHighlights = false
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .translating = $0 { return true }
      return false
    }

    model.suspendTranslation()

    guard case .idle = model.translationState else {
      return XCTFail("Leaving Image Text must clear Zenbu-owned translation work")
    }
    XCTAssertEqual(model.copiedText, "日本語")
    XCTAssertFalse(model.showsHighlights)
    XCTAssertNil(model.pendingTranslationPreparation)
  }

  func testLeavingDuringClaimedPreparationInvalidatesTheViewBoundRequest() async throws {
    let model = translationModel(
      client: NaturalTranslationClient(
        availability: { .downloadable },
        translateInstalled: { _ in "unexpected" }
      )
    )
    await model.load()
    model.requestTranslation()
    try await waitForTranslationState(model) {
      if case .preparing = $0 { return true }
      return false
    }
    let request = try XCTUnwrap(model.claimPendingTranslationPreparation())

    model.suspendTranslation()

    guard case .idle = model.translationState else {
      return XCTFail("Leaving during preparation must clear Zenbu-owned state")
    }
    XCTAssertNil(model.pendingTranslationPreparation)
    XCTAssertFalse(model.beginPreparedTranslation(request))
    model.finishPreparedTranslation("stale", for: request)
    guard case .idle = model.translationState else {
      return XCTFail("A stale view-bound session must not publish after navigation")
    }
    XCTAssertEqual(model.copiedText, "日本語")
  }

  func testInstalledAssetsTranslateAcrossFreshImageTextModelsWithoutNetworkWork() async throws {
    let probe = NaturalTranslationProbe()
    let client = NaturalTranslationClient(
      availability: { .installed },
      translateInstalled: { source in
        await probe.recordTranslation(source)
        return "Japanese"
      }
    )

    for _ in 0..<2 {
      let model = translationModel(client: client)
      await model.load()
      model.requestTranslation()
      try await waitForTranslationState(model) {
        if case .translated("Japanese") = $0 { return true }
        return false
      }
    }

    let translatedSources = await probe.translatedSources()
    XCTAssertEqual(translatedSources, ["日本語", "日本語"])
  }

  func testSelectedSharePayloadTracksTheSelectedPageNameBytesAndIdentity() throws {
    let firstID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000001"))
    let secondID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000002"))
    let firstBytes = try imageTextFixtureData(named: "fixture-clear-horizontal.png")
    let secondBytes = try imageTextFixtureData(named: "fixture-vertical.png")
    XCTAssertEqual(
      firstBytes.fixtureSHA256,
      "f7eaa0d29ea9074aebada7e06c6d43de0a8f3e6ac62570e706c1d71c1f3eabf4"
    )
    XCTAssertEqual(
      secondBytes.fixtureSHA256,
      "ff2a1f79d147f15d787bc2216f9932f3e6e1989f0350536d983942746ab97882"
    )
    let model = ImageTextFlowModel(
      assets: [
        ImageTextAsset(id: firstID, name: "first.png", data: firstBytes),
        ImageTextAsset(id: secondID, name: "second.png", data: secondBytes),
      ],
      recognitionClient: ImageTextRecognitionClient { _ in [] },
      textAnalysisClient: .characterFallback,
      translationClient: NaturalTranslationClient { _ in "" }
    )

    let firstPayload = try XCTUnwrap(model.selectedSharePayload)
    XCTAssertEqual(firstPayload.id, firstID)
    XCTAssertEqual(firstPayload.name, "first.png")
    XCTAssertEqual(firstPayload.data, firstBytes)

    model.selectPage(1)

    let secondPayload = try XCTUnwrap(model.selectedSharePayload)
    XCTAssertEqual(secondPayload.id, secondID)
    XCTAssertEqual(secondPayload.name, "second.png")
    XCTAssertEqual(secondPayload.data, secondBytes)
    XCTAssertNotEqual(secondPayload.data, firstPayload.data)
  }

  func testVerticalRecognitionKeepsOnlyDefensibleLinkedRegions() async throws {
    let observations = verticalObservations()
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: observations, lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    XCTAssertEqual(page.observations.map(\.text), observations.map(\.text))
    let japanese = try XCTUnwrap(page.regions.first { $0.surface == "日本語" })
    XCTAssertEqual(japanese.entry?.id.rawValue, "c81e1608bebbf039176be3e23f1c03bb")
    XCTAssertEqual(japanese.entry?.summary, "Japanese (language)")
    XCTAssertFalse(page.regions.contains { $0.surface == "読む" })
    XCTAssertFalse(page.regions.contains { $0.surface == "読本" })
    XCTAssertFalse(page.regions.contains { $0.surface == "いる" })
    XCTAssertFalse(page.regions.contains { $0.entry?.headword == "要る" })
  }

  func testWholeObservationWithAmbiguousAppOwnedEntriesKeepsASelectableRegion() async throws {
    let observation = RecognizedImageTextObservation(
      id: 0,
      text: "読本",
      boundingBox: CGRect(x: 0.2, y: 0.3, width: 0.4, height: 0.2),
      confidence: 1
    )
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: [observation], lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    let region = try XCTUnwrap(page.regions.first)
    XCTAssertEqual(region.surface, "読本")
    XCTAssertEqual(region.boundingBox, observation.boundingBox)
    XCTAssertNil(region.entry)
    XCTAssertEqual(Set(region.candidateEntries.map(\.reading)), ["とくほん", "よみほん"])
  }

  func testRecognizedTextWithoutAnExactLinkedCandidateRemainsUnlinked() async throws {
    let observation = RecognizedImageTextObservation(
      id: 0,
      text: "龘龘",
      boundingBox: CGRect(x: 0.3, y: 0.4, width: 0.4, height: 0.2),
      confidence: 1
    )
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: [observation], lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    XCTAssertEqual(page.observations, [observation])
    XCTAssertTrue(page.regions.isEmpty)
  }

  func testCompleteLongerRecognizedFormIsNotSplitIntoIru() async throws {
    let observation = RecognizedImageTextObservation(
      id: 0,
      text: "道具を用いる。",
      boundingBox: CGRect(x: 0.2, y: 0.2, width: 0.15, height: 0.65),
      confidence: 1,
      characterBoxes: (0..<7).map { index in
        CGRect(x: 0.2 + CGFloat(index) * 0.02, y: 0.2, width: 0.02, height: 0.65)
      }
    )
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: [observation], lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    let completeForm = try XCTUnwrap(page.regions.first { $0.surface == "用いる" })
    XCTAssertEqual(completeForm.boundingBox.minX, 0.26, accuracy: 0.000_001)
    XCTAssertEqual(completeForm.boundingBox.minY, 0.20, accuracy: 0.000_001)
    XCTAssertEqual(completeForm.boundingBox.width, 0.06, accuracy: 0.000_001)
    XCTAssertEqual(completeForm.boundingBox.height, 0.65, accuracy: 0.000_001)
    XCTAssertFalse(page.regions.contains { $0.surface == "いる" })
  }

  func testPartialTokenWithoutProviderCharacterPolygonsDoesNotFabricateABox() async throws {
    let observation = RecognizedImageTextObservation(
      id: 0,
      text: "これは日本語。",
      boundingBox: CGRect(x: 0.2, y: 0.4, width: 0.6, height: 0.1),
      confidence: 1
    )
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: [observation], lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    XCTAssertFalse(page.regions.contains { $0.surface == "日本語" })
  }

  private func imageTextModel(
    observations: [RecognizedImageTextObservation],
    lookup: LookupClient
  ) -> ImageTextFlowModel {
    ImageTextFlowModel(
      assets: [ImageTextAsset(name: "fixture.png", data: Data([0]))],
      recognitionClient: ImageTextRecognitionClient { _ in observations },
      textAnalysisClient: .resolving(
        morphologyClient: JapaneseMorphologyClient { text in
          let specifications: [(String, String, String)]
          switch text {
          case "日本語":
            specifications = [("日本語", "日本語", "名詞")]
          case "を読む。":
            specifications = [
              ("を", "を", "助詞"), ("読む", "読む", "動詞"), ("。", "。", "補助記号"),
            ]
          case "道具を用いる。":
            specifications = [
              ("道具", "道具", "名詞"), ("を", "を", "助詞"),
              ("用いる", "用いる", "動詞"), ("。", "。", "補助記号"),
            ]
          case "これは日本語。":
            specifications = [
              ("これ", "此れ", "代名詞"), ("は", "は", "助詞"),
              ("日本語", "日本語", "名詞"), ("。", "。", "補助記号"),
            ]
          case "読本":
            specifications = [("読本", "読本", "名詞")]
          default:
            specifications = [(text, text, "未知語")]
          }
          var offset = 0
          let candidates = specifications.map { surface, lemma, pos in
            let count = surface.unicodeScalars.count
            defer { offset += count }
            return JapaneseMorphologyCandidate(
              surface: surface,
              scalarRange: offset..<(offset + count),
              dictionaryForm: lemma,
              normalizedForm: lemma,
              reading: "",
              partOfSpeech: [pos],
              isOutOfVocabulary: pos == "未知語",
              children: []
            )
          }
          return JapaneseMorphologyAnalysis(
            transcript: text,
            candidates: candidates,
            engine: "frozen-test-provider",
            engineVersion: "1",
            dictionary: "independent test truth",
            dictionarySHA256: "fixture"
          )
        },
        lookupClient: lookup
      ),
      translationClient: NaturalTranslationClient { _ in "" }
    )
  }

  private func translationModel(client: NaturalTranslationClient) -> ImageTextFlowModel {
    ImageTextFlowModel(
      assets: [ImageTextAsset(name: "fixture.png", data: Data([0]))],
      recognitionClient: ImageTextRecognitionClient { _ in
        [
          RecognizedImageTextObservation(
            id: 0,
            text: "日本語",
            boundingBox: CGRect(x: 0, y: 0, width: 1, height: 1),
            confidence: 1
          )
        ]
      },
      textAnalysisClient: .characterFallback,
      translationClient: client
    )
  }

  private func loadedPage(_ state: ImageTextFlowModel.PageState) throws -> ImageTextPage {
    guard case .loaded(let page) = state else {
      XCTFail("Expected the recognition page to load")
      throw ImageTextFlowModelTestError.pageDidNotLoad
    }
    return page
  }

  private func verticalObservations() -> [RecognizedImageTextObservation] {
    [
      RecognizedImageTextObservation(
        id: 0,
        text: "春の朝、静かな庭を",
        boundingBox: CGRect(x: 0.72, y: 0.2, width: 0.16, height: 0.66),
        confidence: 1
      ),
      RecognizedImageTextObservation(
        id: 1,
        text: "蝶々が飛んでいる。",
        boundingBox: CGRect(x: 0.52, y: 0.25, width: 0.16, height: 0.61),
        confidence: 1
      ),
      RecognizedImageTextObservation(
        id: 2,
        text: "日本語",
        boundingBox: CGRect(x: 0.27, y: 0.48, width: 0.08, height: 0.30),
        confidence: 1
      ),
      RecognizedImageTextObservation(
        id: 3,
        text: "を読む。",
        boundingBox: CGRect(x: 0.14, y: 0.38, width: 0.08, height: 0.40),
        confidence: 1
      ),
    ]
  }
}

private actor NaturalTranslationProbe {
  private var sources: [String] = []
  private var preparations = 0
  private var availabilityChecks = 0

  func recordAvailabilityCheck() {
    availabilityChecks += 1
  }

  func availabilityCheckCount() -> Int {
    availabilityChecks
  }

  func recordPreparation() {
    preparations += 1
  }

  func preparationCount() -> Int {
    preparations
  }

  func recordTranslation(_ source: String) {
    sources.append(source)
  }

  func translatedSources() -> [String] {
    sources
  }
}

@MainActor
private func waitForTranslationState(
  _ model: ImageTextFlowModel,
  where predicate: (ImageTextFlowModel.TranslationState) -> Bool
) async throws {
  for _ in 0..<500 {
    if predicate(model.translationState) { return }
    try await Task.sleep(for: .milliseconds(1))
  }
  XCTFail("Timed out waiting for translation state")
}

extension Data {
  fileprivate var fixtureSHA256: String {
    SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
  }
}

private func imageTextFixtureData(named name: String) throws -> Data {
  let filename = name.dropLast(4)
  let url = try XCTUnwrap(
    Bundle.main.url(
      forResource: String(filename),
      withExtension: "png",
      subdirectory: "ImageTextFixtures"
    )
  )
  return try Data(contentsOf: url)
}

private enum ImageTextFlowModelTestError: Error {
  case pageDidNotLoad
}

private enum NaturalTranslationTestError: Error {
  case preparationFailed
}
