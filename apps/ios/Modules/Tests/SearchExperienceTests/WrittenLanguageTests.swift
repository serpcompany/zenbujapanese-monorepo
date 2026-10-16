import CoreGraphics
import Foundation
import Testing
import os

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
      ("\u{4DC0}", "ja"),
      ("\u{20BB7}", "ja"),
      ("Where can I buy a Suica card?", "en"),
      ("how much is this?", "en"),
    ])
  func typedLanguage(text: String, language: String) {
    #expect(PresentationCore.shared.writtenLanguage(text) == language)
  }

  @Test("an answer the core couldn't give is asked for again, as the Japanese-text runs are")
  func aFailedAnswerIsAskedAgain() {
    let reads = OSAllocatedUnfairLock(initialState: 0)
    let core = PresentationCore(kanji: {
      let first = reads.withLock { count in
        count += 1
        return count == 1
      }
      return first ? nil : KanjiFiles.bundled
    })
    let unread = core.rubySegments(surface: "日本", reading: "にほん")
    #expect(unread == [JapaneseRubySegment(base: "日本", reading: nil, kanjiReadings: nil)])
    #expect(core.rubySegments(surface: "日本", reading: "にほん") != unread)
    #expect(core.containsJapaneseText("日本"))
  }

  @Test("text without letters has no language")
  func noLanguage() {
    #expect(PresentationCore.shared.writtenLanguage("  123 ？！ ") == nil)
    #expect(PresentationCore.shared.writtenLanguage("ＳＵＩＣＡ") == nil)
  }

  @Test("Image Search keeps a line, and marks a word, only where the core reads Japanese")
  func imageSearchKeepsWhatTheCoreReadsAsJapanese() async throws {
    let texts = ["\u{20BB7}", "々", "ｶﾀｶﾅ", "Sale 50%", "\u{4DC0}", "\u{20BB7}野家"]
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
    let japanese = texts.filter { $0 != "Sale 50%" }
    #expect(page.lines.map(\.text) == japanese)
    #expect(page.regions.map(\.surface) == japanese)
  }

  @Test("the first recognition pass found Japanese only when the core reads Japanese in a line")
  func firstPassFindsWhatTheCoreReadsAsJapanese() {
    #expect(!ImageTextRecognitionClient.foundJapanese(inTopCandidates: ["Sale 50%", "ＳＵＩＣＡ"]))
    for text in ["々", "ｶﾀｶﾅ", "\u{4DC0}", "\u{20BB7}", "\u{20BB7}野家"] {
      #expect(ImageTextRecognitionClient.foundJapanese(inTopCandidates: ["Sale 50%", text]))
    }
  }

  @Test(
    "a scalar at either edge of a run some old check counted is Japanese wherever the app asks",
    arguments: [
      0x3005, 0x3006, 0x3040, 0x3041, 0x309F, 0x30A0, 0x30FF, 0x31F0, 0x31FF, 0x3400, 0x4DBF,
      0x4DC0, 0x4DFF, 0x4E00, 0x9FFF, 0xF900, 0xFAFF, 0xFF66, 0xFF9F, 0x20000, 0x2FA1F,
    ])
  func everyEdgeOfAnOldRunIsJapanese(scalar: UInt32) throws {
    let text = String(try #require(Unicode.Scalar(scalar)))
    #expect(PresentationCore.shared.containsJapaneseText(text))
    #expect(ImageTextRecognitionClient.foundJapanese(inTopCandidates: [text]))
    #expect(PresentationCore.shared.writtenLanguage(text) == "ja")
  }

  @Test(
    "a scalar just outside the runs the old checks counted is not Japanese wherever the app asks",
    arguments: [
      0x3004, 0x3007, 0x303F, 0x3100, 0x31EF, 0x3200, 0x33FF, 0xA000, 0xF8FF, 0xFB00, 0xFF65,
      0xFFA0, 0x1FFFF, 0x2FA20,
    ])
  func scalarsOutsideTheRunsAreNotJapanese(scalar: UInt32) throws {
    let text = String(try #require(Unicode.Scalar(scalar)))
    #expect(!PresentationCore.shared.containsJapaneseText(text))
    #expect(!ImageTextRecognitionClient.foundJapanese(inTopCandidates: [text]))
    #expect(PresentationCore.shared.writtenLanguage(text) == nil)
  }
}
