import Foundation
import Sudachi

struct JapaneseMorphologyCandidate: Equatable, Sendable {
  let surface: String
  let scalarRange: Range<Int>
  let dictionaryForm: String
  let normalizedForm: String
  let reading: String
  let partOfSpeech: [String]
  let isOutOfVocabulary: Bool
  let children: [JapaneseMorphologyCandidate]
}

struct JapaneseMorphologyAnalysis: Equatable, Sendable {
  let transcript: String
  let candidates: [JapaneseMorphologyCandidate]
  let engine: String
  let engineVersion: String
  let dictionary: String
  let dictionarySHA256: String
}

enum JapaneseMorphologyError: Error, Equatable {
  case packUnavailable
  case invalidProviderRange
  case providerContractMismatch
}

enum JapaneseAnalysisAvailability: Equatable, Sendable {
  case full
  case reduced
}

struct JapaneseMorphologyClient: Sendable {
  var analyze: @Sendable (String) async throws -> JapaneseMorphologyAnalysis
  var availability: @Sendable () async -> JapaneseAnalysisAvailability

  init(
    availability: @escaping @Sendable () async -> JapaneseAnalysisAvailability = { .full },
    analyze: @escaping @Sendable (String) async throws -> JapaneseMorphologyAnalysis
  ) {
    self.analyze = analyze
    self.availability = availability
  }

  static let live = JapaneseMorphologyClient(
    availability: {
      await LanguageTechnologyPackStore.shared.installedDictionaryURL() == nil ? .reduced : .full
    },
    analyze: { text in try await JapaneseMorphologyStore.shared.analyze(text) }
  )

  static func sudachiCore(dictionaryURL: URL) throws -> JapaneseMorphologyClient {
    let adapter = try SudachiJapaneseMorphologyAdapter(dictionaryURL: dictionaryURL)
    return JapaneseMorphologyClient { text in
      try Task.checkCancellation()
      let analysis = try adapter.analyze(text)
      try Task.checkCancellation()
      return analysis
    }
  }
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

private final class SudachiJapaneseMorphologyAdapter: @unchecked Sendable {
  private let tokenizer: SudachiTokenizer

  init(dictionaryURL: URL) throws {
    let dictionary = try SudachiRuntimeResources.dictionary(at: dictionaryURL)
    tokenizer = try SudachiTokenizer(dictionary: dictionary, mode: .c)
  }

  func analyze(_ text: String) throws -> JapaneseMorphologyAnalysis {
    let coarse = try tokenizer.tokenize(text: text)
    let fine = try tokenizer.tokenizeWithMode(text: text, mode: .a)
    let fineCandidates = try fine.map {
      try Self.candidate($0, transcript: text, scalarOffset: 0, children: [])
    }
    let candidates = try coarse.map { morpheme in
      let coarseRange = Int(morpheme.begin)..<Int(morpheme.end)
      let children = fineCandidates.filter {
        $0.scalarRange.lowerBound >= coarseRange.lowerBound
          && $0.scalarRange.upperBound <= coarseRange.upperBound
      }
      return try Self.candidate(
        morpheme,
        transcript: text,
        scalarOffset: 0,
        children: children
      )
    }
    try Self.validate(candidates: candidates, transcript: text)
    return JapaneseMorphologyAnalysis(
      transcript: text,
      candidates: candidates,
      engine: "sudachi.rs",
      engineVersion: "0.6.11",
      dictionary: "SudachiDict Core 20260723",
      dictionarySHA256: "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f"
    )
  }

  private static func candidate(
    _ morpheme: Morpheme,
    transcript: String,
    scalarOffset: Int,
    children: [JapaneseMorphologyCandidate]
  ) throws -> JapaneseMorphologyCandidate {
    let range = (Int(morpheme.begin) + scalarOffset)..<(Int(morpheme.end) + scalarOffset)
    guard
      scalarSlice(transcript, range: Int(morpheme.begin)..<Int(morpheme.end)) == morpheme.surface
    else { throw JapaneseMorphologyError.invalidProviderRange }
    return JapaneseMorphologyCandidate(
      surface: morpheme.surface,
      scalarRange: range,
      dictionaryForm: morpheme.dictionaryForm,
      normalizedForm: morpheme.normalizedForm,
      reading: morpheme.readingForm,
      partOfSpeech: morpheme.partOfSpeech,
      isOutOfVocabulary: morpheme.isOov,
      children: children
    )
  }

  private static func validate(
    candidates: [JapaneseMorphologyCandidate],
    transcript: String
  ) throws {
    var previousEnd = 0
    for candidate in candidates {
      guard candidate.scalarRange.lowerBound >= previousEnd,
        scalarSlice(transcript, range: candidate.scalarRange) == candidate.surface
      else { throw JapaneseMorphologyError.invalidProviderRange }
      previousEnd = candidate.scalarRange.upperBound
      for child in candidate.children {
        guard candidate.scalarRange.contains(child.scalarRange.lowerBound),
          child.scalarRange.upperBound <= candidate.scalarRange.upperBound,
          scalarSlice(transcript, range: child.scalarRange) == child.surface
        else { throw JapaneseMorphologyError.invalidProviderRange }
      }
    }
  }

  private static func scalarSlice(_ text: String, range: Range<Int>) -> String? {
    let scalars = text.unicodeScalars
    guard
      let lower = scalars.index(
        scalars.startIndex, offsetBy: range.lowerBound, limitedBy: scalars.endIndex),
      let upper = scalars.index(
        scalars.startIndex, offsetBy: range.upperBound, limitedBy: scalars.endIndex),
      lower <= upper
    else { return nil }
    return String(scalars[lower..<upper])
  }
}

enum SudachiRuntimeResources {
  static func dictionary(at dictionaryURL: URL) throws -> SudachiDictionary {
    guard let charURL = Bundle.module.url(forResource: "char", withExtension: "def"),
      let unknownURL = Bundle.module.url(forResource: "unk", withExtension: "def"),
      try Data(contentsOf: charURL).sha256
        == "b549ec56ad67359f535c80b7efa150538af2a78b7609d0d6bae796dd89f4f29d",
      try Data(contentsOf: unknownURL).sha256
        == "4e8c4c15e18af6a9fc5d636e3dc73fde55d50941b93a6c8835d4653d3f54ba79"
    else { throw JapaneseMorphologyError.providerContractMismatch }
    return try SudachiDictionary(
      systemDictPath: dictionaryURL.path,
      userDictPaths: [],
      resourceDir: charURL.deletingLastPathComponent().path
    )
  }
}
