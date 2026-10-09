import Foundation
import SQLite3

extension LanguageReferenceData {
  func rankedEnglish(
    _ query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [RankedDictionaryEntry] {
    guard exactFormOnly || Self.hasSearchTerms(query.value) else { return [] }
    let glossMatches =
      exactFormOnly
      ? [:]
      : try glossEvidence(
        query: query,
        matchExpression: Self.ftsPhrase(query.value),
        restrictions: try senseRestrictions()
      )
    let romajiMatches = try romajiEvidence(query: query, exactFormOnly: exactFormOnly)
    let statement = try prepare(
      exactFormOnly ? Self.exactASCIICandidateSQL : Self.asciiCandidateSQL)
    defer { sqlite3_finalize(statement) }
    sqliteBind(exactFormOnly ? query.value : Self.ftsPhrase(query.value), at: 1, to: statement)
    if !exactFormOnly {
      sqliteBind(Self.ftsPrefix(query.value), at: 2, to: statement)
    }

    var ranked: [(RankedDictionaryEntry, EnglishDictionaryRank)] = []
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let fingerprint = sqliteText(statement, 17)
      let match = DictionaryMatch(
        glossEvidence: glossMatches[entry.id] ?? [],
        romajiEvidence: romajiMatches[entry.id] ?? [],
        formEvidence: [],
        displayedFormPriority: Self.priorityProfile(from: statement, startingAt: 18)
      )
      guard let selectedGloss = match.glossEvidence.min(by: Self.glossEvidencePrecedes),
        !match.romajiEvidence.isEmpty || !match.glossEvidence.isEmpty
      else {
        if let romaji = match.romajiEvidence.min() {
          let rank = EnglishDictionaryRank(
            lane: .romajiOnly,
            corroborationRank: 0,
            romajiSpecificityRank: romaji.rawValue,
            senseOrder: 0,
            priorityPresenceRank: match.displayedFormPriority.isMarked ? 0 : 1,
            priorityProfile: match.displayedFormPriority,
            glossOrder: 0,
            headwordLength: entry.headword.count,
            semanticFingerprint: fingerprint
          )
          ranked.append(
            (
              RankedDictionaryEntry(
                entry: entry,
                presentationRank: rank.presentationRank,
                legacyPresentationRank: .english(rank),
                hasExactOrPrefixMatch: romaji != .contains,
                semanticFingerprint: fingerprint,
                matchedSummary: nil
              ), rank
            ))
        }
        continue
      }
      let lane: DictionaryMatch.EvidenceLane =
        selectedGloss.relation == .glossToken
        ? .tokenGloss : .strongGloss
      let corroborated =
        lane == .strongGloss
        && match.romajiEvidence.contains(where: { $0 == .exact || $0 == .prefix })
      let rank = EnglishDictionaryRank(
        lane: lane,
        corroborationRank: corroborated ? 0 : 1,
        romajiSpecificityRank: 0,
        senseOrder: selectedGloss.senseOrder,
        priorityPresenceRank: match.displayedFormPriority.isMarked ? 0 : 1,
        priorityProfile: match.displayedFormPriority,
        glossOrder: selectedGloss.glossOrder,
        headwordLength: entry.headword.count,
        semanticFingerprint: fingerprint
      )
      ranked.append(
        (
          RankedDictionaryEntry(
            entry: entry,
            presentationRank: rank.presentationRank,
            legacyPresentationRank: .english(rank),
            hasExactOrPrefixMatch: lane == .strongGloss || corroborated,
            semanticFingerprint: fingerprint,
            matchedSummary: selectedGloss.meaning
          ), rank
        ))
    }
    return Self.deduplicated(ranked.sorted { $0.1 < $1.1 }.map(\.0))
  }

  private func glossEvidence(
    query: SearchQuery,
    matchExpression: String,
    restrictions: [SenseRestrictionKey: Set<String>]
  ) throws -> [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] {
    let glossStatement = try prepare(Self.glossEvidenceSQL)
    defer { sqlite3_finalize(glossStatement) }
    sqliteBind(matchExpression, at: 1, to: glossStatement)
    let glossToken = try Self.glossTokenPattern(query.value)
    var result: [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] = [:]
    while try checkedSQLiteStep(glossStatement) == .row {
      let entryID = LanguageReferenceID(rawValue: sqliteText(glossStatement, 0))
      let senseOrder = Int(sqlite3_column_int(glossStatement, 1))
      let written =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .written)
        ] ?? []
      let reading =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .reading)
        ] ?? []
      let displayedHeadword = SearchQuery(sqliteText(glossStatement, 5)).value
      let displayedReading = SearchQuery(sqliteText(glossStatement, 6)).value
      let meaning = sqliteText(glossStatement, 3)
      guard written.isEmpty || written.contains(displayedHeadword),
        reading.isEmpty || reading.contains(displayedReading),
        let relation = Self.glossRelation(query: query.value, gloss: meaning, token: glossToken)
      else { continue }
      let parts: [PartOfSpeech] = try Self.decode(column: 4, statement: glossStatement)
      result[entryID, default: []].append(
        DictionaryMatch.GlossEvidence(
          relation: relation,
          senseOrder: senseOrder,
          glossOrder: Int(sqlite3_column_int(glossStatement, 2)),
          meaning: meaning,
          partsOfSpeech: parts,
          restrictedWrittenForms: written.sorted(),
          restrictedReadingForms: reading.sorted()
        )
      )
    }
    return result
  }

  private func romajiEvidence(
    query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [LanguageReferenceID: [DictionaryMatch.RomajiRelation]] {
    let romajiStatement = try prepare(
      exactFormOnly ? Self.exactRomajiEvidenceSQL : Self.romajiEvidenceSQL
    )
    defer { sqlite3_finalize(romajiStatement) }
    sqliteBind(
      exactFormOnly ? query.value : Self.ftsPrefix(query.value),
      at: 1,
      to: romajiStatement
    )
    var result: [LanguageReferenceID: Set<DictionaryMatch.RomajiRelation>] = [:]
    while try checkedSQLiteStep(romajiStatement) == .row {
      let entryID = LanguageReferenceID(
        rawValue: sqliteText(romajiStatement, 0))
      let form = sqliteText(romajiStatement, 1)
      result[entryID, default: []].insert(
        form == query.value ? .exact : form.hasPrefix(query.value) ? .prefix : .contains
      )
    }
    return result.mapValues { $0.sorted() }
  }

  static func glossTokenPattern(_ query: String) throws -> NSRegularExpression {
    let escaped = NSRegularExpression.escapedPattern(for: query)
    return try NSRegularExpression(pattern: "(?:^|[^a-z])\(escaped)(?:$|[^a-z])")
  }

  static func glossRelation(
    query: String, gloss: String, token: NSRegularExpression
  ) -> DictionaryMatch.GlossRelation? {
    let value = SearchQuery(gloss).value
    if value == query { return .exactGloss }
    if endsInNote(value, after: query) { return .qualifiedGloss }
    if value == "to \(query)" { return .exactInfinitive }
    if endsInNote(value, after: "to \(query)") { return .qualifiedInfinitive }
    let range = NSRange(value.startIndex..., in: value)
    return token.firstMatch(in: value, range: range) != nil ? .glossToken : nil
  }

  private static func endsInNote(_ gloss: String, after phrase: String) -> Bool {
    guard gloss.hasPrefix("\(phrase) (") else { return false }
    var notes = gloss.dropFirst(phrase.count + 1)
    while let close = closingParenthesis(of: notes) {
      notes = notes[notes.index(after: close)...]
      if notes.isEmpty { return true }
      guard notes.hasPrefix(" (") else { return false }
      notes = notes.dropFirst()
    }
    return false
  }

  private static func closingParenthesis(of note: Substring) -> Substring.Index? {
    var depth = 0
    for index in note.indices {
      if note[index] == "(" { depth += 1 }
      if note[index] == ")" {
        depth -= 1
        if depth == 0 { return index }
      }
    }
    return nil
  }

  private static func hasSearchTerms(_ value: String) -> Bool {
    value.unicodeScalars.contains { CharacterSet.alphanumerics.contains($0) }
  }

  private static func glossEvidencePrecedes(
    _ lhs: DictionaryMatch.GlossEvidence,
    _ rhs: DictionaryMatch.GlossEvidence
  ) -> Bool {
    let lhsLane = lhs.relation == .glossToken ? 1 : 0
    let rhsLane = rhs.relation == .glossToken ? 1 : 0
    if lhsLane != rhsLane { return lhsLane < rhsLane }
    if lhs.senseOrder != rhs.senseOrder { return lhs.senseOrder < rhs.senseOrder }
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    return lhs.glossOrder < rhs.glossOrder
  }

  private static let asciiCandidateSQL = """
    WITH candidates AS (
      SELECT g.entry_id
      FROM dictionary_gloss_fts x
      JOIN gloss_atoms g ON g.rowid = x.docid
      WHERE dictionary_gloss_fts MATCH ?
      UNION
      SELECT f.entry_id
      FROM dictionary_form_fts x
      JOIN forms f ON f.rowid = x.docid
      WHERE dictionary_form_fts MATCH ? AND f.kind = \(SearchFormKind.romaji.rawValue)
    )
    SELECT \(selectedColumns), p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM candidates c
    JOIN entries e ON e.id = c.entry_id
    \(displayedFormProfileJoin)
    """

  private static let exactASCIICandidateSQL = """
    SELECT \(selectedColumns), p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    \(displayedFormProfileJoin)
    WHERE f.kind = \(SearchFormKind.romaji.rawValue) AND f.form = ?
    """

  private static let displayedFormProfileJoin = """
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = e.id AND p.form = e.headword
      AND p.kind = CASE WHEN e.headword = e.reading
        THEN \(SearchFormKind.reading.rawValue) ELSE \(SearchFormKind.written.rawValue) END
    """

  private static let glossEvidenceSQL = """
    SELECT lower(hex(g.entry_id)), g.sense_order, g.gloss_order, g.text,
      s.parts_of_speech_json, e.headword, e.reading
    FROM dictionary_gloss_fts x
    JOIN gloss_atoms g ON g.rowid = x.docid
    JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
    JOIN entries e ON e.id = g.entry_id
    WHERE dictionary_gloss_fts MATCH ?
    """

  private static let romajiEvidenceSQL = """
    SELECT lower(hex(f.entry_id)), f.form
    FROM dictionary_form_fts x
    JOIN forms f ON f.rowid = x.docid
    WHERE dictionary_form_fts MATCH ? AND f.kind = \(SearchFormKind.romaji.rawValue)
    """

  private static let exactRomajiEvidenceSQL = """
    SELECT lower(hex(entry_id)), form FROM forms
    WHERE kind = \(SearchFormKind.romaji.rawValue) AND form = ?
    """
}
