import Foundation
import SQLite3

extension LanguageReferenceData {
  func rankedJapanese(
    _ query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [RankedDictionaryEntry] {
    let statement = try prepare(
      exactFormOnly ? Self.exactJapaneseCandidateSQL : Self.japaneseCandidateSQL
    )
    defer { sqlite3_finalize(statement) }
    sqliteBind(query.value, at: 1, to: statement)
    var entries: [LanguageReferenceID: DictionaryEntry] = [:]
    var fingerprints: [LanguageReferenceID: String] = [:]
    var senseCounts: [LanguageReferenceID: Int] = [:]
    var evidence: [LanguageReferenceID: Set<DictionaryMatch.FormEvidence>] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let form = sqliteText(statement, 18)
      guard let kind = SearchFormKind(rawValue: Int(sqlite3_column_int(statement, 19))) else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
      let exact = form == query.value
      let prefix = form.hasPrefix(query.value)
      let relation = DictionaryMatch.FormRelation(
        rawValue: (kind == .written ? 0 : 1) + (exact ? 0 : prefix ? 2 : 4)
      )!
      let profile = Self.priorityProfile(from: statement, startingAt: 21)
      entries[entry.id] = entry
      fingerprints[entry.id] = sqliteText(statement, 17)
      senseCounts[entry.id] = Int(sqlite3_column_int(statement, 20))
      evidence[entry.id, default: []].insert(
        DictionaryMatch.FormEvidence(
          relation: relation, normalizedForm: form, priorityProfile: profile)
      )
    }
    let ranked = entries.compactMap {
      id, entry -> (RankedDictionaryEntry, JapaneseDictionaryRank)? in
      guard let selected = evidence[id]?.min(by: Self.formEvidencePrecedes),
        let fingerprint = fingerprints[id]
      else { return nil }
      let breadth = senseCounts[id] ?? 0
      let rank = JapaneseDictionaryRank(
        relation: selected.relation,
        priorityProfile: selected.priorityProfile,
        senseBreadthRank: -breadth,
        headwordLength: entry.headword.count,
        semanticFingerprint: fingerprint
      )
      return (
        RankedDictionaryEntry(
          entry: entry,
          presentationRank: rank.presentationRank,
          legacyPresentationRank: .japanese(rank),
          hasExactOrPrefixMatch: selected.relation.rawValue < 4,
          semanticFingerprint: fingerprint,
          matchedSummary: nil
        ),
        rank
      )
    }.sorted { $0.1 < $1.1 }
    return Self.deduplicated(ranked.map(\.0))
  }

  static func ftsPhrase(_ value: String) -> String {
    "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
  }

  static func ftsPrefix(_ value: String) -> String {
    guard value.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) }) else {
      return ftsPhrase(value)
    }
    return value + "*"
  }

  private static func formEvidencePrecedes(
    _ lhs: DictionaryMatch.FormEvidence,
    _ rhs: DictionaryMatch.FormEvidence
  ) -> Bool {
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    if lhs.priorityProfile < rhs.priorityProfile { return true }
    if rhs.priorityProfile < lhs.priorityProfile { return false }
    return lhs.normalizedForm < rhs.normalizedForm
  }

  private static let japaneseCandidateSQL = candidateSQL(where: "instr(f.form, ?) > 0")

  private static let exactJapaneseCandidateSQL = candidateSQL(where: "f.form = ?")

  private static func candidateSQL(where formCondition: String) -> String {
    """
    SELECT \(selectedColumns), f.form, f.kind,
      (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id),
      p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
    WHERE f.kind IN (\(SearchFormKind.written.rawValue), \(SearchFormKind.reading.rawValue))
      AND \(formCondition)
      AND (
        f.kind != \(SearchFormKind.reading.rawValue)
        OR NOT EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
        )
        OR EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
            AND r.written_form = e.headword
        )
      )
    """
  }
}
