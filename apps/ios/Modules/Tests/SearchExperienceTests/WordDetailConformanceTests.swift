import Foundation
import Testing

@testable import SearchExperience

@Suite("Word detail conformance suite")
struct WordDetailConformanceTests {
  static let artifactNames =
    [
      "LanguageReferenceData.sqlite3", "CompoundPitch.sqlite3", "ExampleWordIndex.sqlite3",
      "JLPTLevelPack.sqlite3", "TUBELEXFrequencyPack.sqlite3", "FrequencyPackCatalog.json",
      "KanjiReferenceData.json",
    ] + TokenizerDictionary.files.map { "Kuromoji/\($0)" }

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
  let textAnalysisClient = JapaneseTextAnalysisClient.live()
  let core: PresentationCore

  init() async throws {
    core = PresentationCore(
      listing: try FrequencyPackManager.freshInstall(storagePrefix: "WordDetailConformance").lists)
    let availability = await textAnalysisClient.availability()
    guard availability == .full else { throw WordDetailObserverError.textAnalysisUnavailable }
  }

  func observe(_ recorded: WordDetailCase, exampleLimit: Int, formExampleLimit: Int) async throws
    -> WordDetailCase
  {
    var observed = WordDetailCase(id: recorded.id, covers: recorded.covers)
    guard let entry = try await lookupClient.entry(LanguageReferenceID(rawValue: recorded.id)),
      let page = WordPage(entry, using: core)
    else { return observed }

    observed.languageReferenceID = entry.id.rawValue
    observed.entSeq = entry.sourceProvenances.map(\.sourceRecordID)
    observed.headword = entry.headword
    observed.reading = entry.reading
    observed.furigana = page.ruby.map(WordDetailCase.Furigana.init)
    observed.partOfSpeech = page.partOfSpeech
    observed.opensConjugations = page.conjugations != nil
    if let table = page.conjugations {
      var conjugations = WordDetailCase.Conjugations(summary: entry.summary, table: table)
      conjugations.plain = await formExamples(conjugations.plain, limit: formExampleLimit)
      if let polite = conjugations.polite {
        conjugations.polite = await formExamples(polite, limit: formExampleLimit)
      }
      observed.conjugations = conjugations
    }
    if let pitch = page.pitch {
      observed.pitch = WordDetailCase.Pitch(
        downstep: pitch.downstep,
        moraCount: pitch.moraCount,
        levels: pitch.morae.map { $0.high ? "H" : "L" }.joined(),
        particle: pitch.particleHigh ? "H" : "L",
        source: pitch.source,
        graph: WordDetailCase.PitchGraph(pitch)
      )
    }
    observed.senses = zip(page.senses, entry.senses).map { shown, sense in
      WordDetailCase.Sense(
        meaning: shown.meaning, notes: shown.notes,
        partsOfSpeech: sense.partsOfSpeech.map(\.rawValue))
    }
    observed.frequency = page.frequency.map(WordDetailCase.Frequency.init)
    observed.alternativeForms = page.alternatives.map {
      WordDetailCase.Form(value: $0.value, kind: $0.kind.rawValue, labels: $0.labels)
    }
    observed.kanji = try kanji(page.kanji)
    observed.alternativeKanji = try kanji(page.alternativeKanji)
    observed.relatedWords = zip(page.related, entry.relationships).map { shown, relationship in
      WordDetailCase.Related(
        headword: shown.headword, reading: shown.reading, relation: shown.relation,
        summary: shown.summary, targetID: relationship.targetID)
    }
    observed.examples = try await examples(entry, limit: exampleLimit)
    return observed
  }

  private func formExamples(
    _ forms: [WordDetailCase.Conjugations.Form], limit: Int
  ) async -> [WordDetailCase.Conjugations.Form] {
    var result = forms
    for (index, form) in forms.enumerated() {
      let examples = await exampleSentenceClient.formExamples(form.surface)
      let query = SearchQuery(form.surface)
      var shown: [WordDetailCase.FormExample] = []
      for sentence in examples.prefix(limit) {
        let tokens = await textAnalysisClient.linkedTokens(sentence.japanese, query, nil)
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
                highlighted: token.matchesQuery ? true : nil
              )
            }
          ))
      }
      result[index].examples = WordDetailCase.FormExamples(
        ids: examples.map(\.id.rawValue), shown: shown)
    }
    return result
  }

  private func kanji(_ characters: [String]) throws -> [WordDetailCase.Kanji] {
    try characters.compactMap(KanjiCharacter.init).map { kanji in
      WordDetailCase.Kanji(
        character: kanji.rawValue,
        meanings: try KanjiPage(kanji, words: [], openedFrom: nil).meanings)
    }
  }

  private func examples(_ entry: DictionaryEntry, limit: Int) async throws
    -> WordDetailCase.Examples
  {
    let retrieval: EntryExamples
    do {
      retrieval = try await exampleSentenceClient.entryExamples(entry)
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
              pageWord: token.isPageWord ? true : nil
            )
          }
        ))
    }
    let reportedCount = retrieval.count > 50 ? "more than 50" : "\(retrieval.count)"
    return WordDetailCase.Examples(
      listed: retrieval.sentences.count,
      reportedCount: reportedCount,
      truncated: retrieval.truncated,
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

    init(summary: String, table: SearchExperience.Conjugations) {
      func forms(_ mode: String) -> [Form] {
        (table.rows[mode] ?? []).map { row in
          Form(
            kind: row.kind,
            title: row.title,
            explanation: row.explanation,
            surface: row.surface,
            reading: row.reading,
            ending: row.ending,
            rowFurigana: row.rowFurigana,
            furigana: row.ruby.map(Furigana.init),
            sharedSpellings: row.sharedSpellings.isEmpty ? nil : row.sharedSpellings
          )
        }
      }
      self.summary = summary
      rule = table.rule
      modes = table.modes
      plain = forms("Plain")
      polite = table.modes.contains("Polite") ? forms("Polite") : nil
    }
  }

  struct Furigana: Codable {
    let base: String
    let reading: String?
    let kanjiReadings: [String]?

    init(_ segment: JapaneseRubySegment) {
      base = segment.base
      reading = segment.reading
      kanjiReadings = segment.kanjiReadings
    }
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

    init(_ pitch: WordPage.Pitch) {
      func point(_ point: WordPage.Pitch.Point) -> Point {
        Point(x: Int((point.x * 100).rounded()), level: point.high ? "H" : "L")
      }
      morae = pitch.morae.map(\.mora)
      points = pitch.graph.points.map(point)
      particle = point(pitch.graph.particle)
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

    init(_ row: FrequencyRow) {
      pack = row.pack
      name = row.source
      text = row.value
      tier = row.tier?.spoken
      details = FrequencyDetails(row.details)
    }
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

    init(_ details: FrequencyRow.Details) {
      pack = details.pack.map {
        Pack(
          name: $0.name, domain: $0.domain, description: $0.description, version: $0.version,
          source: $0.source)
      }
      section = details.section
      rows = details.rows.map { Row(label: $0.label, value: $0.value) }
      explanation = details.explanation
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
