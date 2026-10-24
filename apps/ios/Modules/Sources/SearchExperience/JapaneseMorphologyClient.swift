import Foundation
import Sudachi

enum SudachiCoreContract {
  static let engine = "sudachi.rs"
  static let engineVersion = "0.6.11"
  static let binding = "sudachi-swift"
  static let bindingVersion = "0.1.1"
  static let dictionary = "SudachiDict Core 20260723"
  static let dictionaryVersion = "20260723"
  static let downloadBytes = 72_275_897
  static let downloadSHA256 =
    "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498"
  static let downloadURL = URL(
    string:
      "https://github.com/WorksApplications/SudachiDict/releases/download/v20260723/sudachidict_core-20260723-py3-none-any.whl"
  )!
  static let installedBytes = 217_466_039
  static let archiveEntry = "sudachidict_core/resources/system.dic"
  static let dictionarySHA256 =
    "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f"
  static let runtimeResourceCommit = "90fd6068c80c2fc3b63e0dbab0e341475bad4d8f"
  static let characterDefinitionSHA256 =
    "b549ec56ad67359f535c80b7efa150538af2a78b7609d0d6bae796dd89f4f29d"
  static let unknownDefinitionSHA256 =
    "4e8c4c15e18af6a9fc5d636e3dc73fde55d50941b93a6c8835d4653d3f54ba79"

  static func validateGoldenOutput(_ analysis: JapaneseMorphologyAnalysis) throws {
    let words = analysis.words
    let pieces = analysis.pieces
    let boundaries = Set(pieces.flatMap { [$0.begin, $0.end] })
    guard words.map(\.surface) == ["日本語", "を", "用いる", "。"],
      words.map(\.begin) == [0, 3, 4, 7],
      words.map(\.end) == [3, 4, 7, 8],
      words.map(\.dictionaryForm) == ["日本語", "を", "用いる", "。"],
      words.map(\.reading) == ["ニホンゴ", "ヲ", "モチイル", "。"],
      words.map({ $0.partOfSpeech.first }) == ["名詞", "助詞", "動詞", "補助記号"],
      words.allSatisfy({ !$0.isOutOfVocabulary && !$0.normalizedForm.isEmpty }),
      pieces.map(\.surface).joined() == "日本語を用いる。",
      pieces.first?.begin == 0,
      zip(pieces, pieces.dropFirst()).allSatisfy({ $0.end == $1.begin }),
      words.allSatisfy({ boundaries.contains($0.begin) && boundaries.contains($0.end) })
    else { throw JapaneseMorphologyError.providerContractMismatch }
  }
}

struct JapaneseMorpheme: Codable, Equatable, Sendable {
  let surface: String
  let begin: Int
  let end: Int
  let dictionaryForm: String
  let normalizedForm: String
  let reading: String
  let partOfSpeech: [String]
  let isOutOfVocabulary: Bool
}

struct JapaneseMorphologyAnalysis: Encodable, Equatable, Sendable {
  let words: [JapaneseMorpheme]
  let pieces: [JapaneseMorpheme]
}

enum JapaneseMorphologyError: Error, Equatable {
  case packUnavailable
  case providerContractMismatch
}

enum JapaneseTextAnalysisAvailability: Equatable, Sendable {
  case full
  case reduced
}

struct JapaneseMorphologyClient: Sendable {
  var analyze: @Sendable (String) async throws -> JapaneseMorphologyAnalysis
  var availability: @Sendable () async -> JapaneseTextAnalysisAvailability

  init(
    availability: @escaping @Sendable () async -> JapaneseTextAnalysisAvailability = { .full },
    analyze: @escaping @Sendable (String) async throws -> JapaneseMorphologyAnalysis
  ) {
    self.analyze = analyze
    self.availability = availability
  }

  static let unavailable = JapaneseMorphologyClient(availability: { .reduced }) { _ in
    throw JapaneseMorphologyError.packUnavailable
  }

  static let live = JapaneseMorphologyClient(
    availability: {
      await LanguageTechnologyPackStore.shared.installedDictionaryURL() == nil ? .reduced : .full
    },
    analyze: { text in try await JapaneseMorphologyStore.shared.analyze(text) }
  )
}

actor JapaneseMorphologyStore {
  static let shared = JapaneseMorphologyStore()
  private var adapter: SudachiJapaneseMorphologyAdapter?
  private var dictionaryURL: URL?

  func analyze(_ text: String) async throws -> JapaneseMorphologyAnalysis {
    try Task.checkCancellation()
    guard let installedURL = await LanguageTechnologyPackStore.shared.installedDictionaryURL()
    else { throw JapaneseMorphologyError.packUnavailable }
    if dictionaryURL != installedURL || adapter == nil {
      adapter = try SudachiJapaneseMorphologyAdapter(dictionaryURL: installedURL)
      dictionaryURL = installedURL
    }
    guard let adapter else { throw JapaneseMorphologyError.packUnavailable }
    let result = try adapter.analyze(text)
    try Task.checkCancellation()
    return result
  }

  func invalidate() {
    adapter = nil
    dictionaryURL = nil
  }
}

final class SudachiJapaneseMorphologyAdapter: @unchecked Sendable {
  private let tokenizer: SudachiTokenizer

  init(dictionaryURL: URL) throws {
    let dictionary = try SudachiRuntimeResources.dictionary(at: dictionaryURL)
    tokenizer = try SudachiTokenizer(dictionary: dictionary, mode: .c)
  }

  func analyze(_ text: String) throws -> JapaneseMorphologyAnalysis {
    JapaneseMorphologyAnalysis(
      words: try tokenizer.tokenize(text: text).map(Self.morpheme),
      pieces: try tokenizer.tokenizeWithMode(text: text, mode: .a).map(Self.morpheme))
  }

  private static func morpheme(_ morpheme: Morpheme) -> JapaneseMorpheme {
    JapaneseMorpheme(
      surface: morpheme.surface,
      begin: Int(morpheme.begin),
      end: Int(morpheme.end),
      dictionaryForm: morpheme.dictionaryForm,
      normalizedForm: morpheme.normalizedForm,
      reading: morpheme.readingForm,
      partOfSpeech: morpheme.partOfSpeech,
      isOutOfVocabulary: morpheme.isOov
    )
  }
}

enum SudachiRuntimeResources {
  static func dictionary(at dictionaryURL: URL) throws -> SudachiDictionary {
    guard let charURL = BundledData.bundle.url(forResource: "char", withExtension: "def"),
      let unknownURL = BundledData.bundle.url(forResource: "unk", withExtension: "def"),
      try fileSHA256(charURL) == SudachiCoreContract.characterDefinitionSHA256,
      try fileSHA256(unknownURL) == SudachiCoreContract.unknownDefinitionSHA256
    else { throw JapaneseMorphologyError.providerContractMismatch }
    return try SudachiDictionary(
      systemDictPath: dictionaryURL.path,
      userDictPaths: [],
      resourceDir: charURL.deletingLastPathComponent().path
    )
  }
}
