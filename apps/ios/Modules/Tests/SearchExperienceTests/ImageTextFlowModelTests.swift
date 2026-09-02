import CoreGraphics
import XCTest

@testable import SearchExperience

@MainActor
final class ImageTextFlowModelTests: XCTestCase {
  func testVerticalRecognitionKeepsOnlyDefensibleLinkedRegions() async throws {
    let observations = verticalObservations()
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: observations, lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    XCTAssertEqual(page.observations.map(\.text), observations.map(\.text))
    let japanese = try XCTUnwrap(page.regions.first { $0.surface == "日本語" })
    XCTAssertEqual(japanese.entry.id.rawValue, "c81e1608bebbf039176be3e23f1c03bb")
    XCTAssertEqual(japanese.entry.summary, "Japanese (language)")
    let read = try XCTUnwrap(page.regions.first { $0.surface == "読む" })
    XCTAssertEqual(read.entry.id.rawValue, "132ec115831c1cda3588d31e99b30ead")
    XCTAssertEqual(read.entry.summary, "to read")
    XCTAssertFalse(page.regions.contains { $0.surface == "読本" })
    XCTAssertFalse(page.regions.contains { $0.surface == "いる" })
    XCTAssertFalse(page.regions.contains { $0.entry.headword == "要る" })
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
      confidence: 1
    )
    let lookup = LookupClient.freshBundledDatabase()
    let model = imageTextModel(observations: [observation], lookup: lookup)

    await model.load()

    let page = try loadedPage(model.pages[0].state)
    XCTAssertTrue(page.regions.contains { $0.surface == "用いる" })
    XCTAssertFalse(page.regions.contains { $0.surface == "いる" })
  }

  private func imageTextModel(
    observations: [RecognizedImageTextObservation],
    lookup: LookupClient
  ) -> ImageTextFlowModel {
    ImageTextFlowModel(
      assets: [ImageTextAsset(name: "fixture.png", data: Data([0]))],
      recognitionClient: ImageTextRecognitionClient { _ in observations },
      textAnalysisClient: .live(lookupClient: lookup),
      translationClient: NaturalTranslationClient { _ in "" }
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

private enum ImageTextFlowModelTestError: Error {
  case pageDidNotLoad
}
