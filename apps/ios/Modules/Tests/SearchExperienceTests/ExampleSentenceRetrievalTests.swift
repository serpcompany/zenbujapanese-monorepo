import Foundation
import SQLite3
import XCTest
@testable import SearchExperience

final class ExampleSentenceRetrievalTests: XCTestCase {
  func testRuntimeSQLiteCapabilityEvidence() async throws {
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
    XCTAssertEqual(japanese.matches.first?.id, "pair-1")
  }

  func testFrozenV1DiscoveryFixturesReplayThroughPublicBoundary() async throws {
    let summary = try fixture(named: "ExampleSentenceRetrieval-v1-summary")
    let rows = try fixture(named: "ExampleSentenceRetrieval-v1-rows")
    let rowsByContext = Dictionary(grouping: rows, by: { $0["context_id"]! })

    for expected in summary {
      let contextID = try XCTUnwrap(expected["context_id"])
      let query = SearchQuery(try XCTUnwrap(expected["query"]))
      let route = try XCTUnwrap(expected["route"])
      let request: ExampleSentenceRetrievalRequest = route == "direct-english"
        ? .directEnglish(query) : .directJapanese(query)
      let result = try await ExampleSentenceClient.live.retrieve(request)

      let expectedCount: ExampleSentenceResultCount = expected["count_kind"] == "exact"
        ? .exact(Int(try XCTUnwrap(expected["count_value"]))!) : .moreThan50
      XCTAssertEqual(result.count, expectedCount, contextID)
      XCTAssertEqual(result.isTruncated, expected["truncated"] == "true", contextID)

      let expectedRows = (rowsByContext[contextID] ?? []).sorted {
        Int($0["result_rank"]!)! < Int($1["result_rank"]!)!
      }
      XCTAssertEqual(result.matches.count, expectedRows.count, contextID)
      for (match, expectedRow) in zip(result.matches, expectedRows) {
        XCTAssertEqual(match.id, expectedRow["pair_id"], contextID)
        XCTAssertEqual(relationName(match.lexicalRelation), expectedRow["lexical_relation"], contextID)
        XCTAssertEqual(match.matchedRange.location, Int(expectedRow["match_location"]!)!, contextID)
        XCTAssertEqual(match.matchedRange.length, Int(expectedRow["match_length"]!)!, contextID)
        XCTAssertEqual(match.rankInputs.englishTermCount, Int(expectedRow["english_term_count"]!)!, contextID)
        XCTAssertEqual(match.rankInputs.japaneseGraphemeCount, Int(expectedRow["japanese_grapheme_count"]!)!, contextID)
        XCTAssertEqual(
          [
            String(match.rankInputs.lexicalRelation.rawValue),
            String(match.rankInputs.matchPosition),
            String(match.rankInputs.englishTermCount),
            String(match.rankInputs.japaneseGraphemeCount),
            match.rankInputs.pairID,
          ].joined(separator: "|"),
          expectedRow["rank_tuple"],
          contextID
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
        id TEXT PRIMARY KEY,
        source_identity TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        japanese TEXT NOT NULL,
        english TEXT NOT NULL
      );
      INSERT INTO example_sentences VALUES ('pair-1', 'fixture', '1', '猫です。', 'It is a cat.');
      """
    guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
      throw CocoaError(.fileWriteUnknown)
    }
    return url
  }

  private func fixture(named name: String) throws -> [[String: String]] {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "tsv"))
    let lines = try String(contentsOf: url, encoding: .utf8).split(separator: "\n")
    let headers = lines[0].split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
    return lines.dropFirst().map { line in
      let values = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      return Dictionary(uniqueKeysWithValues: zip(headers, values))
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
