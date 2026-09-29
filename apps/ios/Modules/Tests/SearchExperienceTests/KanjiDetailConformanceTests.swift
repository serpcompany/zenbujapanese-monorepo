import Foundation
import Testing

@testable import SearchExperience

/// Checks what Kanji Detail shows against the app-recorded suite in
/// `apps/ios/LanguageData/Conformance/kanji-detail.json`, so the website's kanji pages can be
/// held to the app. Each case is read from the clients `KanjiDetailView` uses, opened on its own
/// rather than from a word. JLPT is left out while its old KANJIDIC2 scale is undecided
/// (issue 485). It also records the romaji Reading Aids add, with Romaji on, under each reading
/// and each word (`AppleJapaneseRomanization`, which the views share).
///
/// After an intended change to Kanji Detail or its data, record it again by running this suite
/// with `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, and review the diff. Recording keeps each
/// case's `character` and `covers` and rewrites the rest.
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
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let observer = KanjiDetailObserver()

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

/// Reads one kanji's detail from the same clients the app gives `KanjiDetailView`.
private struct KanjiDetailObserver {
  let kanjiLookupClient = KanjiLookupClient.live(lookupClient: .live)
  let kanjiElementLookupClient = KanjiElementLookupClient.live
  let kanjiStrokeOrderClient = KanjiStrokeOrderClient.live

  func observe(_ recorded: KanjiDetailCase) async throws -> KanjiDetailCase {
    var observed = KanjiDetailCase(character: recorded.character, covers: recorded.covers)
    observed.codePoint = recorded.character.unicodeScalars
      .map { "U+" + String($0.value, radix: 16, uppercase: true) }
      .joined(separator: " ")
    // Only a single ideograph opens Kanji Detail.
    guard let character = KanjiCharacter(recorded.character) else {
      observed.opensDetail = false
      return observed
    }
    observed.opensDetail = true

    let reference = try await kanjiLookupClient.entry(character)
    let elements = try await kanjiElementLookupClient.elements(character)
    let relatedWords = try await kanjiLookupClient.relatedWords(character)
    let diagram = try await kanjiStrokeOrderClient.diagram(character)

    observed.hasReference = reference != nil
    if let reference {
      observed.strokeCount = reference.strokeCount
      observed.grade = reference.grade
      observed.meanings = reference.meanings
      observed.readings = reference.readings.map { reading in
        KanjiDetailCase.Reading(
          kind: reading.kind.rawValue,
          value: reading.value,
          romaji: AppleJapaneseRomanization.romanizeTrustedReading(reading.value),
          words: reading.words(in: relatedWords).map(KanjiDetailCase.Word.init)
        )
      }
      // Components show only when there are no elements.
      if elements.isEmpty, !reference.components.isEmpty {
        observed.components = reference.components
      }
    }
    observed.elements = elements.map { element in
      KanjiDetailCase.Element(
        glyph: element.id.rawValue,
        role: element.role.rawValue,
        meanings: Array(element.meanings.prefix(3)),
        linkedOnReadings: element.meanings.isEmpty ? element.commonLinkedOnReadings : nil
      )
    }
    observed.words = relatedWords.map(KanjiDetailCase.Word.init)
    observed.wordsRomaji = relatedWords.map {
      AppleJapaneseRomanization.romanizeTrustedReading($0.reading)
    }
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

/// One character's Kanji Detail. Only `character` and `covers` are written by hand.
private struct KanjiDetailCase: Codable {
  let character: String
  /// Why the case is in the suite.
  let covers: String?
  var codePoint: String?
  /// Whether the app opens Kanji Detail for the character at all.
  var opensDetail: Bool?
  /// Whether KANJIDIC2 has the character; without it the page shows no metrics, meanings, or
  /// readings.
  var hasReference: Bool?
  var strokeCount: Int?
  var grade: Int?
  var meanings: [String]?
  /// In the reference's order, each with the words the Readings section shows beside it.
  var readings: [Reading]?
  var elements: [Element]?
  /// Shown instead of elements when the character has none.
  var components: [String]?
  /// The Words section: up to 24 words containing the kanji, in order.
  var words: [Word]?
  /// The romaji under each of those words, with Romaji on.
  var wordsRomaji: [String?]?
  /// Whether there's stroke data, which offers the stroke order diagram.
  var hasStrokeOrder: Bool?
  /// The number of strokes the diagram draws.
  var strokeOrderStrokes: Int?

  init(character: String, covers: String?) {
    self.character = character
    self.covers = covers
  }

  struct Reading: Codable {
    let kind: String
    let value: String
    /// Under the reading, with Romaji on.
    let romaji: String?
    let words: [Word]
  }

  struct Element: Codable {
    let glyph: String
    let role: String
    /// Up to three meanings, as shown.
    let meanings: [String]
    /// Shown when the element has no meanings.
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
