import Foundation
import Testing

@testable import SearchExperience

@Suite("Kanji element conformance suite")
struct KanjiElementConformanceTests {
  static let artifactNames = ["KanjiElementReferenceData.json"]

  @Test("A kanji element's page shows what the suite recorded")
  func kanjiElementMatchesSuite() throws {
    let url = DetailConformance.suiteURL("kanji-element.json")
    var suite = try JSONDecoder().decode(KanjiElementSuite.self, from: Data(contentsOf: url))
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let observer = KanjiElementObserver()

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        suite.cases[index] = try observer.observe(suite.cases[index])
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try observer.observe(expected)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(
        differences.isEmpty,
        "\(expected.glyph) \(expected.codePoint ?? "") differs in \(differences)")
    }
  }
}

private func codePoints(_ text: String) -> String {
  text.unicodeScalars
    .map { "U+" + String($0.value, radix: 16, uppercase: true) }
    .joined(separator: " ")
}

private struct KanjiElementObserver {
  let kanjiLookupClient = KanjiLookupClient.live(lookupClient: .live)

  func observe(_ recorded: KanjiElementCase) throws -> KanjiElementCase {
    var observed = KanjiElementCase(glyph: recorded.glyph, covers: recorded.covers)
    observed.codePoint = codePoints(recorded.glyph)
    guard let id = KanjiElementID(recorded.glyph) else {
      observed.opensDetail = false
      return observed
    }
    observed.opensDetail = true
    let page = try kanjiLookupClient.element(id)
    observed.hasPage = page != nil
    guard let page else { return observed }
    observed.meanings = page.meanings
    observed.explanation = page.explanation
    observed.soundPatterns = page.soundPatterns
    observed.alternatives = page.alternatives
    observed.alternativeCodePoints = page.alternatives.map(codePoints)
    observed.standalone = page.standalone.map(KanjiElementCase.Kanji.init)
    observed.containing = page.containing.map(KanjiElementCase.Kanji.init)
    observed.structureSource = page.structureSource
    observed.metadataSource = page.metadataSource
    return observed
  }
}

private struct KanjiElementSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  var cases: [KanjiElementCase]
}

private struct KanjiElementCase: Codable {
  let glyph: String
  let covers: String?
  var codePoint: String?
  var opensDetail: Bool?
  var hasPage: Bool?
  var meanings: [String]?
  var explanation: String?
  var soundPatterns: String?
  var alternatives: [String]?
  var alternativeCodePoints: [String]?
  var standalone: Kanji?
  var containing: [Kanji]?
  var structureSource: String?
  var metadataSource: String?

  init(glyph: String, covers: String?) {
    self.glyph = glyph
    self.covers = covers
  }

  struct Kanji: Codable {
    let character: String
    let codePoint: String
    let meanings: [String]
    let onReadings: [String]
    let spoken: String

    init(_ kanji: KanjiElementPage.Kanji) {
      character = kanji.character.rawValue
      codePoint = codePoints(kanji.character.rawValue)
      meanings = kanji.meanings
      onReadings = kanji.onReadings
      spoken = kanji.spoken
    }
  }
}
