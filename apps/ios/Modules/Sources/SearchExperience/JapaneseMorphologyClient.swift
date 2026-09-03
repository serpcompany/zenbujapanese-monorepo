import Foundation
import NaturalLanguage
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
  static let installedBytes = 217_466_039
  static let archiveEntry = "sudachidict_core/resources/system.dic"
  static let dictionarySHA256 =
    "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f"
  static let runtimeResourceCommit = "90fd6068c80c2fc3b63e0dbab0e341475bad4d8f"
  static let characterDefinitionSHA256 =
    "b549ec56ad67359f535c80b7efa150538af2a78b7609d0d6bae796dd89f4f29d"
  static let unknownDefinitionSHA256 =
    "4e8c4c15e18af6a9fc5d636e3dc73fde55d50941b93a6c8835d4653d3f54ba79"

  static func validate(_ analysis: JapaneseMorphologyAnalysis) throws {
    guard analysis.engine == engine,
      analysis.engineVersion == engineVersion,
      analysis.dictionary == dictionary,
      analysis.dictionarySHA256 == dictionarySHA256,
      analysis.candidates.allSatisfy({ candidate in
        !candidate.surface.isEmpty && !candidate.dictionaryForm.isEmpty
          && !candidate.normalizedForm.isEmpty && !candidate.reading.isEmpty
          && !candidate.partOfSpeech.isEmpty
      })
    else { throw JapaneseMorphologyError.providerContractMismatch }
    try JapaneseMorphologyProviderContract.validate(
      candidates: analysis.candidates, transcript: analysis.transcript)
  }

  static func validateGoldenOutput(_ analysis: JapaneseMorphologyAnalysis) throws {
    try validate(analysis)
    guard analysis.transcript == "日本語を用いる。",
      analysis.candidates.map(\.surface) == ["日本語", "を", "用いる", "。"],
      analysis.candidates.map(\.dictionaryForm) == ["日本語", "を", "用いる", "。"],
      analysis.candidates.map(\.reading) == ["ニホンゴ", "ヲ", "モチイル", "。"],
      analysis.candidates.map { $0.partOfSpeech.first } == ["名詞", "助詞", "動詞", "補助記号"],
      analysis.candidates.allSatisfy({ !$0.isOutOfVocabulary })
    else { throw JapaneseMorphologyError.providerContractMismatch }
  }
}

struct JapaneseMorphologyCandidate: Equatable, Sendable {
  let surface: String
  let scalarRange: Range<Int>
  let dictionaryForm: String
  let normalizedForm: String
  let reading: String
  let partOfSpeech: [String]
  let isOutOfVocabulary: Bool
  let children: [JapaneseMorphologyCandidate]

  var coarsePartOfSpeech: String? {
    guard let primary = partOfSpeech.first else { return nil }
    let secondary = partOfSpeech.dropFirst().first
    switch primary {
    case "名詞":
      if secondary == "固有名詞" { return "PROPN" }
      if secondary == "数詞" { return "NUM" }
      if secondary == "助動詞語幹" { return "AUX" }
      return "NOUN"
    case "代名詞": return "PRON"
    case "動詞": return "VERB"
    case "形容詞", "形状詞": return "ADJ"
    case "連体詞": return "DET"
    case "副詞": return "ADV"
    case "助動詞": return "AUX"
    case "接続詞": return "CCONJ"
    case "感動詞": return "INTJ"
    case "補助記号": return secondary == "一般" ? "SYM" : "PUNCT"
    case "記号", "接頭辞", "接尾辞": return "NOUN"
    case "空白": return "SPACE"
    case "助詞":
      if secondary == "接続助詞" || secondary == "準体助詞" { return "SCONJ" }
      if secondary == "終助詞" { return "PART" }
      return "ADP"
    default: return nil
    }
  }
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

  #if DEBUG
    /// Deterministic UI-test provider. Real adapter and pack coverage lives in
    /// ZenbuSudachiIntegration; ordinary UI jobs must never depend on a network download.
    static let uiTestFixture = JapaneseMorphologyClient { text in
      let annotated: [(surface: String, lemma: String, reading: String, partOfSpeech: String)]?
      switch text {
      case "今日は静かな公園です。":
        annotated = [
          ("今日", "今日", "キョウ", "名詞"), ("は", "は", "ハ", "助詞"),
          ("静か", "静か", "シズカ", "形状詞"), ("な", "だ", "ナ", "助動詞"),
          ("公園", "公園", "コウエン", "名詞"), ("です", "です", "デス", "助動詞"),
          ("。", "。", "。", "補助記号"),
        ]
      case "日本語の勉強":
        annotated = [
          ("日本語", "日本語", "ニホンゴ", "名詞"), ("の", "の", "ノ", "助詞"),
          ("勉強", "勉強", "ベンキョウ", "名詞"),
        ]
      case "今日は静かな公園で蝶々を見た。":
        annotated = [
          ("今日", "今日", "キョウ", "名詞"), ("は", "は", "ハ", "助詞"),
          ("静か", "静か", "シズカ", "形状詞"), ("な", "だ", "ナ", "助動詞"),
          ("公園", "公園", "コウエン", "名詞"), ("で", "で", "デ", "助詞"),
          ("蝶々", "蝶々", "チョウチョウ", "名詞"), ("を", "を", "ヲ", "助詞"),
          ("見", "見る", "ミ", "動詞"), ("た", "た", "タ", "助動詞"),
          ("。", "。", "。", "補助記号"),
        ]
      case "問題を解いてから、友達と話します。":
        annotated = [
          ("問題", "問題", "モンダイ", "名詞"), ("を", "を", "ヲ", "助詞"),
          ("解い", "解く", "トイ", "動詞"), ("て", "て", "テ", "助詞"),
          ("から", "から", "カラ", "助詞"), ("、", "、", "、", "補助記号"),
          ("友達", "友達", "トモダチ", "名詞"), ("と", "と", "ト", "助詞"),
          ("話し", "話す", "ハナシ", "動詞"), ("ます", "ます", "マス", "助動詞"),
          ("。", "。", "。", "補助記号"),
        ]
      case "見ているだけだ。":
        annotated = [
          ("見て", "見る", "ミテ", "動詞"), ("いる", "居る", "イル", "動詞"),
          ("だけ", "だけ", "ダケ", "助詞"), ("だ", "だ", "ダ", "助動詞"),
          ("。", "。", "。", "補助記号"),
        ]
      default:
        annotated = nil
      }

      var candidates: [JapaneseMorphologyCandidate] = []
      if let annotated {
        var offset = 0
        for item in annotated {
          let length = item.surface.unicodeScalars.count
          candidates.append(
            JapaneseMorphologyCandidate(
              surface: item.surface,
              scalarRange: offset..<(offset + length),
              dictionaryForm: item.lemma,
              normalizedForm: item.lemma,
              reading: item.reading,
              partOfSpeech: [item.partOfSpeech],
              isOutOfVocabulary: false,
              children: []
            ))
          offset += length
        }
      } else {
        let tokenizer = NLTokenizer(unit: .word)
        tokenizer.string = text
        var previousEnd = text.startIndex
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
          let ranges =
            previousEnd < range.lowerBound ? [previousEnd..<range.lowerBound, range] : [range]
          for tokenRange in ranges {
            let surface = String(text[tokenRange])
            let lowerScalar = tokenRange.lowerBound.samePosition(in: text.unicodeScalars)!
            let scalarStart = text.unicodeScalars.distance(
              from: text.unicodeScalars.startIndex, to: lowerScalar)
            let length = surface.unicodeScalars.count
            candidates.append(
              JapaneseMorphologyCandidate(
                surface: surface,
                scalarRange: scalarStart..<(scalarStart + length),
                dictionaryForm: surface,
                normalizedForm: surface,
                reading: surface,
                partOfSpeech: ["名詞"],
                isOutOfVocabulary: false,
                children: []
              ))
          }
          previousEnd = range.upperBound
          return true
        }
        if previousEnd < text.endIndex {
          let surface = String(text[previousEnd...])
          let lowerScalar = previousEnd.samePosition(in: text.unicodeScalars)!
          let scalarStart = text.unicodeScalars.distance(
            from: text.unicodeScalars.startIndex, to: lowerScalar)
          candidates.append(
            JapaneseMorphologyCandidate(
              surface: surface,
              scalarRange: scalarStart..<text.unicodeScalars.count,
              dictionaryForm: surface,
              normalizedForm: surface,
              reading: surface,
              partOfSpeech: ["補助記号"],
              isOutOfVocabulary: false,
              children: []
            ))
        }
      }
      return JapaneseMorphologyAnalysis(
        transcript: text,
        candidates: candidates,
        engine: "ui-test-fixture",
        engineVersion: "1",
        dictionary: "authored deterministic UI fixture",
        dictionarySHA256: "not-a-release-provider"
      )
    }
  #endif
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
    let analysis = JapaneseMorphologyAnalysis(
      transcript: text,
      candidates: candidates,
      engine: SudachiCoreContract.engine,
      engineVersion: SudachiCoreContract.engineVersion,
      dictionary: SudachiCoreContract.dictionary,
      dictionarySHA256: SudachiCoreContract.dictionarySHA256
    )
    try SudachiCoreContract.validate(analysis)
    return analysis
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

  fileprivate static func scalarSlice(_ text: String, range: Range<Int>) -> String? {
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

enum JapaneseMorphologyProviderContract {
  static func validate(
    candidates: [JapaneseMorphologyCandidate],
    transcript: String
  ) throws {
    var previousEnd = 0
    for candidate in candidates {
      guard candidate.scalarRange.lowerBound == previousEnd,
        SudachiJapaneseMorphologyAdapter.scalarSlice(
          transcript, range: candidate.scalarRange) == candidate.surface,
        !candidate.children.isEmpty
      else { throw JapaneseMorphologyError.invalidProviderRange }
      previousEnd = candidate.scalarRange.upperBound
      var previousChildEnd = candidate.scalarRange.lowerBound
      for child in candidate.children {
        guard child.scalarRange.lowerBound == previousChildEnd,
          child.scalarRange.upperBound <= candidate.scalarRange.upperBound,
          SudachiJapaneseMorphologyAdapter.scalarSlice(
            transcript, range: child.scalarRange) == child.surface
        else { throw JapaneseMorphologyError.invalidProviderRange }
        previousChildEnd = child.scalarRange.upperBound
      }
      guard previousChildEnd == candidate.scalarRange.upperBound else {
        throw JapaneseMorphologyError.invalidProviderRange
      }
    }
    guard previousEnd == transcript.unicodeScalars.count else {
      throw JapaneseMorphologyError.invalidProviderRange
    }
  }
}

enum SudachiRuntimeResources {
  static func dictionary(at dictionaryURL: URL) throws -> SudachiDictionary {
    guard let charURL = Bundle.module.url(forResource: "char", withExtension: "def"),
      let unknownURL = Bundle.module.url(forResource: "unk", withExtension: "def"),
      try Data(contentsOf: charURL).sha256 == SudachiCoreContract.characterDefinitionSHA256,
      try Data(contentsOf: unknownURL).sha256 == SudachiCoreContract.unknownDefinitionSHA256
    else { throw JapaneseMorphologyError.providerContractMismatch }
    return try SudachiDictionary(
      systemDictPath: dictionaryURL.path,
      userDictPaths: [],
      resourceDir: charURL.deletingLastPathComponent().path
    )
  }
}
