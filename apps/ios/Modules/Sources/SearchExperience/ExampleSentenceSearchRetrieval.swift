import Foundation
import SQLite3

extension ExampleSentenceData {
  func retrieveEnglish(_ query: SearchQuery) throws -> ExampleSentenceRetrievalResult {
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
    sqliteBind(matchExpression, at: 1, to: statement)

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

  func retrieveJapanese(_ query: SearchQuery) throws -> ExampleSentenceRetrievalResult {
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
    sqliteBind(query.value, at: 1, to: statement)

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
    sqliteBind(matchExpression, at: 1, to: statement)
    var ranges: [ExampleSentenceID: ExampleSentenceMatchedRange] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let id = try exampleSentenceID(column: 0, statement: statement)
      let english = sqliteText(statement, 1)
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
    sqliteBind(query, at: 1, to: insertion)
    guard try checkedSQLiteStep(insertion) == .done else { return false }

    let probe = try prepare(
      "SELECT count(*) FROM temp.example_sentence_porter_query_probe "
        + "WHERE example_sentence_porter_query_probe MATCH ?"
    )
    defer { sqlite3_finalize(probe) }
    sqliteBind(matchExpression, at: 1, to: probe)
    guard try checkedSQLiteStep(probe) == .row else { return false }
    return sqlite3_column_int(probe, 0) == 1
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
    let raw = sqliteText(statement, column)
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
}

struct FTSOffset {
  let term: Int
  let byteOffset: Int
  let byteLength: Int
}
