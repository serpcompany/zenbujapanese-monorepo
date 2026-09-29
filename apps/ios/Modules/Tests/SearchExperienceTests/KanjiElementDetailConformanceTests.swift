import Foundation
import Testing

@testable import SearchExperience

/// Checks what the kanji element screen shows against the app-recorded suite in
/// `apps/ios/LanguageData/Conformance/kanji-element-detail.json`, so the website's element pages
/// can be held to the app. Each case is read from the client `KanjiElementDetailView` uses, through
/// the presentation the view shares (`KanjiElementSection`, `headerMeanings`,
/// `meaningExplanation`, `soundPatterns`, `rowMeanings`, `rowReadings`, and the provenance text),
/// so the suite records what the view draws.
///
/// After an intended change to the element screen or its data, record it again by running this
/// suite with `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, and review the diff. Recording keeps each
/// case's `element` and `covers` and rewrites the rest.
@Suite("Kanji element detail conformance suite")
struct KanjiElementDetailConformanceTests {
  static let artifactNames = ["KanjiElementReferenceData.json"]

  @Test("The element screen shows what the suite recorded")
  func kanjiElementDetailMatchesSuite() async throws {
    let url = DetailConformance.suiteURL("kanji-element-detail.json")
    var suite = try JSONDecoder().decode(KanjiElementDetailSuite.self, from: Data(contentsOf: url))
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let lookupClient = KanjiElementLookupClient.live

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        suite.cases[index] = try await observe(suite.cases[index], lookupClient)
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try await observe(expected, lookupClient)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(differences.isEmpty, "\(expected.element) differs in \(differences)")
    }
  }

  private func observe(
    _ recorded: KanjiElementDetailCase,
    _ lookupClient: KanjiElementLookupClient
  ) async throws -> KanjiElementDetailCase {
    var observed = KanjiElementDetailCase(element: recorded.element, covers: recorded.covers)
    observed.codePoint = recorded.element.unicodeScalars
      .map { "U+" + String($0.value, radix: 16, uppercase: true) }
      .joined(separator: " ")
    // Only a single ideograph is an element the screen can open.
    guard let id = KanjiElementID(recorded.element) else {
      observed.opensDetail = false
      return observed
    }
    observed.opensDetail = true
    guard let entry = try await lookupClient.entry(id) else {
      observed.found = false
      return observed
    }
    observed.found = true
    observed.meanings = entry.headerMeanings
    observed.sections = entry.sections.map(\.title)
    observed.alternatives = entry.alternatives.map(\.rawValue)
    observed.meaningExplanation = entry.meaningExplanation
    observed.soundPatterns = entry.soundPatterns
    observed.standaloneKanji = entry.standaloneKanji.map(KanjiElementDetailCase.Row.init)
    observed.containingKanji = entry.containingKanji.map(KanjiElementDetailCase.Row.init)
    observed.structureSource = entry.structureProvenance.text
    observed.metadataSource = entry.metadataProvenance.text
    observed.sourceNote = KanjiElementEntry.sourceNote
    return observed
  }
}

private struct KanjiElementDetailSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  var cases: [KanjiElementDetailCase]
}

/// One element's screen. Only `element` and `covers` are written by hand.
private struct KanjiElementDetailCase: Codable {
  let element: String
  /// Why the case is in the suite.
  let covers: String?
  var codePoint: String?
  /// Whether the element is a single ideograph, the only kind of element the screen opens.
  var opensDetail: Bool?
  /// Whether the element reference has the element; without it the screen shows No Element
  /// Reference.
  var found: Bool?
  /// The meanings under the glyph.
  var meanings: String?
  /// The section titles, in the order the screen shows them.
  var sections: [String]?
  /// Each alternative form, which opens its own element screen.
  var alternatives: [String]?
  var meaningExplanation: String?
  var soundPatterns: String?
  var standaloneKanji: Row?
  /// Every kanji containing the element, in order, leaving out the standalone kanji.
  var containingKanji: [Row]?
  var structureSource: String?
  var metadataSource: String?
  var sourceNote: String?

  init(element: String, covers: String?) {
    self.element = element
    self.covers = covers
  }

  /// A kanji's row, which opens its Kanji Detail.
  struct Row: Codable {
    let character: String
    let meanings: String?
    let readings: String?

    init(_ contribution: KanjiElementContribution) {
      character = contribution.character.rawValue
      meanings = contribution.rowMeanings
      readings = contribution.rowReadings
    }
  }
}
