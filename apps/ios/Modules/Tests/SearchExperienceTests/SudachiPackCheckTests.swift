import Foundation
import Testing

@testable import SearchExperience

@Suite("The check the app runs on Sudachi's pack before using it")
struct SudachiPackCheckTests {
  private static let goldenSentence = "日本語を用いる。"

  private static func goldenAnalysis() async throws -> JapaneseMorphologyAnalysis {
    let analyzer = try await SudachiBuildCache.analyzer()
    return try await apartFromThePool { try analyzer.analyze(goldenSentence) }
  }

  @Test("the pinned dictionary passes it, so the app's bundled pack is used")
  func pinnedDictionaryPasses() async throws {
    let dictionary = try await SudachiBuildCache.dictionary.value
    try await apartFromThePool {
      try LanguageTechnologyPackManager.validateGoldenOutput(dictionaryURL: dictionary)
    }
  }

  @Test("an analysis whose words or pieces aren't the golden sentence's fails it")
  func otherAnalysesFail() async throws {
    let golden = try await Self.goldenAnalysis()
    try SudachiCoreContract.validateGoldenOutput(golden)
    let shifted = golden.words.map {
      JapaneseMorpheme(
        surface: $0.surface, begin: $0.begin + 1, end: $0.end + 1,
        dictionaryForm: $0.dictionaryForm, normalizedForm: $0.normalizedForm,
        reading: $0.reading, partOfSpeech: $0.partOfSpeech,
        isOutOfVocabulary: $0.isOutOfVocabulary)
    }
    for analysis in [
      JapaneseMorphologyAnalysis(words: shifted, pieces: golden.pieces),
      JapaneseMorphologyAnalysis(words: golden.words, pieces: Array(golden.pieces.dropLast())),
      JapaneseMorphologyAnalysis(words: golden.words, pieces: []),
    ] {
      #expect(throws: JapaneseMorphologyError.providerContractMismatch) {
        try SudachiCoreContract.validateGoldenOutput(analysis)
      }
    }
  }
}
