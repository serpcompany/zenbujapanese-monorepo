import CoreGraphics
import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Which text is Japanese")
struct WrittenLanguageTests {
  @Test(
    "typed text is Japanese when it has kana or kanji, English when it has only Latin letters",
    arguments: [
      ("駅まで歩いて何分ですか？", "ja"),
      ("トイレはどこですか", "ja"),
      ("Suicaカードはどこで買えますか", "ja"),
      ("ｶﾀｶﾅ", "ja"),
      ("Where can I buy a Suica card?", "en"),
      ("how much is this?", "en"),
    ])
  func typedLanguage(text: String, language: String) {
    #expect(PresentationCore.shared.writtenLanguage(text) == language)
  }

  @Test("text without letters has no language")
  func noLanguage() {
    #expect(PresentationCore.shared.writtenLanguage("  123 ？！ ") == nil)
  }

  @Test("Image Search keeps a line, and marks a word, only where the core reads Japanese")
  func imageSearchKeepsWhatTheCoreReadsAsJapanese() async throws {
    let texts = ["\u{20BB7}", "々", "ｶﾀｶﾅ", "\u{4DC0}", "\u{20BB7}野家"]
    let observations = texts.enumerated().map { index, text in
      RecognizedImageTextObservation(
        id: index, text: text,
        boundingBox: CGRect(x: 0.8 - Double(index) * 0.1, y: 0.1, width: 0.05, height: 0.8),
        confidence: 1, isVertical: true)
    }
    let model = ImageTextFlowModel(
      assets: [ImageTextAsset(name: "page", data: Data())],
      recognitionClient: ImageTextRecognitionClient { _ in observations },
      textAnalysisClient: .eachLineOneWord,
      translationClient: NaturalTranslationClient(
        availability: { .installed }, translateAllInstalled: { _ in [:] }))
    await model.load()
    let page = try #require(model.selectedLoadedPage)
    let japanese = ["々", "ｶﾀｶﾅ", "\u{20BB7}野家"]
    #expect(page.lines.map(\.text) == japanese)
    #expect(page.regions.map(\.surface) == japanese)
    #expect(texts.filter(PresentationCore.shared.containsJapaneseText) == japanese)
  }

  @Test("the first recognition pass found Japanese only when the core reads Japanese in a line")
  func firstPassFindsWhatTheCoreReadsAsJapanese() {
    for text in ["\u{20BB7}", "\u{4DC0}", "Sale 50%"] {
      #expect(!ImageTextRecognitionClient.foundJapanese(inTopCandidates: [text]))
    }
    for text in ["々", "ｶﾀｶﾅ", "\u{20BB7}野家"] {
      #expect(ImageTextRecognitionClient.foundJapanese(inTopCandidates: ["Sale 50%", text]))
    }
  }
}
