import Foundation
import SQLite3
import Testing
import os

@testable import SearchExperience

@Suite("The dictionary core in the app")
struct DictionaryCoreTests {
  @Test(
    "a query is the core's normalization of what was typed, scalar for scalar",
    arguments: [
      ("  ＮＩＨＯＮ   go ", "nihon go"), ("Ｄｏｇ　ＤＡＹＳ", "dog days"),
      ("\u{FF76}\u{FF9E}\u{FF77}\u{FF9E}", "\u{30AC}\u{30AE}"), ("\u{FF8A}\u{FF9F}", "\u{30D1}"),
      ("か\u{3099}", "\u{304C}"), ("e\u{301}", "\u{E9}"), ("日本　語", "日本 語"),
      ("\tneko\n", "neko"), ("Ⅻ", "xii"), ("㍿", "株式会社"), ("ΌΣΟΣ", "\u{3CC}\u{3C3}\u{3BF}\u{3C2}"),
      ("食べる", "食べる"), ("", ""), ("   ", ""),
    ])
  func normalization(text: String, normalized: String) {
    #expect(
      Array(SearchQuery(text).value.unicodeScalars) == Array(normalized.unicodeScalars))
  }

  @Test("a sentence nothing matches lists the words its analysis finds, asked for once")
  func analyzedSentence() async throws {
    let asked = OSAllocatedUnfairLock(initialState: [String]())
    let data = LanguageReferenceData(
      validatesBundledArtifact: false,
      morphology: JapaneseMorphologyClient { text in
        asked.withLock { $0.append(text) }
        return Self.analysis(of: text)
      })
    let results = try await data.search(SearchQuery(Self.sentence))
    #expect(results.resolution == .analyzed)
    #expect(results.presentation == .discoveredWords)
    #expect(results.entries.map(\.headword).prefix(2) == ["猫", "犬"])
    #expect(results.entries.count == 3)
    #expect(asked.withLock { $0 } == [Self.sentence])
    let screen = try await ResultsScreenRequest(
      query: SearchQuery(Self.sentence), results: results.listed, exampleCount: 0,
      learner: ResultsLearner(sort: "known-words", filter: "known")
    ).screen(using: try await .freshInstall())
    guard case .results(let list) = screen else {
      Issue.record("The sentence's words have no results screen")
      return
    }
    #expect(list.heading == "Discovered Words")
    #expect(list.sections == [.discoveredWords])
    #expect(list.menu == nil)
    #expect(list.rows.map(\.id) == results.entries.map(\.id.rawValue))
    #expect(list.rows.last?.spoken.hasPrefix("Discovered word 3 of 3, JLPT level N") == true)
    #expect(list.rows.allSatisfy { $0.chips.first?.source == "JLPT" })

    let direct = try await data.search(SearchQuery("猫"))
    #expect(direct.resolution == .direct)
    #expect(asked.withLock { $0 } == [Self.sentence])
  }

  @Test("a sentence finds nothing where no analysis is installed")
  func sentenceWithoutAnalysis() async throws {
    let data = LanguageReferenceData(
      validatesBundledArtifact: false,
      morphology: JapaneseMorphologyClient { _ in throw JapaneseMorphologyError.packUnavailable })
    #expect(try await data.search(SearchQuery(Self.sentence)).isEmpty)
  }

  @Test("a search cancelled while its sentence is analyzed throws, and the next one starts again")
  func cancelledDuringAnalysis() async throws {
    let cancels = OSAllocatedUnfairLock(initialState: true)
    let data = LanguageReferenceData(
      validatesBundledArtifact: false,
      morphology: JapaneseMorphologyClient { text in
        if cancels.withLock({ $0 }) {
          withUnsafeCurrentTask { $0?.cancel() }
          throw CancellationError()
        }
        return Self.analysis(of: text)
      })
    await #expect(throws: CancellationError.self) {
      try await Task { try await data.search(SearchQuery(Self.sentence)) }.value
    }
    cancels.withLock { $0 = false }
    #expect(try await data.search(SearchQuery(Self.sentence)).entries.count == 3)
  }

  @Test("a lookup cancelled before the core reads the dictionary throws as cancelled")
  func cancelledInsideTheCore() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    await #expect(throws: CancellationError.self) {
      try await Task {
        withUnsafeCurrentTask { $0?.cancel() }
        return try await data.entries(matchingForm: "食べる")
      }.value
    }
    #expect(try await data.entries(matchingForm: "食べる").first?.headword == "食べる")
  }

  @Test("an entry duplicated in the dictionary is one entry, under either record's ID")
  func duplicatedEntry() async throws {
    let results = try await LookupClient.live.search(SearchQuery("閻魔"))
    let found = results.entries.filter { $0.headword == "閻魔" && $0.reading == "えんま" }
    let entry = try #require(found.first)
    #expect(found.count == 1)
    #expect(entry.id.rawValue == "176f4e451cc248ec386ac35f98801f36")
    #expect(entry.sourceProvenances.map(\.sourceRecordID) == ["1573970", "5737655"])
    let duplicate = LanguageReferenceID(rawValue: "fc99db6b36d7725f21e054e1a4f745e7")
    #expect(try await LookupClient.live.entry(duplicate) == entry)
    #expect(try await LookupClient.live.entry(entry.id) == entry)
    #expect(try await LookupClient.live.entry(LanguageReferenceID(rawValue: "閻魔")) == nil)
  }

  @Test("a form finds the entries written or read exactly as it, in Japanese or in romaji")
  func exactForms() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let cat = try await data.entries(matchingForm: "猫")
    #expect(cat.first?.headword == "猫")
    #expect(try await data.entries(matchingForm: "ねこ").contains { $0.headword == "猫" })
    #expect(try await data.entries(matchingForm: "neko").contains { $0.headword == "猫" })
    #expect(try await data.entries(matchingForm: "はし").count > 2)
    #expect(try await data.entries(matchingForm: "食べた").isEmpty)
    #expect(try await data.entries(matchingForm: "ゐゑ").isEmpty)
    #expect(try await data.entry(matchingForm: "猫") == cat.first)
    let read = try await data.entries(
      equivalentTo: cat.map(\.id) + [LanguageReferenceID(rawValue: "猫")])
    #expect(read == Dictionary(uniqueKeysWithValues: cat.map { ($0.id, $0) }))
  }

  @Test("a search that reads tens of thousands of rows answers, and so do the lookups after it")
  func lookupsAfterABroadSearch() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let cat = try await data.entries(matchingForm: "猫")
    #expect(try await data.search(SearchQuery("の")).entries.count == 60)
    #expect(try await data.entries(matchingForm: "猫") == cat)
    #expect(try await data.search(SearchQuery("猫")).entries.first == cat.first)
    #expect(try await data.search(SearchQuery("の")).entries.count == 60)
  }

  @Test("a search's answer reaches the results screen as the core wrote it, byte for byte")
  func searchAnswerIsHandedOnAsWritten() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let core = try DictionaryCore(statements: try Self.bundledDictionary())
    for query in ["猫", "to eat", "食べた"] {
      let written = try await core.answerAsWritten("search", query, analyzingWith: nil)
      let results = try await data.search(SearchQuery(query))
      #expect(results.listed == written, "\(query) was written again on its way")
      #expect(!results.entries.isEmpty)
    }
  }

  @Test("a field the core's answer holds that the app doesn't know is still in what the results screen is handed")
  func unknownFieldsSurvive() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let written = try await data.answeredSearch("猫")
    let later = #"{"addedLater":{"kept":["a/b","猫"]},"# + String(written.dropFirst())
    let results = try await data.results(answered: later)
    #expect(results.listed == later)
    #expect(results.entries.first?.headword == "猫")
    #expect(results.entries.count == (try await data.search(SearchQuery("猫"))).entries.count)
    let screen = try await ResultsScreenRequest(
      query: SearchQuery("猫"), results: results.listed, exampleCount: 0,
      learner: ResultsLearner()
    ).screen(using: try await .freshInstall())
    guard case .results(let list) = screen else {
      Issue.record("猫 has no results screen")
      return
    }
    #expect(Set(list.rows.map(\.id)) == Set(results.entries.map(\.id.rawValue)))
  }

  @Test("a call hands back its finished value as the text the core wrote, and nothing before it has one")
  func valueAsWritten() throws {
    let core = try DictionaryCore(statements: try Self.memoryDatabase())
    let call = try core.begin("normalizeQuery", " ＡＢ ")
    #expect(try call.value() == #""ab""#)
    #expect(throws: DictionaryCoreError.failed("Error: translate has answered nothing")) {
      try core.begin("translate", "日本").value()
    }
  }

  @Test("the core says what it cannot do, and the next call still answers")
  func coreFailure() throws {
    let core = try DictionaryCore(statements: try Self.memoryDatabase())
    #expect(throws: DictionaryCoreError.failed("The core has no translate")) {
      try core.begin("translate", "日本").step(String.self)
    }
    #expect(throws: DictionaryCoreError.failed("no such table: forms")) {
      try core.begin("entriesMatchingFirstForms", #"[["日本"]]"#).step([String: [String]].self)
    }
    guard case .finished(let normalized) = try core.begin("normalizeQuery", " ＡＢ ").step(String.self)
    else {
      Issue.record("normalizeQuery did not finish")
      return
    }
    #expect(normalized == "ab")
  }

  @Test("cores made at once on several threads each answer, as the lookup's and the screens' are at launch")
  func coresMadeAtOnce() {
    let answers = OSAllocatedUnfairLock(initialState: [String?]())
    DispatchQueue.concurrentPerform(iterations: 8) { _ in
      let answer: String? = try? DictionaryCore().answer("normalizeQuery", " ＡＢ ")
      answers.withLock { $0.append(answer) }
    }
    #expect(answers.withLock { $0 } == Array(repeating: "ab", count: 8))
  }

  @Test("rows reach the core as JSON, with each SQLite type and its blob columns named")
  func rowsAsJSON() throws {
    let rows = SQLiteJSONRows(statements: try Self.memoryDatabase())
    let answer = try Self.decoded(
      rows.answer(
        """
        SELECT 1 AS whole, 1.5 AS fraction, NULL AS absent,
          'a"b\\c' || char(10) || char(1) || '日本' AS text, x'00ff10' AS bytes, '' AS empty
        UNION ALL SELECT -9007199254740991, 1e100, NULL, '', x'', ''
        """, parametersJSON: "[]"))
    #expect(answer.blobs == ["bytes"])
    #expect(
      answer.rows == [
        [
          "whole": .number(1), "fraction": .number(1.5), "absent": .null,
          "text": .text("a\"b\\c\n\u{1}日本"), "bytes": .text("00ff10"), "empty": .text(""),
        ],
        [
          "whole": .number(-9_007_199_254_740_991), "fraction": .number(1e100), "absent": .null,
          "text": .text(""), "bytes": .text(""), "empty": .text(""),
        ],
      ])
    #expect(
      rows.answer("SELECT 1 WHERE 0", parametersJSON: "[]").text == #"{"rows":[],"blobs":[]}"#)
  }

  @Test("the core's parameters bind as text, whole numbers, fractions, and null, each time anew")
  func parameters() throws {
    let rows = SQLiteJSONRows(statements: try Self.memoryDatabase())
    let sql = """
      SELECT ?1 AS first, typeof(?1) AS firstType, typeof(?2) AS secondType,
        typeof(?3) AS thirdType, typeof(?4) AS fourthType, hex(?1) AS firstBytes
      """
    let first = try Self.decoded(rows.answer(sql, parametersJSON: #"["日本",3,0.5,null]"#))
    #expect(
      first.rows == [
        [
          "first": .text("日本"), "firstType": .text("text"), "secondType": .text("integer"),
          "thirdType": .text("real"), "fourthType": .text("null"),
          "firstBytes": .text("E697A5E69CAC"),
        ]
      ])
    let second = try Self.decoded(rows.answer(sql, parametersJSON: #"["a\u0000b"]"#))
    #expect(second.rows.first?["firstBytes"] == .text("610062"))
    #expect(second.rows.first?["secondType"] == .text("null"))
    let empty = try Self.decoded(rows.answer(sql, parametersJSON: #"[""]"#))
    #expect(empty.rows.first?["firstType"] == .text("text"))
  }

  @Test("a statement SQLite refuses, or a parameter it cannot bind, answers with the reason")
  func failures() {
    let rows = SQLiteJSONRows(statements: try! Self.memoryDatabase())
    #expect(
      rows.answer("SELECT * FROM missing", parametersJSON: "[]").text
        == #"{"error":"no such table: missing"}"#)
    #expect(
      rows.answer("SELECT ?", parametersJSON: #"[{"0":1}]"#).text
        == #"{"error":"Only text, numbers, and null can be bound"}"#)
    #expect(
      rows.answer("SELECT ?", parametersJSON: "{}").text
        == #"{"error":"The parameters are not a JSON array"}"#)
  }

  @Test("reading stops when its task is cancelled")
  func cancelledRead() async {
    let answer = await Task { () -> String in
      withUnsafeCurrentTask { $0?.cancel() }
      return SQLiteJSONRows(statements: try! Self.memoryDatabase())
        .answer("SELECT 1", parametersJSON: "[]").text
    }.value
    #expect(answer == #"{"error":"The search was cancelled"}"#)
  }

  private static let sentence = "猫と犬がいる"

  private static func analysis(of text: String) -> JapaneseMorphologyAnalysis {
    var start = 0
    let words = [("猫", "名詞"), ("と", "助詞"), ("犬", "名詞"), ("が", "助詞"), ("いる", "動詞")]
    return JapaneseMorphologyAnalysis(
      transcript: text,
      candidates: words.map { surface, partOfSpeech in
        defer { start += surface.unicodeScalars.count }
        return JapaneseMorphologyCandidate(
          surface: surface,
          scalarRange: start..<(start + surface.unicodeScalars.count),
          dictionaryForm: surface,
          normalizedForm: surface,
          reading: surface,
          partOfSpeech: [partOfSpeech],
          isOutOfVocabulary: false,
          children: []
        )
      },
      engine: "fixture",
      engineVersion: "1",
      dictionary: "fixture",
      dictionarySHA256: ""
    )
  }

  private static func bundledDictionary() throws -> SQLiteStatements {
    try SQLiteStatements(reading: try #require(Bundle.languageReferenceDataURL))
  }

  private static func memoryDatabase() throws -> SQLiteStatements {
    var opened: OpaquePointer?
    guard sqlite3_open(":memory:", &opened) == SQLITE_OK, let opened else {
      throw LookupDatabaseError.missingBundledData
    }
    return SQLiteStatements(connection: SQLiteConnection(pointer: opened))
  }

  private static func decoded(_ answer: JSONBytes) throws -> Answer {
    try JSONDecoder().decode(Answer.self, from: Data(answer.text.utf8))
  }

  private struct Answer: Decodable {
    let rows: [[String: Value]]
    let blobs: [String]
  }

  private enum Value: Decodable, Equatable {
    case null
    case number(Double)
    case text(String)

    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if container.decodeNil() {
        self = .null
      } else if let number = try? container.decode(Double.self) {
        self = .number(number)
      } else {
        self = .text(try container.decode(String.self))
      }
    }
  }
}
