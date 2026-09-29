import Foundation
import Testing

@testable import SearchExperience

/// Checks what Word Detail shows against the app-recorded suite in
/// `apps/ios/LanguageData/Conformance/word-detail.json`, so the website's word pages can be held
/// to the app. Each case is read from the models and clients `WordDetailView` uses, with the
/// app's defaults: the Kuromoji text analysis, and the frequency dictionaries a new install
/// enables (JLPT, then TUBELEX).
///
/// After an intended change to Word Detail or its data, record it again by running this suite
/// with `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, and review the diff. Recording keeps each
/// case's `id` and `covers` and rewrites the rest.
@Suite("Word detail conformance suite")
struct WordDetailConformanceTests {
  static let artifactNames =
    [
      "LanguageReferenceData.sqlite3", "CompoundPitch.sqlite3", "ExampleWordIndex.sqlite3",
      "JLPTLevelPack.sqlite3", "TUBELEXFrequencyPack.sqlite3", "FrequencyPackCatalog.json",
      "KanjiReferenceData.json", "Kuromoji/kuromoji.js",
    ] + KuromojiContract.dictionaryFiles.map { "Kuromoji/\($0)" }

  @Test("Word Detail shows what the suite recorded")
  func wordDetailMatchesSuite() async throws {
    let url = DetailConformance.suiteURL("word-detail.json")
    var suite = try JSONDecoder().decode(WordDetailSuite.self, from: Data(contentsOf: url))
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let observer = try await WordDetailObserver()

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        suite.cases[index] = try await observer.observe(
          suite.cases[index], exampleLimit: suite.exampleLimit)
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try await observer.observe(expected, exampleLimit: suite.exampleLimit)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(
        differences.isEmpty,
        "\(expected.headword ?? expected.id) (\(expected.id)) differs in \(differences)")
    }
  }
}

/// Reads one entry's Word Detail from the same clients the app gives `WordDetailView`.
private struct WordDetailObserver {
  let lookupClient = LookupClient.live
  let exampleSentenceClient = ExampleSentenceClient.live
  let kanjiLookupClient = KanjiLookupClient.live(lookupClient: .live)
  let conjugationClient = JapaneseConjugationClient.live
  let textAnalysisClient = JapaneseTextAnalysisClient.resolving(
    morphologyClient: .kuromoji, lookupClient: .live)
  /// A fresh install's frequency dictionaries, independent of the Simulator's saved choices.
  let frequency: FrequencyPackManager

  init() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    frequency = try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: try catalog.bundledArtifactURLs(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: FileManager.default.temporaryDirectory
        .appending(path: "WordDetailConformance-\(UUID().uuidString)"),
      download: { _ in throw CancellationError() }
    )
    let availability = await textAnalysisClient.availability()
    guard availability == .full else { throw WordDetailObserverError.textAnalysisUnavailable }
  }

  func observe(_ recorded: WordDetailCase, exampleLimit: Int) async throws -> WordDetailCase {
    var observed = WordDetailCase(id: recorded.id, covers: recorded.covers)
    guard let entry = try await lookupClient.entry(LanguageReferenceID(rawValue: recorded.id))
    else { return observed }

    observed.languageReferenceID = entry.id.rawValue
    observed.entSeq = entry.sourceProvenances.map(\.sourceRecordID)
    observed.headword = entry.headword
    observed.reading = entry.reading
    observed.furigana = JapaneseRubyAnnotation.segments(
      surface: entry.headword, reading: entry.reading
    ).map { WordDetailCase.Furigana(base: $0.base, reading: $0.reading) }
    observed.partOfSpeech = entry.displayPartOfSpeech
    observed.opensConjugations = conjugationClient.table(entry) != nil
    observed.pitch = entry.pitchAccent.map { pitch in
      // The view draws one level per mora of the reading (in katakana, which splits into the
      // same morae), which can differ from the source's mora count.
      let levels = pitch.levels(moraCount: entry.reading.morae.count)
      return WordDetailCase.Pitch(
        downstep: pitch.downstep,
        moraCount: pitch.moraCount,
        levels: levels.morae.map { $0 ? "H" : "L" }.joined(),
        particle: levels.particle ? "H" : "L",
        source: pitch.sourceIdentity
      )
    }
    observed.senses = entry.senses.map {
      WordDetailCase.Sense(
        meaning: $0.meaning, notes: $0.notes, partsOfSpeech: $0.partsOfSpeech.map(\.rawValue))
    }
    observed.frequency = try await frequency.evidence(for: entry.id).map(Self.frequency)
    observed.alternativeForms = entry.alternativeForms.map {
      WordDetailCase.Form(value: $0.value, kind: $0.kind.rawValue, labels: $0.labels)
    }
    observed.kanji = try await kanji(entry.primaryKanji)
    observed.alternativeKanji = try await kanji(entry.alternativeKanji)
    observed.relatedWords = entry.relationships.map {
      WordDetailCase.Related(
        headword: $0.headword, reading: $0.reading, relation: $0.relation,
        summary: $0.summary, targetID: $0.targetID)
    }
    observed.examples = try await examples(entry, limit: exampleLimit)
    return observed
  }

  private static func frequency(_ result: FrequencyLookupResult) -> WordDetailCase.Frequency {
    let presentation = FrequencyPresentationModel(result: result)
    return WordDetailCase.Frequency(
      pack: presentation.pack?.id.rawValue,
      name: presentation.packName,
      text: presentation.tier == nil ? presentation.missingText : presentation.inlineText,
      tier: presentation.tier?.label
    )
  }

  private func kanji(_ characters: [String]) async throws -> [WordDetailCase.Kanji] {
    var result: [WordDetailCase.Kanji] = []
    for character in characters {
      guard let kanji = KanjiCharacter(character) else { continue }
      let reference = try await kanjiLookupClient.entry(kanji)
      result.append(WordDetailCase.Kanji(character: character, meanings: reference?.meanings))
    }
    return result
  }

  private func examples(_ entry: DictionaryEntry, limit: Int) async throws
    -> WordDetailCase.Examples
  {
    let retrieval: ExampleSentenceRetrievalResult
    do {
      retrieval = try await exampleSentenceClient.retrieve(.dictionaryEntry(entry))
    } catch {
      // The view shows no examples when retrieval fails.
      return WordDetailCase.Examples(
        listed: 0, reportedCount: nil, truncated: false, error: "\(error)", shown: [])
    }
    var shown: [WordDetailCase.Example] = []
    for sentence in retrieval.sentences.prefix(limit) {
      let tokens = await textAnalysisClient.linkedTokens(
        sentence.japanese, SearchQuery(entry.headword), entry)
      shown.append(
        WordDetailCase.Example(
          id: sentence.id.rawValue,
          japanese: sentence.japanese,
          english: sentence.english,
          tokens: tokens.map { token in
            WordDetailCase.Token(
              surface: token.surface,
              entry: token.entry?.id.rawValue,
              candidates: token.entry == nil && !token.candidateEntries.isEmpty
                ? token.candidateEntries.map(\.id.rawValue) : nil,
              pageWord: token.represents(entry) ? true : nil
            )
          }
        ))
    }
    let reportedCount =
      switch retrieval.count {
      case .exact(let count): "\(count)"
      case .moreThan50: "more than 50"
      }
    return WordDetailCase.Examples(
      listed: retrieval.sentences.count,
      reportedCount: reportedCount,
      truncated: retrieval.isTruncated,
      error: nil,
      shown: shown
    )
  }
}

private enum WordDetailObserverError: Error {
  case textAnalysisUnavailable
}

private struct WordDetailSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  /// How many of an entry's examples, in order, the suite records with their tokens.
  let exampleLimit: Int
  var cases: [WordDetailCase]
}

/// One entry's Word Detail. Only `id` and `covers` are written by hand.
private struct WordDetailCase: Codable {
  /// The Language Reference ID the page is opened with.
  let id: String
  /// Why the case is in the suite.
  let covers: String?
  /// The ID the app shows, which is the canonical ID of the entry's equivalent group.
  var languageReferenceID: String?
  /// The JMdict entry numbers behind the entry.
  var entSeq: [String]?
  var headword: String?
  var reading: String?
  var furigana: [Furigana]?
  /// The part of speech under the headword; empty when the view shows none.
  var partOfSpeech: String?
  /// Whether the part of speech opens a conjugation table.
  var opensConjugations: Bool?
  var pitch: Pitch?
  var senses: [Sense]?
  var frequency: [Frequency]?
  var alternativeForms: [Form]?
  /// The headword's kanji, in order, with the meanings their Kanji Detail shows. Word Detail
  /// itself shows only the characters.
  var kanji: [Kanji]?
  var alternativeKanji: [Kanji]?
  var relatedWords: [Related]?
  var examples: Examples?

  init(id: String, covers: String?) {
    self.id = id
    self.covers = covers
  }

  struct Furigana: Codable {
    let base: String
    let reading: String?
  }

  struct Pitch: Codable {
    let downstep: Int
    let moraCount: Int
    /// High or low pitch per mora, as the view draws it.
    let levels: String
    /// The pitch of a following particle.
    let particle: String
    let source: String
  }

  struct Sense: Codable {
    let meaning: String
    let notes: [String]
    let partsOfSpeech: [String]
  }

  struct Frequency: Codable {
    let pack: String?
    let name: String
    /// The row's value: a rank, a JLPT level, or the missing text.
    let text: String
    let tier: String?
  }

  struct Form: Codable {
    let value: String
    let kind: String
    let labels: [String]
  }

  struct Kanji: Codable {
    let character: String
    let meanings: [String]?
  }

  struct Related: Codable {
    let headword: String
    let reading: String
    let relation: String
    let summary: String
    let targetID: String?
  }

  struct Examples: Codable {
    /// How many examples Word Detail lists (at most 100).
    let listed: Int
    /// The count retrieval reports: exact up to 50.
    let reportedCount: String?
    /// Whether more than 100 examples matched, so some aren't listed.
    let truncated: Bool
    let error: String?
    /// The first examples, in order.
    let shown: [Example]
  }

  struct Example: Codable {
    let id: String
    let japanese: String
    let english: String
    let tokens: [Token]
  }

  struct Token: Codable {
    let surface: String
    /// The entry the word links to.
    let entry: String?
    /// The possible entries when the word has no single one.
    let candidates: [String]?
    /// Whether the view highlights the word as the page's own entry.
    let pageWord: Bool?
  }
}
