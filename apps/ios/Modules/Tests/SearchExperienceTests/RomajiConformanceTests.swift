import Foundation
import Testing

@testable import SearchExperience

@Suite("Romaji conformance suite")
struct RomajiConformanceTests {
  private struct Suite: Decodable {
    struct Group: Decodable {
      struct Reading: Decodable {
        let reading: String
        let romaji: String?
      }

      let covers: String
      let readings: [Reading]
    }

    struct Sentence: Decodable {
      struct Word: Decodable {
        let surface: String
        let reading: String?
      }

      let covers: String
      let words: [Word]
      let romaji: String?
    }

    let cases: [Group]
    let sentences: [Sentence]
  }

  private func suite() throws -> Suite {
    try JSONDecoder().decode(
      Suite.self, from: Data(contentsOf: DetailConformance.suiteURL("romaji.json")))
  }

  @Test("a reading is written in romaji as the suite recorded")
  func readings() async throws {
    for group in try suite().cases {
      for expected in group.readings {
        await Task.yield()
        #expect(
          PresentationCore.shared.romaji(expected.reading) == expected.romaji,
          "\(expected.reading) (\(group.covers))")
      }
    }
  }

  @Test("a sentence's words are spaced and joined as the suite recorded")
  func sentences() async throws {
    for expected in try suite().sentences {
      await Task.yield()
      let words = expected.words.map { (surface: $0.surface, reading: $0.reading) }
      #expect(PresentationCore.shared.romaji(of: words) == expected.romaji, "\(expected.covers)")
    }
  }

  @Test("a linked sentence carries where its punctuation attaches, and its function words")
  func linkedWords() async throws {
    let tokens = await JapaneseTextAnalysisClient.live().linkedTokens(
      "「ペンを持っていますか」", SearchQuery(""), nil)
    #expect(tokens.first?.surface == "「")
    #expect(tokens.first?.lineBreak == .attachesToNext)
    #expect(tokens.last?.surface == "」")
    #expect(tokens.last?.lineBreak == .attachesToPrevious)
    let held = try #require(tokens.first { $0.surface.hasPrefix("持") })
    #expect(held.lineBreak == .normal)
    #expect(!held.isFunctionWord)
    let particle = try #require(tokens.first { $0.surface == "を" })
    #expect(particle.isFunctionWord)
    #expect(
      PresentationCore.shared.romaji(of: tokens.map { ($0.surface, $0.reading) })
        == "「pen wo motteimasu ka」")
  }
}
