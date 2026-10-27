import Foundation
import Testing

@testable import SearchExperience

@Suite("Kanji detail conformance suite")
struct KanjiDetailConformanceTests {
  static let artifactNames = [
    "LanguageReferenceData.sqlite3", "KanjiReferenceData.json", "KanjiElementReferenceData.json",
    "KanjiStrokeData.sqlite3",
  ]

  @Test("Kanji Detail shows what the suite recorded")
  func kanjiDetailMatchesSuite() async throws {
    let url = DetailConformance.suiteURL("kanji-detail.json")
    var suite = try JSONDecoder().decode(KanjiDetailSuite.self, from: Data(contentsOf: url))
    let artifacts = try await DetailConformance.artifacts(Self.artifactNames)
    let observer = KanjiDetailObserver()
    #expect(KanjiPage.sectionsWithoutContent.map { $0.title.uppercased() } == ["LISTS", "NOTES"])

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        suite.cases[index] = try await observer.observe(suite.cases[index])
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try await observer.observe(expected)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(differences.isEmpty, "\(expected.character) differs in \(differences)")
    }
  }
}

private struct KanjiDetailObserver {
  let kanjiLookupClient = KanjiLookupClient.live(lookupClient: .live)
  let kanjiStrokeOrderClient = KanjiStrokeOrderClient.live

  static func sectionsTheViewDrew(_ page: KanjiPage) -> [String] {
    var titles: [String] = []
    if page.hasReference {
      titles.append("READINGS")
      if !page.components.isEmpty { titles.append("COMPONENTS") }
    }
    if !page.elements.isEmpty { titles.append("ELEMENTS") }
    titles += ["LISTS", "NOTES"]
    if !page.words.isEmpty { titles.append("WORDS") }
    return titles
  }

  func observe(_ recorded: KanjiDetailCase) async throws -> KanjiDetailCase {
    var observed = KanjiDetailCase(character: recorded.character, covers: recorded.covers)
    observed.codePoint = recorded.character.unicodeScalars
      .map { "U+" + String($0.value, radix: 16, uppercase: true) }
      .joined(separator: " ")
    guard let character = KanjiCharacter(recorded.character) else {
      observed.opensDetail = false
      return observed
    }
    observed.opensDetail = true

    let relatedWords = try await kanjiLookupClient.relatedWords(character)
    let page = try kanjiLookupClient.page(character, relatedWords, nil)
    #expect(
      page.sections.map { $0.title.uppercased() } == Self.sectionsTheViewDrew(page),
      "\(recorded.character) draws other sections than Kanji Detail did")
    let diagram = try await kanjiStrokeOrderClient.diagram(character)
    func stat(_ kind: String) -> String? { page.stats.first { $0.kind == kind }?.value }

    observed.hasReference = page.hasReference
    if page.hasReference {
      observed.strokeCount = stat("strokes").flatMap(Int.init)
      observed.grade = stat("grade").flatMap(Int.init)
      observed.jlpt = stat("jlpt")
      observed.meanings = page.meanings
      observed.readings = page.readings.map { reading in
        KanjiDetailCase.Reading(
          kind: reading.kind,
          value: reading.value,
          spoken: reading.spoken,
          words: reading.words.map(KanjiDetailCase.Word.init)
        )
      }
      if !page.components.isEmpty {
        observed.components = page.components
      }
    }
    observed.elements = page.elements.map { element in
      KanjiDetailCase.Element(
        glyph: element.id.rawValue,
        role: element.role,
        meanings: element.meanings,
        linkedOnReadings: element.meanings.isEmpty ? element.linkedOnReadings : nil
      )
    }
    observed.words = page.words.map(KanjiDetailCase.Word.init)
    observed.hasStrokeOrder = diagram != nil
    observed.strokeOrderStrokes = diagram?.strokes.count
    return observed
  }
}

private struct KanjiDetailSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  var cases: [KanjiDetailCase]
}

private struct KanjiDetailCase: Codable {
  let character: String
  let covers: String?
  var codePoint: String?
  var opensDetail: Bool?
  var hasReference: Bool?
  var strokeCount: Int?
  var grade: Int?
  var jlpt: String?
  var meanings: [String]?
  var readings: [Reading]?
  var elements: [Element]?
  var components: [String]?
  var words: [Word]?
  var hasStrokeOrder: Bool?
  var strokeOrderStrokes: Int?

  init(character: String, covers: String?) {
    self.character = character
    self.covers = covers
  }

  struct Reading: Codable {
    let kind: String
    let value: String
    let spoken: String?
    let words: [Word]
  }

  struct Element: Codable {
    let glyph: String
    let role: String
    let meanings: [String]
    let linkedOnReadings: [String]?
  }

  struct Word: Codable {
    let id: String
    let headword: String
    let reading: String
    let summary: String

    init(_ entry: DictionaryEntry) {
      id = entry.id.rawValue
      headword = entry.headword
      reading = entry.reading
      summary = entry.summary
    }
  }
}
