import Foundation
import Testing

@testable import SearchExperience

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
          suite.cases[index], exampleLimit: suite.exampleLimit,
          formExampleLimit: suite.formExampleLimit)
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try await observer.observe(
        expected, exampleLimit: suite.exampleLimit, formExampleLimit: suite.formExampleLimit)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(
        differences.isEmpty,
        "\(expected.headword ?? expected.id) (\(expected.id)) differs in \(differences)")
    }
  }
}

private struct WordDetailObserver {
  let lookupClient = LookupClient.live
  let exampleSentenceClient = ExampleSentenceClient.live
  let kanjiLookupClient = KanjiLookupClient.live(lookupClient: .live)
  let conjugationClient = JapaneseConjugationClient.live
  let textAnalysisClient = JapaneseTextAnalysisClient.resolving(
    morphologyClient: .kuromoji, lookupClient: .live)
  let frequency: FrequencyPackManager

  init() async throws {
    frequency = try .freshInstall(storagePrefix: "WordDetailConformance")
    let availability = await textAnalysisClient.availability()
    guard availability == .full else { throw WordDetailObserverError.textAnalysisUnavailable }
  }

  func observe(_ recorded: WordDetailCase, exampleLimit: Int, formExampleLimit: Int) async throws
    -> WordDetailCase
  {
    var observed = WordDetailCase(id: recorded.id, covers: recorded.covers)
    guard let entry = try await lookupClient.entry(LanguageReferenceID(rawValue: recorded.id))
    else { return observed }

    observed.languageReferenceID = entry.id.rawValue
    observed.entSeq = entry.sourceProvenances.map(\.sourceRecordID)
    observed.headword = entry.headword
    observed.reading = entry.reading
    observed.furigana = JapaneseRubyAnnotation.segments(
      surface: entry.headword, reading: entry.reading
    ).map {
      WordDetailCase.Furigana(
        base: $0.base, reading: $0.reading,
        kanjiReadings: JapaneseRubyText.kanjiReadings($0))
    }
    observed.partOfSpeech = entry.displayPartOfSpeech
    let conjugationTable = conjugationClient.table(entry)
    observed.opensConjugations = conjugationTable != nil
    if let conjugationTable {
      var conjugations = WordDetailCase.Conjugations(entry: entry, table: conjugationTable)
      conjugations.plain = await formExamples(
        conjugations.plain, conjugationTable.forms(for: .plain), limit: formExampleLimit)
      if let polite = conjugations.polite {
        conjugations.polite = await formExamples(
          polite, conjugationTable.forms(for: .polite), limit: formExampleLimit)
      }
      observed.conjugations = conjugations
    }
    observed.pitch = entry.pitchAccent.map { pitch in
      let levels = pitch.levels(moraCount: entry.reading.morae.count)
      return WordDetailCase.Pitch(
        downstep: pitch.downstep,
        moraCount: pitch.moraCount,
        levels: levels.morae.map { $0 ? "H" : "L" }.joined(),
        particle: levels.particle ? "H" : "L",
        source: pitch.sourceIdentity,
        graph: WordDetailCase.PitchGraph(PitchContourLayout(reading: entry.reading, pitch: pitch))
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
      tier: presentation.tier?.label,
      details: WordDetailCase.FrequencyDetails(FrequencyDisclosurePresentation(result: result))
    )
  }

  private func formExamples(
    _ recorded: [WordDetailCase.Conjugations.Form], _ forms: [ConjugatedForm], limit: Int
  ) async -> [WordDetailCase.Conjugations.Form] {
    var result = recorded
    for (index, form) in forms.enumerated() {
      let examples = await form.examples(
        exampleSentenceClient: exampleSentenceClient,
        japaneseTextAnalysisClient: textAnalysisClient)
      let query = SearchQuery(form.surface)
      var shown: [WordDetailCase.FormExample] = []
      for sentence in examples.prefix(limit) {
        let tokens = await textAnalysisClient.linkedTokens(sentence.japanese, query, nil)
        let ranges = ExampleSentencesScreen.queryScalarRanges(
          in: sentence.japanese, query: query.value)
        shown.append(
          WordDetailCase.FormExample(
            id: sentence.id.rawValue,
            japanese: sentence.japanese,
            english: sentence.english,
            tokens: tokens.map { token in
              WordDetailCase.FormToken(
                surface: token.surface,
                entry: token.recordedEntryID,
                candidates: token.recordedCandidateIDs,
                highlighted: LinkedJapaneseText.matchesQuery(token, queryRanges: ranges)
                  ? true : nil
              )
            }
          ))
      }
      result[index].examples = WordDetailCase.FormExamples(
        ids: examples.map(\.id.rawValue), shown: shown)
    }
    return result
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
              entry: token.recordedEntryID,
              candidates: token.recordedCandidateIDs,
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
  let exampleLimit: Int
  let formExampleLimit: Int
  var cases: [WordDetailCase]
}

private struct WordDetailCase: Codable {
  let id: String
  let covers: String?
  var languageReferenceID: String?
  var entSeq: [String]?
  var headword: String?
  var reading: String?
  var furigana: [Furigana]?
  var partOfSpeech: String?
  var opensConjugations: Bool?
  var conjugations: Conjugations?
  var pitch: Pitch?
  var senses: [Sense]?
  var frequency: [Frequency]?
  var alternativeForms: [Form]?
  var kanji: [Kanji]?
  var alternativeKanji: [Kanji]?
  var relatedWords: [Related]?
  var examples: Examples?

  init(id: String, covers: String?) {
    self.id = id
    self.covers = covers
  }

  struct Conjugations: Codable {
    let summary: String
    let rule: String
    let modes: [String]
    var plain: [Form]
    var polite: [Form]?

    struct Form: Codable {
      let kind: String
      let title: String
      let explanation: String
      let surface: String
      let reading: String
      let ending: String
      let rowFurigana: Bool
      let furigana: [Furigana]
      let sharedSpellings: [String]?
      var examples: FormExamples?
    }

    init(entry: DictionaryEntry, table: ConjugationTable) {
      func forms(_ mode: ConjugationMode) -> [Form] {
        table.forms(for: mode).map { form in
          let shared = table.sharedSpellings(of: form, in: mode)
          return Form(
            kind: form.id.rawValue,
            title: form.id.presentation.title,
            explanation: form.id.presentation.explanation,
            surface: form.surface,
            reading: form.reading,
            ending: form.ending,
            rowFurigana: form.rowShowsFurigana,
            furigana: JapaneseRubyAnnotation.segments(surface: form.surface, reading: form.reading)
              .map {
                Furigana(
                  base: $0.base, reading: $0.reading,
                  kanjiReadings: JapaneseRubyText.kanjiReadings($0))
              },
            sharedSpellings: shared.isEmpty ? nil : shared
          )
        }
      }
      summary = entry.summary
      rule = table.rule
      modes = table.supportsModes ? ConjugationMode.allCases.map(\.rawValue) : ["Plain"]
      plain = forms(.plain)
      polite = table.supportsModes ? forms(.polite) : nil
    }
  }

  struct Furigana: Codable {
    let base: String
    let reading: String?
    let kanjiReadings: [String]?
  }

  struct Pitch: Codable {
    let downstep: Int
    let moraCount: Int
    let levels: String
    let particle: String
    let source: String
    let graph: PitchGraph?
  }

  struct PitchGraph: Codable {
    let morae: [String]
    let points: [Point]
    let particle: Point

    struct Point: Codable {
      let x: Int
      let level: String
    }

    init(_ layout: PitchContourLayout) {
      func point(_ point: PitchContourLayout.Point) -> Point {
        Point(x: Int((point.x * 100).rounded()), level: point.high ? "H" : "L")
      }
      morae = layout.morae
      points = layout.points.map(point)
      particle = point(layout.particle)
    }
  }

  struct Sense: Codable {
    let meaning: String
    let notes: [String]
    let partsOfSpeech: [String]
  }

  struct Frequency: Codable {
    let pack: String?
    let name: String
    let text: String
    let tier: String?
    let details: FrequencyDetails?
  }

  struct FrequencyDetails: Codable {
    let pack: Pack?
    let section: String
    let rows: [Row]
    let explanation: String?

    struct Pack: Codable {
      let name: String
      let domain: String
      let description: String
      let version: String
      let source: String
    }

    struct Row: Codable {
      let label: String
      let value: String
    }

    init(_ presentation: FrequencyDisclosurePresentation) {
      pack = presentation.pack.map {
        Pack(
          name: $0.name, domain: $0.domain, description: $0.description, version: $0.version,
          source: $0.source)
      }
      section = presentation.section
      rows = presentation.rows.map { Row(label: $0.label, value: $0.value) }
      explanation = presentation.explanation
    }
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
    let listed: Int
    let reportedCount: String?
    let truncated: Bool
    let error: String?
    let shown: [Example]
  }

  struct Example: Codable {
    let id: String
    let japanese: String
    let english: String
    let tokens: [Token]
  }

  struct FormExamples: Codable {
    let ids: [String]
    let shown: [FormExample]
  }

  struct FormExample: Codable {
    let id: String
    let japanese: String
    let english: String
    let tokens: [FormToken]
  }

  struct FormToken: Codable {
    let surface: String
    let entry: String?
    let candidates: [String]?
    let highlighted: Bool?
  }

  struct Token: Codable {
    let surface: String
    let entry: String?
    let candidates: [String]?
    let pageWord: Bool?
  }
}
