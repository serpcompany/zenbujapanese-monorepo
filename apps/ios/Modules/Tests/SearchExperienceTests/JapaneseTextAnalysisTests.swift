import XCTest

@testable import SearchExperience

final class JapaneseTextAnalysisTests: XCTestCase {
  func testInflectedOccurrencesRepresentTheCurrentCanonicalEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entryMatchingForm("見る")
    let currentEntry = try XCTUnwrap(matchedEntry)
    let tokens = await JapaneseTextAnalysisClient.live(lookupClient: lookup).linkedTokens(
      "見て、見て。",
      SearchQuery(currentEntry.headword),
      currentEntry
    )

    let occurrences = tokens.filter { $0.surface == "見て" }
    XCTAssertEqual(occurrences.count, 2)
    XCTAssertTrue(occurrences.allSatisfy { $0.represents(currentEntry) })
  }

  func testExplicitHighlightedEntryOwnsItsKanaReadingOccurrence() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entryMatchingForm("要る")
    let highlightedEntry = try XCTUnwrap(matchedEntry)
    let tokens = await JapaneseTextAnalysisClient.live(lookupClient: lookup).linkedTokens(
      "車がいるの？",
      SearchQuery(highlightedEntry.headword),
      highlightedEntry
    )
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "いる" })
    XCTAssertEqual(occurrence.entry?.id, highlightedEntry.id)
    XCTAssertEqual(occurrence.entry?.headword, "要る")
    XCTAssertEqual(occurrence.entry?.reading, "いる")
    XCTAssertEqual(
      occurrence.entry?.summary,
      "to be needed, to be necessary, to be required, to be wanted, to need, to want"
    )
  }

  func testAmbiguousKanaHomographKeepsWordBoundaryWithoutChoosingAnEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let tokens = await JapaneseTextAnalysisClient.live(lookupClient: lookup).linkedTokens(
      "車がいるの？",
      SearchQuery("いる"),
      nil
    )

    XCTAssertEqual(tokens.map(\.surface).joined(), "車がいるの？")
    XCTAssertFalse(tokens.contains { $0.surface == "がい" })
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "いる" })
    XCTAssertNil(occurrence.entry)
  }

  func testHighlightedEntryFormsReserveBoundariesFromParticlesAndPunctuation() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let cases = [
      (
        id: "8647047758cffbea50d72922fad277e0",
        text: "彼がいる？",
        surface: "いる",
        headword: "いる"
      ),
      (
        id: "8647047758cffbea50d72922fad277e0",
        text: "彼が居る。",
        surface: "居る",
        headword: "いる"
      ),
      (
        id: "e85ded84cc6528b1785230911b2ab431",
        text: "いる。",
        surface: "いる",
        headword: "射る"
      ),
      (
        id: "856095faec102f96bc40f7c592b41f21",
        text: "豆を煎る。",
        surface: "煎る",
        headword: "炒る"
      ),
    ]

    for example in cases {
      let matchedEntry = try await lookup.entry(LanguageReferenceID(rawValue: example.id))
      let highlightedEntry = try XCTUnwrap(matchedEntry)
      let tokens = await JapaneseTextAnalysisClient.live(lookupClient: lookup).linkedTokens(
        example.text,
        SearchQuery(highlightedEntry.headword),
        highlightedEntry
      )

      XCTAssertEqual(tokens.map(\.surface).joined(), example.text, example.text)
      let occurrence = try XCTUnwrap(
        tokens.first { $0.surface == example.surface },
        "\(example.text): \(tokens.map { "\($0.surface)=\($0.entry?.headword ?? "nil")" })")
      XCTAssertEqual(occurrence.entry?.id, highlightedEntry.id, example.text)
      XCTAssertEqual(occurrence.entry?.headword, example.headword, example.text)
      XCTAssertFalse(tokens.contains { $0.surface == "がい" }, example.text)
    }
  }

  func testOtherVerbsRemainSeparateFromAdjacentParticles() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let analyzer = JapaneseTextAnalysisClient.live(lookupClient: lookup)
    let cases = [
      (text: "猫を見る。", surface: "見る", headword: "見る"),
      (text: "ご飯を食べる。", surface: "食べる", headword: "食べる"),
      (text: "見ているだけだ。", surface: "見て", headword: "見る"),
    ]

    for example in cases {
      let tokens = await analyzer.linkedTokens(example.text, SearchQuery(""), nil)
      XCTAssertEqual(tokens.map(\.surface).joined(), example.text, example.text)
      let occurrence = try XCTUnwrap(tokens.first { $0.surface == example.surface })
      XCTAssertEqual(occurrence.entry?.headword, example.headword, example.text)
    }
  }

  func testHighlightedReadingDoesNotSplitACompleteLongerDictionaryForm() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entry(
      LanguageReferenceID(rawValue: "d12d09f1107aef0f7d43b54b62f0b7e1"))
    let highlightedEntry = try XCTUnwrap(matchedEntry)
    let tokens = await JapaneseTextAnalysisClient.live(lookupClient: lookup).linkedTokens(
      "道具を用いる。",
      SearchQuery(highlightedEntry.headword),
      highlightedEntry
    )

    XCTAssertEqual(tokens.map(\.surface).joined(), "道具を用いる。")
    XCTAssertFalse(tokens.contains { $0.surface == "いる" })
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "用いる" })
    XCTAssertEqual(occurrence.entry?.headword, "用いる")
  }
}
