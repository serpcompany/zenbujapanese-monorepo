import Foundation
import SQLite3

extension ExampleSentenceData {
  func retrieveEntry(
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
    guard evidence.reading == reading else { throw invalid(.missingEntryEvidence) }
    if selectedForm == reading {
      return try retrieveIndexedEntry(id: id, selectedForm: selectedForm)
    }
    guard evidence.writtenForms.contains(selectedForm) else {
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
      sqliteBind(term, at: Int32(index + 1), to: statement)
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

  private func retrieveIndexedEntry(
    id: LanguageReferenceID,
    selectedForm: String
  ) throws -> ExampleSentenceRetrievalResult {
    guard let key = id.bytes, try attachWordIndex() else { return result(matches: []) }
    let statement = try prepare(
      """
      SELECT e.id, e.japanese, e.english, w.surface
      FROM word_index.entry_sentences w
      JOIN example_sentences e ON e.id = w.pair_id
      WHERE w.entry_id = ?
      """
    )
    defer { sqlite3_finalize(statement) }
    sqliteBind(key, at: 1, to: statement)
    var matches: [ExampleSentenceMatch] = []
    while try checkedSQLiteStep(statement) == .row {
      let sentence = try example(from: statement)
      let surface = normalizedEntryEvidence(sqliteText(statement, 3))
      guard let range = graphemeRange(of: surface, in: sentence.japanese) else { continue }
      let relation: ExampleSentenceLexicalRelation =
        surface == selectedForm ? .selectedWrittenForm : .reading
      matches.append(
        ExampleSentenceMatch(
          sentence: sentence,
          route: .dictionaryEntry,
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
      )
    }
    return result(matches: matches.sorted(by: ranksBefore))
  }

  private func attachWordIndex() throws -> Bool {
    if wordIndexIsAttached { return true }
    guard let wordIndexURL else { return false }
    let attach = try prepare("ATTACH DATABASE ? AS word_index")
    defer { sqlite3_finalize(attach) }
    sqliteBind(wordIndexURL.path, at: 1, to: attach)
    guard try checkedSQLiteStep(attach) == .done,
      try scalarString(
        "SELECT value FROM word_index.metadata WHERE key = 'artifact_schema'"
      ) == Self.wordIndexSchema
    else { throw unavailable(.invalidIndexMetadata) }
    wordIndexIsAttached = true
    return true
  }

  private func entryEvidence(id: LanguageReferenceID) throws -> EntryEvidence {
    guard let key = id.bytes else { throw invalid(.missingEntryEvidence) }
    let statement = try prepare(
      """
      SELECT e.reading, f.form, f.kind
      FROM entries e
      JOIN forms f ON f.entry_id = e.id
      WHERE e.id = ? AND f.kind IN (0, 1)
      ORDER BY f.kind, f.form
      """
    )
    defer { sqlite3_finalize(statement) }
    sqliteBind(key, at: 1, to: statement)
    var storedReading: String?
    var writtenForms = Set<String>()
    var readingForms = Set<String>()
    while try checkedSQLiteStep(statement) == .row {
      storedReading = sqliteText(statement, 0)
      let form = sqliteText(statement, 1)
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
    sqliteBind(selectedForm, at: 1, to: statement)
    sqliteBind(reading, at: 2, to: statement)
    guard try checkedSQLiteStep(statement) == .row else { return 0 }
    return Int(sqlite3_column_int64(statement, 0))
  }

  private func normalizedEntryEvidence(_ value: String) -> String {
    value.precomposedStringWithCompatibilityMapping
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
  }

  private func entryEvidenceRanksBefore(
    _ left: (ExampleSentenceLexicalRelation, ExampleSentenceMatchedRange),
    _ right: (ExampleSentenceLexicalRelation, ExampleSentenceMatchedRange)
  ) -> Bool {
    (left.0.rawValue, left.1.location) < (right.0.rawValue, right.1.location)
  }
}

struct EntryEvidence {
  let reading: String
  let writtenForms: Set<String>
}
