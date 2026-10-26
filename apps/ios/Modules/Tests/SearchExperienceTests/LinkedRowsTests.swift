import Foundation
import Testing
import TranslatorCore
import os

@testable import SearchExperience

@MainActor
@Suite("Rows whose words arrive linked", .timeLimit(.minutes(1)))
struct LinkedRowsTests {
  private struct Recording {
    let asked = OSAllocatedUnfairLock(initialState: [[String]]())

    var analysis: JapaneseTextAnalysisClient {
      let asked = asked
      return JapaneseTextAnalysisClient(
        availability: { .full },
        linkedTexts: { texts, _ in
          asked.withLock { $0.append(texts) }
          return texts.map(JapaneseTextToken.unlinked)
        },
        countedWords: { _ in [] })
    }

    var calls: [[String]] { asked.withLock { $0 } }
  }

  private static let captions = (1...60).map { "字幕\($0)" }

  @Test("captions link the screen's worth first, then the rest a page at a time, each once")
  func captionsLinkInPages() async {
    let recording = Recording()
    let lines = LinkedLines()
    await lines.begin(Self.captions, showing: 8, using: recording.analysis)
    #expect(lines.words.count == 8)
    #expect(lines.linksMore)
    await lines.linkTheRest(using: recording.analysis)
    #expect(lines.words.map { $0.map(\.surface) } == Self.captions.map { [$0] })
    #expect(!lines.linksMore)
    #expect(recording.calls.map(\.count) == [8, 25, 25, 2])

    await lines.begin(Self.captions, showing: 8, using: recording.analysis)
    #expect(recording.calls.count == 4)
    await lines.begin(["別の動画"], showing: 8, using: recording.analysis)
    #expect(lines.words.map { $0.map(\.surface) } == [["別の動画"]])
  }

  @Test("Image Search links every line and paragraph of a page in one call before it shows")
  func imageSearchLinksItsPageAtOnce() async throws {
    let recording = Recording()
    let observations = ["駅の近くに", "本屋があります", "営業中"].enumerated().map { index, text in
      RecognizedImageTextObservation(
        id: index, text: text,
        boundingBox: CGRect(x: 0.1, y: 0.9 - Double(index) * 0.1, width: 0.8, height: 0.05),
        confidence: 1, isVertical: false)
    }
    let model = ImageTextFlowModel(
      assets: [ImageTextAsset(name: "page", data: Data())],
      recognitionClient: ImageTextRecognitionClient { _ in observations },
      textAnalysisClient: recording.analysis,
      translationClient: NaturalTranslationClient(
        availability: { .installed }, translateAllInstalled: { _ in [:] }))
    await model.load()
    let page = try #require(model.selectedLoadedPage)
    #expect(recording.calls == [page.shownTexts])
    for text in page.lines.map(\.text) + page.paragraphs.map(\.text) {
      #expect(page.words(of: text).map(\.surface) == [text])
    }
  }

  @Test("Translate links a sentence's Japanese once, and shows English as it is")
  func translateLinksItsJapanese() async {
    let recording = Recording()
    let texts = LinkedTexts()
    let spoken = TranslatedSentence(text: "こんにちは", translation: "Hello")
    let heard = TranslatedSentence(text: "Thank you", translation: "ありがとう")
    #expect(!texts.isReady(spoken, spokenIn: .japanese))
    #expect(!texts.isReady(heard, spokenIn: .english))
    let linking = texts.request([(spoken, .japanese), (heard, .english)], using: recording.analysis)
    #expect(texts.request([(spoken, .japanese)], using: recording.analysis) == nil)
    await linking?.value
    #expect(texts.isReady(spoken, spokenIn: .japanese))
    #expect(texts.isReady(heard, spokenIn: .english))
    #expect(recording.calls == [["こんにちは", "ありがとう"]])
    guard case .plain = texts.shown("Thank you", in: .english) else {
      Issue.record("English was linked")
      return
    }
  }
}
