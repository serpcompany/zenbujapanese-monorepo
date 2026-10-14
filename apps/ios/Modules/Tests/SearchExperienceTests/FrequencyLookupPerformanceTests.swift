import Foundation
import Testing
import os

@testable import SearchExperience

@Suite("Frequency lookup performance")
struct FrequencyLookupPerformanceTests {
  @Test("identifiers convert to their 16 raw bytes and reject malformed input")
  func identifierBytes() {
    let id = LanguageReferenceID(rawValue: "000102030405060708090a0b0c0d0eff")
    #expect(id.bytes == Data([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 255]))
    #expect(LanguageReferenceID(rawValue: "abc").bytes == nil)
    #expect(LanguageReferenceID(rawValue: String(repeating: "zz", count: 16)).bytes == nil)
  }

  @Test("a results page of lookups uses each list's primary key rather than scanning its table")
  func lookupsStayOnThePrimaryKey() async throws {
    let lists = try FrequencyLists.freshInstall()
    let asked = OSAllocatedUnfairLock(initialState: [(list: String, sql: String)]())
    let core = try DictionaryCore(
      frequencyLists: FrequencyListReading(
        lists: lists.reading.lists,
        rows: { list, sql, parametersJSON in
          asked.withLock { $0.append((list, sql)) }
          return lists.reading.rows(list, sql, parametersJSON)
        }))
    let results = try await LookupClient.live.search(SearchQuery("いる"))
    let ids = Array(results.entries.prefix(60).map(\.id))
    let request = try DictionaryCore.argument(
      WordRowsRequest(
        entries: ids.map { WordRowsRequest.Entry(id: $0.rawValue, summary: "") }, known: []))
    let rows: [ListedWord] = try core.answer("wordRows", request)
    #expect(rows.count == ids.count)
    #expect(rows.contains { $0.chips.count == 2 })

    let statements = asked.withLock { $0 }
    #expect(
      statements.map(\.list) == ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"])
    for (statement, table) in zip(statements, ["level_evidence", "frequency_evidence"]) {
      let plan = try lists.read(
        "EXPLAIN QUERY PLAN \(statement.sql)", ids, from: FrequencyPackID(rawValue: statement.list)
      ).rows?.compactMap(\.detail)
      #expect(
        plan?.contains("SEARCH \(table) USING PRIMARY KEY (language_reference_id=?)") == true,
        "\(statement.list) is read by \(plan ?? [])")
      #expect(plan?.contains { $0.hasPrefix("SCAN \(table)") } == false)
    }
  }
}
