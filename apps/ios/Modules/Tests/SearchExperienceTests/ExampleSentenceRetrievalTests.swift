import Foundation
import SQLite3
import XCTest
@testable import SearchExperience

final class ExampleSentenceRetrievalTests: XCTestCase {
  func testSetSelectsLoanwordWithApplicableQualifiedGlossAndCorroboratingRomaji() async throws {
    let query = SearchQuery("set")
    let result = try await LookupClient.live.search(query)

    let primary = try XCTUnwrap(result.primaryEntry(for: query))
    XCTAssertEqual(primary.headword, "セット")
    XCTAssertEqual(primary.reading, "セット")
    XCTAssertEqual(primary.id.rawValue, "e31152bffef387608184ec15e5ed6416")
  }

  func testLightSelectsExactNounGlossBeforeQualifiedInfinitive() async throws {
    let query = SearchQuery("light")
    let results = try await LookupClient.live.search(query)
    let primary = try XCTUnwrap(results.primaryEntry(for: query))

    XCTAssertEqual(primary.headword, "光")
    XCTAssertEqual(primary.reading, "ひかり")
    XCTAssertEqual(primary.id.rawValue, "07bdd5c3915e39200eee9c4f7a3e1b9b")
  }

  func testHashiSelectsEdgeUsingMatchedReadingPriorityAndNarrowSenseBreadthTieBreak() async throws {
    let query = SearchQuery("はし")
    let results = try await LookupClient.live.search(query)
    let primary = try XCTUnwrap(results.primaryEntry(for: query))

    XCTAssertEqual(primary.headword, "端")
    XCTAssertEqual(primary.reading, "はし")
    XCTAssertEqual(primary.id.rawValue, "8784500933ea7b27b14398efa769d7b8")
  }

  func testDictionaryRankingProtectedJourneysRemainStable() async throws {
    let expectations = [
      ("think", "がる", "がる"),
      ("hello", "今日は", "こんにちは"),
      ("tabeta", "食べる", "たべる"),
      ("makasete", "任せる", "まかせる"),
      ("問題", "問題", "もんだい"),
      ("ねこ", "猫", "ねこ"),
    ]
    for (rawQuery, expectedHeadword, expectedReading) in expectations {
      let query = SearchQuery(rawQuery)
      let results = try await LookupClient.live.search(query)
      let primary = try XCTUnwrap(results.primaryEntry(for: query), rawQuery)
      XCTAssertEqual(primary.headword, expectedHeadword, rawQuery)
      XCTAssertEqual(primary.reading, expectedReading, rawQuery)
    }
  }

  func testRuntimeSQLiteCapabilityEvidence() async throws {
    let validID = "esp1_" + String(repeating: "0", count: 32)
    XCTAssertEqual(ExampleSentenceID(rawValue: validID)?.rawValue, validID)
    XCTAssertNil(ExampleSentenceID(rawValue: "tatoeba:1:2"))
    XCTAssertNil(ExampleSentenceID(rawValue: "esp1_ABCDEF"))
    let version = String(cString: sqlite3_libversion())
    XCTAssertFalse(version.isEmpty)
    let result = try await ExampleSentenceClient.live.retrieve(
      .directEnglish(SearchQuery("scared you"))
    )
    XCTAssertEqual(result.count, .exact(5))
    print(
      "ISSUE151_RUNTIME sqlite=\(version) os=\(ProcessInfo.processInfo.operatingSystemVersionString)"
    )
  }

  func testDiscriminatingEnglishFamiliesThroughPublicBoundary() async throws {
    let client = ExampleSentenceClient.live

    let scared = try await client.retrieve(.directEnglish(SearchQuery("scared you")))
    XCTAssertEqual(scared.count, .exact(5))
    XCTAssertEqual(scared.matches.count, 5)
    XCTAssertEqual(scared.matches.filter(\.exactSurface).count, 1)
    XCTAssertEqual(scared.matches.first?.lexicalRelation, .exactSurfacePhrase)

    let scare = try await client.retrieve(.directEnglish(SearchQuery("scare you")))
    XCTAssertEqual(scare.count, .exact(5))
    XCTAssertEqual(scare.matches.filter(\.exactSurface).count, 4)

    let startled = try await client.retrieve(.directEnglish(SearchQuery("startled you")))
    XCTAssertEqual(startled.count, .exact(0))
    XCTAssertTrue(startled.matches.isEmpty)

    let red = try await client.retrieve(.directEnglish(SearchQuery("red you")))
    XCTAssertEqual(red.count, .exact(0))
    XCTAssertTrue(red.matches.isEmpty)
  }

  func testSingleTermFamiliesUsePorterEligibilityAndCapOnlyAfterRanking() async throws {
    let client = ExampleSentenceClient.live
    let expectations: [(String, ExampleSentenceResultCount, Int, Bool)] = [
      ("cat", .moreThan50, 100, true),
      ("scatter", .exact(21), 21, false),
      ("education", .moreThan50, 100, true),
      ("eat", .moreThan50, 100, true),
      ("great", .moreThan50, 100, true),
      ("neat", .exact(19), 19, false),
    ]
    for (query, count, visibleCount, isTruncated) in expectations {
      let result = try await client.retrieve(.directEnglish(SearchQuery(query)))
      XCTAssertEqual(result.count, count, query)
      XCTAssertEqual(result.matches.count, visibleCount, query)
      XCTAssertEqual(result.isTruncated, isTruncated, query)
      XCTAssertEqual(Set(result.matches.map(\.id)).count, result.matches.count, query)
    }
  }

  func testPunctuationAndInvalidQueriesAreTyped() async throws {
    let client = ExampleSentenceClient.live
    let cat = try await client.retrieve(.directEnglish(SearchQuery("cat")))
    let punctuated = try await client.retrieve(.directEnglish(SearchQuery("cat!")))
    XCTAssertEqual(cat.matches.map(\.id), punctuated.matches.map(\.id))

    await assertInvalid(.empty) {
      _ = try await client.retrieve(.directEnglish(SearchQuery("   ")))
    }
    await assertInvalid(.embeddedQuote) {
      _ = try await client.retrieve(.directEnglish(SearchQuery("scared \"you\"")))
    }
    await assertInvalid(.noPorterTerms) {
      _ = try await client.retrieve(.directEnglish(SearchQuery("!!!")))
    }
    await assertInvalid(.wrongLanguage) {
      _ = try await client.retrieve(.directEnglish(SearchQuery("猫")))
    }
    await assertInvalid(.wrongLanguage) {
      _ = try await client.retrieve(.directJapanese(SearchQuery("cat")))
    }
  }

  func testJapaneseRouteStaysSeparateFromEnglishIndexes() async throws {
    let result = try await ExampleSentenceClient.live.retrieve(.directJapanese(SearchQuery("ねこ")))
    XCTAssertEqual(result.count, .exact(10))
    XCTAssertEqual(result.matches.count, 10)
    XCTAssertTrue(result.matches.allSatisfy { $0.route == .directJapanese })
    XCTAssertTrue(result.matches.allSatisfy { $0.sentence.japanese.contains("ねこ") })
  }

  func testDictionaryEntryRouteUsesAppOwnedEntryEvidence() async throws {
    let lookup = try await LookupClient.live.search(SearchQuery("食べる"))
    let entry = try XCTUnwrap(lookup.primaryEntry(for: SearchQuery("食べる")))
    let result = try await ExampleSentenceClient.live.retrieve(.dictionaryEntry(entry))
    XCTAssertFalse(result.matches.isEmpty)
    XCTAssertTrue(result.matches.allSatisfy { $0.route == .dictionaryEntry })
    XCTAssertTrue(
      result.matches.allSatisfy {
        [.selectedWrittenForm, .alternateWrittenForm, .reading].contains($0.lexicalRelation)
      }
    )
  }

  func testEnglishIndexFailureDoesNotDisableValidJapaneseCorpus() async throws {
    let url = try makeBaseOnlyDatabase()
    defer { try? FileManager.default.removeItem(at: url) }
    let client = ExampleSentenceClient.testing(databaseURL: url)

    do {
      _ = try await client.retrieve(.directEnglish(SearchQuery("cat")))
      XCTFail("Expected fail-closed English retrieval")
    } catch {
      XCTAssertEqual(
        error as? ExampleSentenceRetrievalError,
        .retrievalUnavailable(.invalidIndexMetadata)
      )
    }

    let japanese = try await client.retrieve(.directJapanese(SearchQuery("猫")))
    XCTAssertEqual(japanese.count, .exact(1))
    XCTAssertEqual(
      japanese.matches.first?.id,
      ExampleSentenceID(rawValue: "esp1_" + String(repeating: "0", count: 32))
    )
  }

  func testFrozenV1DiscoveryFixturesReplayThroughPublicBoundary() async throws {
    let summary: [RetrievalSummaryFixture] = try fixtures(
      named: "ExampleSentenceRetrieval-v1-summary"
    )
    let rows: [RetrievalRowFixture] = try fixtures(named: "ExampleSentenceRetrieval-v1-rows")
    let rowsByContext = Dictionary(grouping: rows, by: \.contextID)

    for expected in summary {
      let request: ExampleSentenceRetrievalRequest = expected.route == "direct-english"
        ? .directEnglish(SearchQuery(expected.query))
        : .directJapanese(SearchQuery(expected.query))
      let result = try await ExampleSentenceClient.live.retrieve(request)

      XCTAssertEqual(result.count, expected.resultCount, expected.contextID)
      XCTAssertEqual(result.isTruncated, expected.isTruncated, expected.contextID)

      let expectedRows = (rowsByContext[expected.contextID] ?? []).sorted {
        $0.resultRank < $1.resultRank
      }
      XCTAssertEqual(result.matches.count, expectedRows.count, expected.contextID)
      for (match, expectedRow) in zip(result.matches, expectedRows) {
        XCTAssertEqual(match.id, expectedRow.pairID, expected.contextID)
        XCTAssertEqual(
          relationName(match.lexicalRelation), expectedRow.lexicalRelation, expected.contextID
        )
        XCTAssertEqual(match.matchedRange.location, expectedRow.matchLocation, expected.contextID)
        XCTAssertEqual(match.matchedRange.length, expectedRow.matchLength, expected.contextID)
        XCTAssertEqual(
          match.rankInputs.englishTermCount, expectedRow.englishTermCount, expected.contextID
        )
        XCTAssertEqual(
          match.rankInputs.japaneseGraphemeCount,
          expectedRow.japaneseGraphemeCount,
          expected.contextID
        )
        XCTAssertEqual(
          [
            String(match.rankInputs.lexicalRelation.rawValue),
            String(match.rankInputs.matchPosition),
            String(match.rankInputs.englishTermCount),
            String(match.rankInputs.japaneseGraphemeCount),
            match.rankInputs.pairID.rawValue,
          ].joined(separator: "|"),
          expectedRow.rankTuple,
          expected.contextID
        )
      }
    }
  }

  private func assertInvalid(
    _ reason: ExampleSentenceInvalidQueryReason,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected invalid query: \(reason)")
    } catch {
      XCTAssertEqual(error as? ExampleSentenceRetrievalError, .invalidQuery(reason))
    }
  }

  private func makeBaseOnlyDatabase() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("example-retrieval-\(UUID().uuidString).sqlite3")
    var database: OpaquePointer?
    guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else {
      throw CocoaError(.fileWriteUnknown)
    }
    defer { sqlite3_close(database) }
    let sql = """
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO metadata VALUES ('example_sentences', '1');
      CREATE TABLE example_sentences (
        id BLOB PRIMARY KEY,
        japanese TEXT NOT NULL,
        english TEXT NOT NULL
      );
      CREATE TABLE example_sentence_provenance (
        pair_id BLOB NOT NULL REFERENCES example_sentences(id),
        source_identity TEXT NOT NULL,
        source_japanese_record_id INTEGER NOT NULL,
        source_english_record_id INTEGER NOT NULL,
        PRIMARY KEY(pair_id, source_identity, source_japanese_record_id, source_english_record_id)
      );
      INSERT INTO example_sentences VALUES (
        X'00000000000000000000000000000000',
        '猫です。', 'It is a cat.'
      );
      INSERT INTO example_sentence_provenance VALUES (
        X'00000000000000000000000000000000', 'fixture', 1, 2
      );
      """
    guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
      throw CocoaError(.fileWriteUnknown)
    }
    return url
  }

  private func fixtures<Fixture: TSVFixture>(named name: String) throws -> [Fixture] {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "tsv"))
    let lines = try String(contentsOf: url, encoding: .utf8).split(separator: "\n")
    guard let header = lines.first else { throw FixtureDecodeError.emptyFile(name) }
    let actualHeader = header.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
    guard actualHeader == Fixture.header else { throw FixtureDecodeError.invalidHeader(name) }
    return try lines.dropFirst().enumerated().map { index, line in
      let fields = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      return try Fixture(fields: fields, line: index + 2)
    }
  }

  private func relationName(_ relation: ExampleSentenceLexicalRelation) -> String {
    switch relation {
    case .exactSurfacePhrase: "exact-surface-phrase"
    case .porterEquivalentPhrase: "porter-equivalent-phrase"
    case .entireJapaneseSentence: "entire-japanese-sentence"
    case .containedJapaneseSurface: "contained-japanese-surface"
    case .selectedWrittenForm: "selected-written-form"
    case .alternateWrittenForm: "alternate-written-form"
    case .reading: "reading"
    }
  }
}

private protocol TSVFixture {
  static var header: [String] { get }
  init(fields: [String], line: Int) throws
}

private enum FixtureDecodeError: Error {
  case emptyFile(String)
  case invalidHeader(String)
  case invalidFieldCount(line: Int)
  case invalidInteger(field: String, line: Int)
  case invalidBoolean(field: String, line: Int)
  case invalidCountKind(String, line: Int)
  case invalidPairID(String, line: Int)
}

private func fixtureInteger(_ value: String, field: String, line: Int) throws -> Int {
  guard let result = Int(value) else {
    throw FixtureDecodeError.invalidInteger(field: field, line: line)
  }
  return result
}

private struct RetrievalSummaryFixture: TSVFixture {
  static let header = [
    "context_id", "query", "route", "complete_match_count", "count_kind", "count_value",
    "truncated", "visible_count", "complete_ranked_sha256", "visible_ranked_sha256",
  ]

  let contextID: String
  let query: String
  let route: String
  let completeMatchCount: Int
  let resultCount: ExampleSentenceResultCount
  let isTruncated: Bool
  let visibleCount: Int
  let completeRankedSHA256: String
  let visibleRankedSHA256: String

  init(fields: [String], line: Int) throws {
    guard fields.count == Self.header.count else {
      throw FixtureDecodeError.invalidFieldCount(line: line)
    }
    contextID = fields[0]
    query = fields[1]
    route = fields[2]
    completeMatchCount = try fixtureInteger(fields[3], field: "complete_match_count", line: line)
    let countValue = try fixtureInteger(fields[5], field: "count_value", line: line)
    switch fields[4] {
    case "exact": resultCount = .exact(countValue)
    case "more-than-50": resultCount = .moreThan50
    default: throw FixtureDecodeError.invalidCountKind(fields[4], line: line)
    }
    isTruncated = try Self.boolean(fields[6], field: "truncated", line: line)
    visibleCount = try fixtureInteger(fields[7], field: "visible_count", line: line)
    completeRankedSHA256 = fields[8]
    visibleRankedSHA256 = fields[9]
  }

  private static func boolean(_ value: String, field: String, line: Int) throws -> Bool {
    switch value {
    case "true": true
    case "false": false
    default: throw FixtureDecodeError.invalidBoolean(field: field, line: line)
    }
  }
}

private struct RetrievalRowFixture: TSVFixture {
  static let header = [
    "context_id", "query", "route", "result_rank", "pair_id", "lexical_relation",
    "match_location", "match_length", "english_term_count", "japanese_grapheme_count",
    "rank_tuple",
  ]

  let contextID: String
  let query: String
  let route: String
  let resultRank: Int
  let pairID: ExampleSentenceID
  let lexicalRelation: String
  let matchLocation: Int
  let matchLength: Int
  let englishTermCount: Int
  let japaneseGraphemeCount: Int
  let rankTuple: String

  init(fields: [String], line: Int) throws {
    guard fields.count == Self.header.count else {
      throw FixtureDecodeError.invalidFieldCount(line: line)
    }
    contextID = fields[0]
    query = fields[1]
    route = fields[2]
    resultRank = try fixtureInteger(fields[3], field: "result_rank", line: line)
    guard let pairID = ExampleSentenceID(rawValue: fields[4]) else {
      throw FixtureDecodeError.invalidPairID(fields[4], line: line)
    }
    self.pairID = pairID
    lexicalRelation = fields[5]
    matchLocation = try fixtureInteger(fields[6], field: "match_location", line: line)
    matchLength = try fixtureInteger(fields[7], field: "match_length", line: line)
    englishTermCount = try fixtureInteger(fields[8], field: "english_term_count", line: line)
    japaneseGraphemeCount = try fixtureInteger(
      fields[9], field: "japanese_grapheme_count", line: line
    )
    rankTuple = fields[10]
  }
}
