import CoreGraphics
import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Image text translation")
struct ImageTextTranslationTests {
  /// Two columns of one sentence and a short list item: three lines, two paragraphs.
  private let observations = [
    RecognizedImageTextObservation(
      id: 0, text: "家族って「ある」ものじゃ",
      boundingBox: CGRect(x: 0.8, y: 0.1, width: 0.05, height: 0.8), confidence: 1,
      isVertical: true),
    RecognizedImageTextObservation(
      id: 1, text: "なかった。",
      boundingBox: CGRect(x: 0.7, y: 0.1, width: 0.05, height: 0.8), confidence: 1,
      isVertical: true),
    RecognizedImageTextObservation(
      id: 2, text: "背水の陣",
      boundingBox: CGRect(x: 0.6, y: 0.5, width: 0.05, height: 0.4), confidence: 1,
      isVertical: true),
    RecognizedImageTextObservation(
      id: 3, text: "The Clock of Life",
      boundingBox: CGRect(x: 0.1, y: 0.02, width: 0.6, height: 0.04), confidence: 1),
  ]

  @Test("one pass translates every paragraph and line, skipping English")
  func translatesParagraphsAndLines() async throws {
    let requested = LockedValue<[String]>([])
    let model = ImageTextFlowModel(
      assets: [ImageTextAsset(name: "page", data: Data())],
      recognitionClient: ImageTextRecognitionClient { [observations] _ in observations },
      textAnalysisClient: .characterFallback,
      translationClient: NaturalTranslationClient(
        availability: { .installed },
        translateAllInstalled: { sources in
          requested.set(sources)
          return Dictionary(uniqueKeysWithValues: sources.map { ($0, "EN:" + $0) })
        }
      )
    )
    await model.load()
    let page = try #require(model.selectedLoadedPage)
    #expect(page.lines.map(\.text) == ["家族って「ある」ものじゃ", "なかった。", "背水の陣"])
    #expect(page.paragraphs.map(\.text) == ["家族って「ある」ものじゃなかった。", "背水の陣"])

    model.requestTranslation()
    while model.translation(of: "背水の陣") == nil { await Task.yield() }

    #expect(!requested.get().contains("The Clock of Life"))
    #expect(model.translation(of: "家族って「ある」ものじゃなかった。") == "EN:家族って「ある」ものじゃなかった。")
    #expect(model.translation(of: "なかった。") == "EN:なかった。")
  }
}

private final class LockedValue<Value: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value
  init(_ value: Value) { self.value = value }
  func get() -> Value { lock.withLock { value } }
  func set(_ newValue: Value) { lock.withLock { value = newValue } }
}
