import Foundation
import Observation
import Testing
import os

@testable import SearchExperience

@Suite("The learner's frequency lists, as the core reads them")
struct FrequencyListsTests: SearchResultFixture {
  private var words: [WordRowsRequest.Entry] {
    [first, second].map { WordRowsRequest.Entry(id: $0.id.rawValue, summary: $0.summary) }
  }

  private func chips(_ core: DictionaryCore) throws -> [[String]] {
    let rows: [ListedWord] = try core.answer(
      "wordRows", try DictionaryCore.argument(WordRowsRequest(entries: words, known: [])))
    return rows.map { row in row.chips.map { "\($0.source) \($0.value)" } }
  }

  @Test("until the first lists are published there is nothing to tell the core, and whoever waits is let through then")
  func notReady() async throws {
    let lists = FrequencyLists()
    #expect(lists.version == 0)
    #expect(try lists.told() == nil)
    #expect(try lists.read("SELECT 1 AS value", [], from: youTube.id).error == "The list is not open")
    let ready = OSAllocatedUnfairLock(initialState: false)
    let waiting = Task {
      await lists.ready()
      ready.withLock { $0 = true }
    }
    try await Task.sleep(for: .milliseconds(100))
    #expect(!ready.withLock { $0 })
    lists.publish([])
    await waiting.value
    #expect(ready.withLock { $0 })
    #expect(lists.version == 1)
    #expect(try lists.told() == ToldFrequencyLists(lists: [], unavailable: nil))
    await lists.ready()
  }

  @Test("lists that are opened on demand are opened by whoever first waits for them")
  func openedOnDemand() async {
    let opened = OSAllocatedUnfairLock(initialState: 0)
    let box = OSAllocatedUnfairLock<FrequencyLists?>(initialState: nil)
    let lists = FrequencyLists(opening: {
      opened.withLock { $0 += 1 }
      box.withLock { $0 }?.publish(unavailable: "Bundled frequency data unavailable")
    })
    box.withLock { $0 = lists }
    await lists.ready()
    await lists.ready()
    #expect(opened.withLock { $0 } == 1)
    #expect(lists.version == 1)
  }

  @Test("tells the core each enabled list in the learner's order, with what a learner reads about it")
  func describesEachList() throws {
    let lists = try FrequencyLists.listing(
      FrequencyListFixture(anime, [first.id: 7]), FrequencyListFixture(jlpt, [first.id: 5]))
    #expect(
      try lists.told()
        == ToldFrequencyLists(
          lists: [
            .init(
              dictionary: .init(
                id: "zenbu.jiten.anime.ja.ordered-v2", kind: "rank", name: "Anime",
                domain: "Fixture", description: "Fixture", version: "1", source: "Fixture",
                coveredSourceRows: 100_000), unavailable: nil),
            .init(
              dictionary: .init(
                id: "zenbu.jlpt.waller.levels", kind: "level", name: "JLPT Levels",
                domain: "Fixture", description: "Fixture", version: "1", source: "Fixture",
                coveredSourceRows: 100_000), unavailable: nil),
          ], unavailable: nil))
    #expect(try lists.value(of: first.id, in: anime) == 7)
    #expect(try lists.value(of: first.id, in: jlpt) == 5)
    #expect(try lists.value(of: second.id, in: jlpt) == nil)
  }

  @Test("a list that failed its checks, or whose file can't be opened, is listed with why, beside the ones that can be read")
  func unreadableLists() throws {
    let lists = FrequencyLists()
    lists.publish([
      EnabledFrequencyList(
        dictionary: jlpt, file: .unavailable(FrequencyPackManager.unverifiedList)),
      EnabledFrequencyList(dictionary: anime, file: .verified(URL(filePath: "/missing.sqlite3"))),
      try FrequencyListFixture(youTube, [first.id: 20]).enabled(),
    ])
    let told = try #require(try lists.told())
    #expect(told.ids == [jlpt.id.rawValue, anime.id.rawValue, youTube.id.rawValue])
    #expect(
      told.lists?.map(\.unavailable) == ["Frequency data unavailable", "Pack unavailable", nil])
    #expect(try lists.read("SELECT 1 AS value", [], from: anime.id).error == "The list is not open")
    #expect(try lists.value(of: first.id, in: youTube) == 20)
    let core = try DictionaryCore(frequencyLists: lists.reading)
    #expect(try chips(core) == [["JLPT —", "YouTube 20"], ["JLPT —"]])
  }

  @Test("says why when no frequency data can be read at all")
  func nothingReadable() throws {
    let lists = FrequencyLists()
    lists.publish(unavailable: "Bundled frequency data unavailable")
    #expect(
      try lists.told()
        == ToldFrequencyLists(lists: nil, unavailable: "Bundled frequency data unavailable"))
    #expect(lists.version == 1)
    let core = try DictionaryCore(frequencyLists: lists.reading)
    #expect(try chips(core) == [["Frequency —"], ["Frequency —"]])
  }

  @Test("answers a statement on one list's own connection in the shape the dictionary's rows have, and its failure as an error")
  func rowsOfOneList() throws {
    let lists = try FrequencyLists.listing(
      FrequencyListFixture(youTube, [first.id: 20, second.id: 30]))
    let answered = lists.rows(
      of: youTube.id.rawValue,
      "SELECT lower(hex(language_reference_id)) AS id, rank AS value FROM frequency_evidence "
        + "WHERE language_reference_id IN (SELECT unhex(value) FROM json_each(?)) ORDER BY rank",
      parametersJSON: #"["[\"\#(second.id.rawValue)\",\"\#(first.id.rawValue)\",\"zz\"]"]"#)
    #expect(
      answered.text
        == #"{"rows":[{"id":"\#(first.id.rawValue)","value":20},"#
        + #"{"id":"\#(second.id.rawValue)","value":30}],"blobs":[]}"#)
    #expect(
      try lists.read("SELECT level AS value FROM level_evidence", [], from: youTube.id).error
        == "no such table: level_evidence")
  }

  @Test("a list's rows are read whether or not the task that asks was cancelled")
  func readsInACancelledTask() async throws {
    let lists = try FrequencyLists.listing(FrequencyListFixture(youTube, [first.id: 20]))
    let value = try await Task {
      withUnsafeCurrentTask { $0?.cancel() }
      return try lists.value(of: first.id, in: youTube)
    }.value
    #expect(value == 20)
  }

  @Test("a list's file is replaced or removed only while no connection reads it, and what is there is read from then on")
  func republished() throws {
    let lists = FrequencyLists()
    let downloaded = try FrequencyListFixture(anime, [first.id: 7]).written()
    let installed = EnabledFrequencyList(dictionary: anime, file: .verified(downloaded))
    lists.publish([installed, try FrequencyListFixture(youTube, [first.id: 20]).enabled()])
    #expect(try lists.value(of: first.id, in: anime) == 7)

    let update = try FrequencyListFixture(anime, [first.id: 8, second.id: 9]).written()
    try lists.publish([installed]) {
      _ = try FileManager.default.replaceItemAt(downloaded, withItemAt: update)
    }
    #expect(lists.version == 2)
    #expect(try lists.value(of: first.id, in: anime) == 8)
    #expect(try lists.value(of: second.id, in: anime) == 9)
    #expect(try lists.told()?.ids == [anime.id.rawValue])
    #expect(
      try lists.read("SELECT rank AS value FROM frequency_evidence", [], from: youTube.id).error
        == "The list is not open")

    #expect(throws: FrequencyPackError.packNotRemovable) {
      try lists.publish([]) { throw FrequencyPackError.packNotRemovable }
    }
    #expect(lists.version == 2)
    #expect(try lists.told()?.ids == [anime.id.rawValue])
    #expect(try lists.value(of: first.id, in: anime) == 8)

    try lists.publish([]) { try FileManager.default.removeItem(at: downloaded) }
    #expect(lists.version == 3)
    #expect(try lists.told()?.ids == [])
    #expect(
      try lists.read("SELECT rank AS value FROM frequency_evidence", [], from: anime.id).error
        == "The list is not open")
  }

  @Test("the core reads the lists through its host: every enabled list, in the learner's order")
  func throughTheCore() throws {
    let others = (0..<7).map { index in
      FrequencyListFixture(
        .fixture(id: "zenbu.fixture.list-\(index).ja", displayName: "List \(index)"),
        [first.id: 100 + index])
    }
    let lists = FrequencyLists()
    lists.publish(
      try (others.prefix(3) + [FrequencyListFixture(jlpt, [second.id: 4])] + others.dropFirst(3)
        + [FrequencyListFixture(youTube, [first.id: 20, second.id: 30])]).map { try $0.enabled() })
    let core = try DictionaryCore(frequencyLists: lists.reading)
    #expect(
      try chips(core) == [
        [
          "List 0 100", "List 1 101", "List 2 102", "List 3 103", "List 4 104", "List 5 105",
          "List 6 106", "YouTube 20",
        ],
        ["List 0 —", "JLPT N4", "YouTube 30"],
      ])
  }

  @Test("a core whose host has no lists shows no chips, and one whose lists are not ready says they are loading")
  func withoutLists() throws {
    let request = try DictionaryCore.argument(WordRowsRequest(entries: words, known: []))
    let without: [ListedWord] = try DictionaryCore().answer("wordRows", request)
    #expect(without.map(\.spoken).first == "Result 1 of 2, No frequency dictionary enabled")
    let unready: [ListedWord] = try DictionaryCore(frequencyLists: FrequencyLists().reading)
      .answer("wordRows", request)
    #expect(unready.map(\.spoken).first == "Result 1 of 2, Frequency rank loading")
  }

  @MainActor
  private func isTold(
    of lists: FrequencyLists, after read: @MainActor () -> Void
  ) async throws -> Bool {
    let changed = OSAllocatedUnfairLock(initialState: false)
    withObservationTracking(read) { changed.withLock { $0 = true } }
    guard !changed.withLock({ $0 }) else { return false }
    lists.publish([try FrequencyListFixture(youTube, [first.id: lists.version]).enabled()])
    for _ in 0..<200 where !changed.withLock({ $0 }) {
      try await Task.sleep(for: .milliseconds(10))
    }
    return changed.withLock { $0 }
  }

  @MainActor
  @Test("whatever read the lists while it was drawn is told when they change: the version, a word page built or remembered, and a sheet's rows")
  func observed() async throws {
    let lists = try FrequencyLists.listing(FrequencyListFixture(youTube, [first.id: 20]))
    let core = PresentationCore(listing: lists)
    let entry = first
    let request = WordRowsRequest(entries: words, known: [])
    #expect(try await isTold(of: lists) { _ = lists.version })
    #expect(try await isTold(of: lists) { _ = WordPage(entry, using: core) })
    _ = WordPage(entry, using: core)
    #expect(try await isTold(of: lists) { _ = WordPage(entry, using: core) })
    #expect(try await isTold(of: lists) { _ = request.rowsByEntry(using: core) })
    #expect(WordPage(entry, using: core)?.frequency.map(\.value) == ["4"])
    let unread = PresentationCore(kanji: { KanjiFiles.bundled })
    #expect(try await !isTold(of: lists) { _ = WordPage(entry, using: unread) })
  }
}
