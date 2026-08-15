import Foundation
import SQLite3

struct ExampleSentenceID: RawRepresentable, Hashable, Comparable, Sendable {
  static let prefix = "esp1_"
  static let encodedByteCount = 16

  let rawValue: String

  init?(rawValue: String) {
    guard rawValue.count == Self.prefix.count + (Self.encodedByteCount * 2),
      rawValue.hasPrefix(Self.prefix),
      rawValue.dropFirst(Self.prefix.count).allSatisfy({ Self.isLowercaseASCIIHexDigit($0) })
    else { return nil }
    self.rawValue = rawValue
  }

  init?(bytes: UnsafeRawBufferPointer) {
    guard bytes.count == Self.encodedByteCount else { return nil }
    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    self.init(rawValue: Self.prefix + hex)
  }

  static func < (left: Self, right: Self) -> Bool {
    left.rawValue < right.rawValue
  }

  private static func isLowercaseASCIIHexDigit(_ character: Character) -> Bool {
    ("0"..."9").contains(character) || ("a"..."f").contains(character)
  }
}

struct ExampleSentence: Hashable, Identifiable, Sendable {
  let id: ExampleSentenceID
  let japanese: String
  let english: String
}

enum ExampleSentenceRetrievalRequest: Hashable, Sendable {
  case directEnglish(SearchQuery)
  case directJapanese(SearchQuery)
  case dictionaryEntry(
    LanguageReferenceID,
    selectedForm: String,
    writtenForms: [String],
    reading: String
  )

  static func dictionaryEntry(_ entry: DictionaryEntry) -> Self {
    .dictionaryEntry(
      entry.id,
      selectedForm: entry.headword,
      writtenForms: entry.writtenForms.map(\.value),
      reading: entry.reading
    )
  }
}

enum ExampleSentenceRetrievalRoute: String, Hashable, Sendable {
  case directEnglish
  case directJapanese
  case dictionaryEntry
}

enum ExampleSentenceLexicalRelation: Int, Hashable, Sendable {
  case exactSurfacePhrase = 0
  case porterEquivalentPhrase = 1
  case entireJapaneseSentence = 2
  case containedJapaneseSurface = 3
  case selectedWrittenForm = 4
  case alternateWrittenForm = 5
  case reading = 6
}

struct ExampleSentenceMatchedRange: Hashable, Sendable {
  let location: Int
  let length: Int
}

struct ExampleSentenceRankInputs: Hashable, Sendable {
  let lexicalRelation: ExampleSentenceLexicalRelation
  let matchPosition: Int
  let englishTermCount: Int
  let japaneseGraphemeCount: Int
  let pairID: ExampleSentenceID
}

struct ExampleSentenceMatch: Hashable, Identifiable, Sendable {
  var id: ExampleSentenceID { sentence.id }
  let sentence: ExampleSentence
  let route: ExampleSentenceRetrievalRoute
  let lexicalRelation: ExampleSentenceLexicalRelation
  let matchedRange: ExampleSentenceMatchedRange
  let exactSurface: Bool
  let rankInputs: ExampleSentenceRankInputs
}

enum ExampleSentenceResultCount: Hashable, Sendable {
  case exact(Int)
  case moreThan50

  var compatibilityValue: Int {
    switch self {
    case .exact(let count): count
    case .moreThan50: 51
    }
  }
}

struct ExampleSentenceRetrievalResult: Hashable, Sendable {
  let matches: [ExampleSentenceMatch]
  let count: ExampleSentenceResultCount
  let isTruncated: Bool
  let policyVersion: String

  var sentences: [ExampleSentence] { matches.map(\.sentence) }
}

enum ExampleSentenceInvalidQueryReason: Hashable, Sendable {
  case empty
  case wrongLanguage
  case embeddedQuote
  case noPorterTerms
  case missingEntryEvidence
}

enum ExampleSentenceRetrievalUnavailableReason: Hashable, Sendable {
  case missingBundledData
  case invalidBaseCorpus
  case invalidIndexMetadata
  case unavailableFTS4Porter
  case queryFailed
}

enum ExampleSentenceRetrievalError: Error, Hashable, Sendable {
  case invalidQuery(ExampleSentenceInvalidQueryReason)
  case retrievalUnavailable(ExampleSentenceRetrievalUnavailableReason)
}

struct ExampleSentenceClient: Sendable {
  var retrieve: @Sendable (ExampleSentenceRetrievalRequest) async throws
    -> ExampleSentenceRetrievalResult

  static let live = ExampleSentenceClient(
    retrieve: { request in try await ExampleSentenceData.shared.retrieve(request) }
  )

  static func testing(databaseURL: URL) -> ExampleSentenceClient {
    let data = ExampleSentenceData(databaseURL: databaseURL)
    return ExampleSentenceClient(retrieve: { request in try await data.retrieve(request) })
  }

  func examples(_ entry: DictionaryEntry) async throws -> [ExampleSentence] {
    try await retrieve(.dictionaryEntry(entry)).sentences
  }

  func count(_ query: SearchQuery) async throws -> Int {
    try await retrieve(query.isASCII ? .directEnglish(query) : .directJapanese(query))
      .count.compatibilityValue
  }

  func search(_ query: SearchQuery) async throws -> [ExampleSentence] {
    try await retrieve(query.isASCII ? .directEnglish(query) : .directJapanese(query)).sentences
  }
}

private actor ExampleSentenceData {
  static let policyVersion = "ExampleSentenceRetrievalPolicy/v1"
  static let indexSchemaVersion = "zenbu.example-sentence-retrieval-index.v2"
  static let pairIDScheme = "esp1-sha256-128-nfc-length-prefixed"
  static let porterTable = "example_sentence_english_porter_fts"
  static let exactTable = "example_sentence_english_exact_fts"
  static let mapTable = "example_sentence_fts_map"
  static let shared = ExampleSentenceData(databaseURL: nil)

  private let databaseURL: URL?
  private var connection: ExampleSentenceSQLiteConnection?
  private var baseIsValidated = false
  private var englishIndexIsValidated = false
  private var porterProbeIsCreated = false

  init(databaseURL: URL?) {
    self.databaseURL = databaseURL
  }

  func retrieve(_ request: ExampleSentenceRetrievalRequest) throws -> ExampleSentenceRetrievalResult {
    do {
      switch request {
      case .directEnglish(let query):
        return try retrieveEnglish(query)
      case .directJapanese(let query):
        return try retrieveJapanese(query)
      case .dictionaryEntry(let id, let selectedForm, let writtenForms, let reading):
        return try retrieveEntry(
          id: id,
          selectedForm: selectedForm,
          writtenForms: writtenForms,
          reading: reading
        )
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as ExampleSentenceRetrievalError {
      throw error
    } catch {
      throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
    }
  }

  private func retrieveEnglish(_ query: SearchQuery) throws -> ExampleSentenceRetrievalResult {
    guard !query.isEmpty else { throw invalid(.empty) }
    guard query.isASCII else { throw invalid(.wrongLanguage) }
    guard !query.value.contains("\"") else { throw invalid(.embeddedQuote) }
    try validateEnglishIndex()

    let matchExpression = "\"\(query.value)\""
    guard try porterEmitsTerms(query.value, matchExpression: matchExpression) else {
      throw invalid(.noPorterTerms)
    }

    let exactRanges = try exactEnglishRanges(matchExpression: matchExpression)
    let statement = try prepare(
      """
      SELECT e.id, e.japanese, e.english,
             offsets(\(Self.porterTable)), matchinfo(\(Self.porterTable), 'l')
      FROM \(Self.porterTable) p
      JOIN \(Self.mapTable) m ON m.fts_rowid = p.docid
      JOIN example_sentences e ON e.id = m.pair_id
      WHERE \(Self.porterTable) MATCH ?
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(matchExpression, at: 1, to: statement)

    var candidatesByID: [ExampleSentenceID: ExampleSentenceMatch] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let sentence = try example(from: statement)
      guard candidatesByID[sentence.id] == nil else {
        throw unavailable(.invalidIndexMetadata)
      }
      let porterOffsets = try offsets(column: 3, statement: statement)
      guard let porterRange = phraseRange(in: sentence.english, offsets: porterOffsets) else {
        continue
      }
      let exactRange = exactRanges[sentence.id]
      let relation: ExampleSentenceLexicalRelation = exactRange == nil
        ? .porterEquivalentPhrase : .exactSurfacePhrase
      let range = exactRange ?? porterRange
      candidatesByID[sentence.id] = ExampleSentenceMatch(
        sentence: sentence,
        route: .directEnglish,
        lexicalRelation: relation,
        matchedRange: range,
        exactSurface: exactRange != nil,
        rankInputs: ExampleSentenceRankInputs(
          lexicalRelation: relation,
          matchPosition: range.location,
          englishTermCount: try documentTermCount(column: 4, statement: statement),
          japaneseGraphemeCount: sentence.japanese.count,
          pairID: sentence.id
        )
      )
    }

    let candidates = Array(candidatesByID.values)
    guard candidates.contains(where: \.exactSurface) else { return result(matches: []) }
    return result(matches: candidates.sorted(by: ranksBefore))
  }

  private func retrieveJapanese(_ query: SearchQuery) throws -> ExampleSentenceRetrievalResult {
    guard !query.isEmpty else { throw invalid(.empty) }
    guard !query.isASCII else { throw invalid(.wrongLanguage) }
    try validateBaseCorpus()

    let statement = try prepare(
      """
      SELECT id, japanese, english
      FROM example_sentences
      WHERE instr(japanese, ?) > 0
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(query.value, at: 1, to: statement)

    var matchesByID: [ExampleSentenceID: ExampleSentenceMatch] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let sentence = try example(from: statement)
      guard let range = graphemeRange(of: query.value, in: sentence.japanese) else { continue }
      let relation: ExampleSentenceLexicalRelation = sentence.japanese == query.value
        ? .entireJapaneseSentence : .containedJapaneseSurface
      let match = ExampleSentenceMatch(
        sentence: sentence,
        route: .directJapanese,
        lexicalRelation: relation,
        matchedRange: range,
        exactSurface: true,
        rankInputs: ExampleSentenceRankInputs(
          lexicalRelation: relation,
          matchPosition: range.location,
          englishTermCount: 0,
          japaneseGraphemeCount: sentence.japanese.count,
          pairID: sentence.id
        )
      )
      if matchesByID.updateValue(match, forKey: sentence.id) != nil {
        throw unavailable(.invalidBaseCorpus)
      }
    }
    return result(matches: matchesByID.values.sorted(by: ranksBefore))
  }

  private func retrieveEntry(
    id: LanguageReferenceID,
    selectedForm: String,
    writtenForms: [String],
    reading: String
  ) throws -> ExampleSentenceRetrievalResult {
    let selectedForm = normalizedEntryEvidence(selectedForm)
    let reading = normalizedEntryEvidence(reading)
    guard !id.rawValue.isEmpty, !selectedForm.isEmpty, !reading.isEmpty else {
      throw invalid(.missingEntryEvidence)
    }
    try validateBaseCorpus()
    let evidence = try entryEvidence(id: id)
    guard evidence.reading == reading, evidence.writtenForms.contains(selectedForm) else {
      throw invalid(.missingEntryEvidence)
    }
    guard try unambiguousEntryCount(selectedForm: selectedForm, reading: reading) == 1 else {
      return result(matches: [])
    }

    let alternateForms = writtenForms
      .map(normalizedEntryEvidence)
      .filter { $0 != selectedForm && evidence.writtenForms.contains($0) }
    let terms = [selectedForm] + Array(Set(alternateForms)).sorted() + [reading]
    let predicates = Array(repeating: "instr(japanese, ?) > 0", count: terms.count)
      .joined(separator: " OR ")
    let statement = try prepare(
      """
      SELECT id, japanese, english
      FROM example_sentences
      WHERE \(predicates)
      """
    )
    defer { sqlite3_finalize(statement) }
    for (index, term) in terms.enumerated() {
      bind(term, at: Int32(index + 1), to: statement)
    }

    var matchesByID: [ExampleSentenceID: ExampleSentenceMatch] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let sentence = try example(from: statement)
      let evidenceMatches: [(ExampleSentenceLexicalRelation, ExampleSentenceMatchedRange)] =
        [(selectedForm, ExampleSentenceLexicalRelation.selectedWrittenForm)]
          .compactMap { term, relation in
            graphemeRange(of: term, in: sentence.japanese).map { (relation, $0) }
          }
          + alternateForms.compactMap { term in
            graphemeRange(of: term, in: sentence.japanese).map {
              (ExampleSentenceLexicalRelation.alternateWrittenForm, $0)
            }
          }
          + [(reading, ExampleSentenceLexicalRelation.reading)].compactMap { term, relation in
            graphemeRange(of: term, in: sentence.japanese).map { (relation, $0) }
          }
      guard let best = evidenceMatches.min(by: entryEvidenceRanksBefore) else { continue }
      let match = ExampleSentenceMatch(
        sentence: sentence,
        route: .dictionaryEntry,
        lexicalRelation: best.0,
        matchedRange: best.1,
        exactSurface: true,
        rankInputs: ExampleSentenceRankInputs(
          lexicalRelation: best.0,
          matchPosition: best.1.location,
          englishTermCount: 0,
          japaneseGraphemeCount: sentence.japanese.count,
          pairID: sentence.id
        )
      )
      if let existing = matchesByID[sentence.id] {
        matchesByID[sentence.id] = ranksBefore(match, existing) ? match : existing
      } else {
        matchesByID[sentence.id] = match
      }
    }
    return result(matches: matchesByID.values.sorted(by: ranksBefore))
  }

  private func result(matches: [ExampleSentenceMatch]) -> ExampleSentenceRetrievalResult {
    ExampleSentenceRetrievalResult(
      matches: Array(matches.prefix(100)),
      count: matches.count > 50 ? .moreThan50 : .exact(matches.count),
      isTruncated: matches.count > 100,
      policyVersion: Self.policyVersion
    )
  }

  private func exactEnglishRanges(
    matchExpression: String
  ) throws -> [ExampleSentenceID: ExampleSentenceMatchedRange] {
    let statement = try prepare(
      """
      SELECT m.pair_id, e.english, offsets(\(Self.exactTable))
      FROM \(Self.exactTable) x
      JOIN \(Self.mapTable) m ON m.fts_rowid = x.docid
      JOIN example_sentences e ON e.id = m.pair_id
      WHERE \(Self.exactTable) MATCH ?
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(matchExpression, at: 1, to: statement)
    var ranges: [ExampleSentenceID: ExampleSentenceMatchedRange] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let id = try exampleSentenceID(column: 0, statement: statement)
      let english = Self.string(column: 1, statement: statement)
      if let range = phraseRange(in: english, offsets: try offsets(column: 2, statement: statement)) {
        ranges[id] = range
      }
    }
    return ranges
  }

  private func porterEmitsTerms(_ query: String, matchExpression: String) throws -> Bool {
    if !porterProbeIsCreated {
      try execute(
        "CREATE VIRTUAL TABLE temp.example_sentence_porter_query_probe "
          + "USING fts4(value, tokenize=porter)"
      )
      porterProbeIsCreated = true
    }
    try execute("DELETE FROM temp.example_sentence_porter_query_probe")
    let insertion = try prepare("INSERT INTO temp.example_sentence_porter_query_probe(value) VALUES (?)")
    defer { sqlite3_finalize(insertion) }
    bind(query, at: 1, to: insertion)
    guard try checkedSQLiteStep(insertion) == .done else { return false }

    let probe = try prepare(
      "SELECT count(*) FROM temp.example_sentence_porter_query_probe "
        + "WHERE example_sentence_porter_query_probe MATCH ?"
    )
    defer { sqlite3_finalize(probe) }
    bind(matchExpression, at: 1, to: probe)
    guard try checkedSQLiteStep(probe) == .row else { return false }
    return sqlite3_column_int(probe, 0) == 1
  }

  private func validateBaseCorpus() throws {
    guard !baseIsValidated else { return }
    let database = try openDatabase()
    guard sqlite3_db_readonly(database, "main") == 1 else {
      throw unavailable(.invalidBaseCorpus)
    }
    if databaseURL == nil {
      guard Int(try metadataValue("example_sentences")) ?? 0 > 0 else {
        throw unavailable(.invalidBaseCorpus)
      }
      let identityProbe = try prepare(
        "SELECT typeof(id), length(id) FROM example_sentences LIMIT 1"
      )
      defer { sqlite3_finalize(identityProbe) }
      guard try checkedSQLiteStep(identityProbe) == .row,
        Self.string(column: 0, statement: identityProbe) == "blob",
        sqlite3_column_int(identityProbe, 1) == ExampleSentenceID.encodedByteCount
      else { throw unavailable(.invalidBaseCorpus) }
    } else {
      let integrity = try scalarString("PRAGMA integrity_check(example_sentences)")
      guard integrity == "ok" else { throw unavailable(.invalidBaseCorpus) }
      let corpusCount = try scalarInt("SELECT count(*) FROM example_sentences")
      let recordedCount = try scalarInt(
        "SELECT CAST(value AS INTEGER) FROM metadata WHERE key = 'example_sentences'"
      )
      guard corpusCount == recordedCount else { throw unavailable(.invalidBaseCorpus) }
      let invalidPairIDs = try scalarInt(
        """
        SELECT count(*) FROM example_sentences
        WHERE typeof(id) != 'blob' OR length(id) != 16
        """
      )
      guard invalidPairIDs == 0 else { throw unavailable(.invalidBaseCorpus) }
      let missingProvenance = try scalarInt(
        """
        SELECT count(*) FROM (
          SELECT e.id FROM example_sentences e
          LEFT JOIN example_sentence_provenance p ON p.pair_id = e.id
          WHERE p.pair_id IS NULL LIMIT 1
        )
        """
      )
      guard missingProvenance == 0 else { throw unavailable(.invalidBaseCorpus) }
    }
    baseIsValidated = true
  }

  private func validateEnglishIndex() throws {
    try validateBaseCorpus()
    guard !englishIndexIsValidated else { return }
    let expectedMetadata = [
      "retrieval_index_schema_version": Self.indexSchemaVersion,
      "retrieval_policy_version": Self.policyVersion,
      "retrieval_porter_tokenizer": "fts4/porter",
      "retrieval_exact_tokenizer": "fts4/simple",
      "retrieval_pair_id_scheme": Self.pairIDScheme,
    ]
    for (key, expected) in expectedMetadata {
      guard try metadataValue(key) == expected else {
        throw unavailable(.invalidIndexMetadata)
      }
    }
    for key in [
      "retrieval_corpus_sha256", "retrieval_index_mapping_sha256",
      "retrieval_importer_sha256", "retrieval_provenance_sha256",
    ] {
      let value = try metadataValue(key)
      guard value.count == 64, value.allSatisfy({ $0.isHexDigit && !$0.isUppercase }) else {
        throw unavailable(.invalidIndexMetadata)
      }
    }
    let recordedCorpusCount = Int(try metadataValue("example_sentences")) ?? 0
    let recordedProvenanceCount = try scalarInt(
      "SELECT CAST(value AS INTEGER) FROM metadata "
        + "WHERE key = 'retrieval_provenance_row_count'"
    )
    guard recordedCorpusCount > 0, recordedProvenanceCount >= recordedCorpusCount else {
      throw unavailable(.invalidIndexMetadata)
    }
    let recordedIndexCounts = [
      Int(try metadataValue("retrieval_index_row_count")) ?? 0,
      Int(try metadataValue("retrieval_exact_index_row_count")) ?? 0,
    ]
    guard recordedIndexCounts.allSatisfy({ $0 == recordedCorpusCount }) else {
      throw unavailable(.invalidIndexMetadata)
    }
    if databaseURL != nil {
      let corpusCount = try scalarInt("SELECT count(*) FROM example_sentences")
      let provenanceCount = try scalarInt("SELECT count(*) FROM example_sentence_provenance")
      let counts = try [
        scalarInt("SELECT count(*) FROM \(Self.mapTable)"),
        scalarInt("SELECT count(*) FROM \(Self.porterTable)"),
        scalarInt("SELECT count(*) FROM \(Self.exactTable)"),
      ]
      guard corpusCount == recordedCorpusCount,
        provenanceCount == recordedProvenanceCount,
        counts.allSatisfy({ $0 == corpusCount })
      else { throw unavailable(.invalidIndexMetadata) }
      let missing = try scalarInt(
        """
        SELECT count(*) FROM (
          SELECT e.id FROM example_sentences e
          LEFT JOIN \(Self.mapTable) m ON m.pair_id = e.id
          LEFT JOIN \(Self.porterTable) p ON p.docid = m.fts_rowid
          LEFT JOIN \(Self.exactTable) x ON x.docid = m.fts_rowid
          WHERE m.pair_id IS NULL OR p.docid IS NULL OR x.docid IS NULL
          LIMIT 1
        )
        """
      )
      guard missing == 0 else { throw unavailable(.invalidIndexMetadata) }
    }
    englishIndexIsValidated = true
  }

  private func entryEvidence(id: LanguageReferenceID) throws -> EntryEvidence {
    let statement = try prepare(
      """
      SELECT e.reading, f.form, f.kind
      FROM entries e
      JOIN forms f ON f.entry_id = e.id
      WHERE lower(hex(e.id)) = ? AND f.kind IN (0, 1)
      ORDER BY f.kind, f.form
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(id.rawValue.lowercased(), at: 1, to: statement)
    var storedReading: String?
    var writtenForms = Set<String>()
    var readingForms = Set<String>()
    while try checkedSQLiteStep(statement) == .row {
      storedReading = Self.string(column: 0, statement: statement)
      let form = Self.string(column: 1, statement: statement)
      if sqlite3_column_int(statement, 2) == 0 {
        writtenForms.insert(form)
      } else {
        readingForms.insert(form)
      }
    }
    guard let storedReading, readingForms.contains(storedReading) else {
      throw invalid(.missingEntryEvidence)
    }
    return EntryEvidence(reading: storedReading, writtenForms: writtenForms)
  }

  private func unambiguousEntryCount(selectedForm: String, reading: String) throws -> Int {
    let statement = try prepare(
      """
      SELECT count(DISTINCT lower(hex(e.id)))
      FROM entries e
      JOIN forms written ON written.entry_id = e.id AND written.kind = 0 AND written.form = ?
      JOIN forms spoken ON spoken.entry_id = e.id AND spoken.kind = 1 AND spoken.form = ?
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(selectedForm, at: 1, to: statement)
    bind(reading, at: 2, to: statement)
    guard try checkedSQLiteStep(statement) == .row else { return 0 }
    return Int(sqlite3_column_int64(statement, 0))
  }

  private func normalizedEntryEvidence(_ value: String) -> String {
    value.precomposedStringWithCompatibilityMapping
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
  }

  private func phraseRange(
    in text: String,
    offsets: [FTSOffset]
  ) -> ExampleSentenceMatchedRange? {
    guard let maximumTerm = offsets.map(\.term).max() else { return nil }
    let termCount = maximumTerm + 1
    let ordered = offsets.sorted { left, right in
      left.byteOffset == right.byteOffset ? left.term < right.term : left.byteOffset < right.byteOffset
    }
    for startIndex in ordered.indices where ordered[startIndex].term == 0 {
      let endIndex = startIndex + termCount
      guard endIndex <= ordered.endIndex else { continue }
      let phrase = Array(ordered[startIndex..<endIndex])
      guard phrase.map(\.term) == Array(0..<termCount) else { continue }
      var crossesTerminalPunctuation = false
      for pair in zip(phrase, phrase.dropFirst()) {
        guard let gap = utf8Substring(
          text,
          from: pair.0.byteOffset + pair.0.byteLength,
          to: pair.1.byteOffset
        ) else {
          crossesTerminalPunctuation = true
          break
        }
        if gap.range(of: #"[.?!]\s"#, options: .regularExpression) != nil {
          crossesTerminalPunctuation = true
          break
        }
      }
      guard !crossesTerminalPunctuation,
        let range = graphemeRange(
          in: text,
          utf8Start: phrase[0].byteOffset,
          utf8End: phrase[phrase.count - 1].byteOffset + phrase[phrase.count - 1].byteLength
        )
      else { continue }
      return range
    }
    return nil
  }

  private func offsets(column: Int32, statement: OpaquePointer) throws -> [FTSOffset] {
    let raw = Self.string(column: column, statement: statement)
    let values = raw.split(separator: " ").compactMap { Int($0) }
    guard values.count.isMultiple(of: 4) else { throw unavailable(.queryFailed) }
    return stride(from: 0, to: values.count, by: 4).map { index in
      FTSOffset(
        term: values[index + 1],
        byteOffset: values[index + 2],
        byteLength: values[index + 3]
      )
    }
  }

  private func documentTermCount(column: Int32, statement: OpaquePointer) throws -> Int {
    guard let bytes = sqlite3_column_blob(statement, column),
      sqlite3_column_bytes(statement, column) >= MemoryLayout<UInt32>.size
    else { throw unavailable(.queryFailed) }
    return Int(bytes.loadUnaligned(as: UInt32.self))
  }

  private func graphemeRange(of needle: String, in text: String) -> ExampleSentenceMatchedRange? {
    guard let range = text.range(of: needle) else { return nil }
    return ExampleSentenceMatchedRange(
      location: text[..<range.lowerBound].count,
      length: text[range].count
    )
  }

  private func graphemeRange(
    in text: String,
    utf8Start: Int,
    utf8End: Int
  ) -> ExampleSentenceMatchedRange? {
    guard utf8Start >= 0, utf8End >= utf8Start, utf8End <= text.utf8.count else { return nil }
    let startUTF8 = text.utf8.index(text.utf8.startIndex, offsetBy: utf8Start)
    let endUTF8 = text.utf8.index(text.utf8.startIndex, offsetBy: utf8End)
    guard let start = String.Index(startUTF8, within: text),
      let end = String.Index(endUTF8, within: text)
    else { return nil }
    return ExampleSentenceMatchedRange(
      location: text[..<start].count,
      length: text[start..<end].count
    )
  }

  private func utf8Substring(_ text: String, from start: Int, to end: Int) -> String? {
    guard start >= 0, end >= start, end <= text.utf8.count else { return nil }
    let lower = text.utf8.index(text.utf8.startIndex, offsetBy: start)
    let upper = text.utf8.index(text.utf8.startIndex, offsetBy: end)
    guard let lowerIndex = String.Index(lower, within: text),
      let upperIndex = String.Index(upper, within: text)
    else { return nil }
    return String(text[lowerIndex..<upperIndex])
  }

  private func ranksBefore(
    _ left: ExampleSentenceMatch,
    _ right: ExampleSentenceMatch
  ) -> Bool {
    rankTuple(left) < rankTuple(right)
  }

  private func entryEvidenceRanksBefore(
    _ left: (ExampleSentenceLexicalRelation, ExampleSentenceMatchedRange),
    _ right: (ExampleSentenceLexicalRelation, ExampleSentenceMatchedRange)
  ) -> Bool {
    (left.0.rawValue, left.1.location) < (right.0.rawValue, right.1.location)
  }

  private func rankTuple(_ match: ExampleSentenceMatch) -> RankTuple {
    RankTuple(
      lexicalRelation: match.rankInputs.lexicalRelation.rawValue,
      matchPosition: match.rankInputs.matchPosition,
      englishTermCount: match.rankInputs.englishTermCount,
      japaneseGraphemeCount: match.rankInputs.japaneseGraphemeCount,
      pairID: match.rankInputs.pairID
    )
  }

  private func example(from statement: OpaquePointer) throws -> ExampleSentence {
    ExampleSentence(
      id: try exampleSentenceID(column: 0, statement: statement),
      japanese: Self.string(column: 1, statement: statement),
      english: Self.string(column: 2, statement: statement)
    )
  }

  private func exampleSentenceID(
    column: Int32,
    statement: OpaquePointer
  ) throws -> ExampleSentenceID {
    guard sqlite3_column_type(statement, column) == SQLITE_BLOB,
      sqlite3_column_bytes(statement, column) == ExampleSentenceID.encodedByteCount,
      let bytes = sqlite3_column_blob(statement, column),
      let id = ExampleSentenceID(
        bytes: UnsafeRawBufferPointer(
          start: bytes,
          count: ExampleSentenceID.encodedByteCount
        )
      )
    else { throw unavailable(.invalidBaseCorpus) }
    return id
  }

  private func metadataValue(_ key: String) throws -> String {
    let statement = try prepare("SELECT value FROM metadata WHERE key = ?")
    defer { sqlite3_finalize(statement) }
    bind(key, at: 1, to: statement)
    guard try checkedSQLiteStep(statement) == .row else {
      throw unavailable(.invalidIndexMetadata)
    }
    return Self.string(column: 0, statement: statement)
  }

  private func scalarInt(_ sql: String) throws -> Int {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .row else { throw unavailable(.queryFailed) }
    return Int(sqlite3_column_int64(statement, 0))
  }

  private func scalarString(_ sql: String) throws -> String {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .row else { throw unavailable(.queryFailed) }
    return Self.string(column: 0, statement: statement)
  }

  private func execute(_ sql: String) throws {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .done else { throw unavailable(.queryFailed) }
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    let database = try openDatabase()
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw unavailable(.queryFailed)
    }
    return statement
  }

  private func openDatabase() throws -> OpaquePointer {
    if let connection { return connection.pointer }
    let url: URL
    if let databaseURL {
      url = databaseURL
    } else if let bundled = Bundle.module.url(
      forResource: "LanguageReferenceData",
      withExtension: "sqlite3"
    ) {
      url = bundled
    } else {
      throw unavailable(.missingBundledData)
    }
    var opened: OpaquePointer?
    guard sqlite3_open_v2(
      url.path,
      &opened,
      SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX,
      nil
    ) == SQLITE_OK, let opened else {
      defer { sqlite3_close(opened) }
      throw unavailable(.missingBundledData)
    }
    let connection = ExampleSentenceSQLiteConnection(pointer: opened)
    self.connection = connection
    return opened
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, Self.transientDestructor)
  }

  private func invalid(_ reason: ExampleSentenceInvalidQueryReason) -> ExampleSentenceRetrievalError {
    .invalidQuery(reason)
  }

  private func unavailable(
    _ reason: ExampleSentenceRetrievalUnavailableReason
  ) -> ExampleSentenceRetrievalError {
    .retrievalUnavailable(reason)
  }

  private static func string(column: Int32, statement: OpaquePointer) -> String {
    guard let text = sqlite3_column_text(statement, column) else { return "" }
    return String(cString: text)
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private struct EntryEvidence {
  let reading: String
  let writtenForms: Set<String>
}

private struct FTSOffset {
  let term: Int
  let byteOffset: Int
  let byteLength: Int
}

private struct RankTuple: Comparable {
  let lexicalRelation: Int
  let matchPosition: Int
  let englishTermCount: Int
  let japaneseGraphemeCount: Int
  let pairID: ExampleSentenceID

  static func < (left: RankTuple, right: RankTuple) -> Bool {
    if left.lexicalRelation != right.lexicalRelation {
      return left.lexicalRelation < right.lexicalRelation
    }
    if left.matchPosition != right.matchPosition {
      return left.matchPosition < right.matchPosition
    }
    if left.englishTermCount != right.englishTermCount {
      return left.englishTermCount < right.englishTermCount
    }
    if left.japaneseGraphemeCount != right.japaneseGraphemeCount {
      return left.japaneseGraphemeCount < right.japaneseGraphemeCount
    }
    return left.pairID < right.pairID
  }
}

private final class ExampleSentenceSQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer
  init(pointer: OpaquePointer) { self.pointer = pointer }
  deinit { sqlite3_close(pointer) }
}
