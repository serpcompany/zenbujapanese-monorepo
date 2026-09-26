import Foundation

struct DictionaryEntry: Hashable, Identifiable, Sendable {
  let id: LanguageReferenceID
  let noteID: WordNoteID
  let sourceProvenances: [LanguageReferenceProvenance]
  let reading: String
  let headword: String
  let summary: String
  let meanings: [String]
  let partsOfSpeech: [PartOfSpeech]
  let writtenForms: [DictionaryForm]
  let readingForms: [DictionaryForm]
  let senses: [DictionarySense]
  let relationships: [DictionaryRelationship]
  let pitchAccent: PitchAccent?
  let isCommon: Bool

  var sourceProvenance: LanguageReferenceProvenance { sourceProvenances[0] }

  func normalizingIdentity(
    to canonical: DictionaryEntry,
    provenances: [LanguageReferenceProvenance]
  ) -> DictionaryEntry {
    DictionaryEntry(
      id: canonical.id,
      noteID: canonical.noteID,
      sourceProvenances: LanguageReferenceIdentity.sortedProvenances(provenances),
      reading: reading,
      headword: headword,
      summary: summary,
      meanings: meanings,
      partsOfSpeech: partsOfSpeech,
      writtenForms: writtenForms,
      readingForms: readingForms,
      senses: senses,
      relationships: relationships,
      pitchAccent: pitchAccent,
      isCommon: isCommon
    )
  }

  var alternativeForms: [DictionaryForm] {
    var seen = Set<String>()
    return (writtenForms + readingForms).filter {
      $0.value != headword
        && $0.value != reading
        && !$0.labels.contains("Search only")
        && seen.insert($0.value).inserted
    }
  }

  var primaryKanji: [String] {
    var seen = Set<Character>()
    return headword.compactMap { character in
      guard character.isCJKUnifiedIdeograph, seen.insert(character).inserted else { return nil }
      return String(character)
    }
  }

  var alternativeKanji: [String] {
    let primary = Set(primaryKanji)
    var seen = Set<String>()
    return
      writtenForms
      .filter { $0.value != headword }
      .flatMap { form in form.value.map(String.init) }
      .filter { character in
        character.first?.isCJKUnifiedIdeograph == true
          && !primary.contains(character)
          && seen.insert(character).inserted
      }
  }

  var displayPartOfSpeech: String {
    partsOfSpeech.map(\.rawValue).joined(separator: " · ")
  }

  var encounterWordReference: EncounterWordReference {
    EncounterWordReference(id: noteID, headword: headword, reading: reading)
  }
}

extension Character {
  fileprivate var isCJKUnifiedIdeograph: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}

struct PartOfSpeech: RawRepresentable, Hashable, Sendable, Codable {
  let rawValue: String

  init(rawValue: String) {
    self.rawValue = rawValue
  }

  init(from decoder: Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

extension PartOfSpeech {
  static let suruVerb = Self(rawValue: "Suru Verb")
  static let irregularVerb = Self(rawValue: "Irregular Verb")
  static let ichidanVerb = Self(rawValue: "Ichidan Verb")
  static let godanVerb = Self(rawValue: "Godan Verb")
  static let iAdjective = Self(rawValue: "I-adjective")
  static let naAdjective = Self(rawValue: "Na-adjective")
}

struct DictionaryForm: Hashable, Sendable, Codable {
  let value: String
  let kind: Kind
  let labels: [String]

  enum Kind: String, Hashable, Sendable, Codable {
    case written
    case reading
  }
}

struct DictionarySense: Hashable, Sendable, Codable {
  let meaning: String
  let notes: [String]
  let partsOfSpeech: [PartOfSpeech]
}

struct DictionaryRelationship: Hashable, Sendable, Codable {
  let query: String
  let headword: String
  let reading: String
  let summary: String
  let relation: String
  let sourceIdentity: String
  let sourceReference: String?
  let targetSense: Int?
  let targetID: String?
}

struct PitchAccent: Hashable, Sendable, Codable {
  let downstep: Int
  let moraCount: Int
  let sourceIdentity: String
}

struct LanguageReferenceID: Hashable, Sendable {
  let rawValue: String
}

struct WordNoteID: Codable, Hashable, Sendable {
  let rawValue: String
}

struct LanguageReferenceProvenance: Hashable, Sendable {
  let sourceIdentity: String
  let sourceRecordID: String
}

enum LanguageReferenceIdentity {
  static func canonicalID(_ ids: [LanguageReferenceID]) -> LanguageReferenceID? {
    ids.min { $0.rawValue < $1.rawValue }
  }

  static func canonicalEntry(_ entries: [DictionaryEntry]) -> DictionaryEntry? {
    guard let id = canonicalID(entries.map(\.id)) else { return nil }
    return entries.first { $0.id == id }
  }

  static func normalizedEntry(
    _ entries: [DictionaryEntry],
    preserving preferred: DictionaryEntry? = nil
  ) -> DictionaryEntry? {
    guard let canonical = canonicalEntry(entries) else { return nil }
    let presentation = preferred ?? canonical
    return presentation.normalizingIdentity(
      to: canonical,
      provenances: entries.flatMap(\.sourceProvenances)
    )
  }

  static func sortedProvenances(
    _ provenances: [LanguageReferenceProvenance]
  ) -> [LanguageReferenceProvenance] {
    Array(Set(provenances)).sorted {
      if $0.sourceIdentity != $1.sourceIdentity { return $0.sourceIdentity < $1.sourceIdentity }
      return $0.sourceRecordID < $1.sourceRecordID
    }
  }
}

struct DictionaryRelevance: Equatable, Sendable, Comparable {
  let sourceOrder: Int
  let matchRank: DictionaryPresentationRank

  static let maximum = Self(
    sourceOrder: .max,
    matchRank: .japanese(JapaneseDictionaryPresentationRank(relation: .readingContains))
  )

  static func < (lhs: Self, rhs: Self) -> Bool {
    if lhs.sourceOrder != rhs.sourceOrder { return lhs.sourceOrder < rhs.sourceOrder }
    return lhs.matchRank < rhs.matchRank
  }
}

struct LookupSearchResultItem: Sendable {
  let entry: DictionaryEntry
  let relevance: DictionaryRelevance
  let fallbackOrder: Int
  let matchedSummary: String?

  var displaySummary: String { matchedSummary ?? entry.summary }

  func rebased(sourceOrder: Int, fallbackOrder: Int) -> Self {
    Self(
      entry: entry,
      relevance: DictionaryRelevance(sourceOrder: sourceOrder, matchRank: relevance.matchRank),
      fallbackOrder: fallbackOrder,
      matchedSummary: matchedSummary
    )
  }
}

struct LookupSearchResults: Sendable {
  /// The relevance-filtered, deduplicated candidate set in deterministic dictionary order.
  /// Frequency is deliberately not part of retrieval; the presentation layer reorders this
  /// bounded set with evidence from the active frequency pack.
  let items: [LookupSearchResultItem]
  /// Count of the leading equivalent lexical-rank group. Radical-origin presentation uses
  /// this bound to preserve its intentionally narrow candidate list without restoring buckets.
  let leadingLexicalEntryCount: Int
  let presentation: Presentation
  let resolution: Resolution
  let readingRefinement: SearchRefinement?
  let usesPrimaryEntryExamples: Bool
  let hasExactOrPrefixMatch: Bool

  init(
    items: [LookupSearchResultItem],
    leadingLexicalEntryCount: Int? = nil,
    presentation: Presentation = .ranked,
    resolution: Resolution = .direct,
    readingRefinement: SearchRefinement? = nil,
    usesPrimaryEntryExamples: Bool = false,
    hasExactOrPrefixMatch: Bool = true
  ) {
    self.items = items
    self.leadingLexicalEntryCount = min(leadingLexicalEntryCount ?? items.count, items.count)
    self.presentation = presentation
    self.resolution = resolution
    self.readingRefinement = readingRefinement
    self.usesPrimaryEntryExamples = usesPrimaryEntryExamples
    self.hasExactOrPrefixMatch = hasExactOrPrefixMatch
  }

  static let empty = LookupSearchResults(items: [], hasExactOrPrefixMatch: false)

  var entries: [DictionaryEntry] { items.map(\.entry) }
  var wasDeinflected: Bool { resolution == .deinflected }

  var isEmpty: Bool {
    entries.isEmpty
  }

  func relevance(for entry: DictionaryEntry) -> DictionaryRelevance {
    items.first { $0.entry.id == entry.id }?.relevance ?? .maximum
  }

  func fallbackOrder(for entry: DictionaryEntry) -> Int {
    items.first { $0.entry.id == entry.id }?.fallbackOrder ?? .max
  }

  func displaySummary(for entry: DictionaryEntry) -> String {
    items.first { $0.entry.id == entry.id }?.displaySummary ?? entry.summary
  }

  func primaryEntry(for query: SearchQuery) -> DictionaryEntry? {
    entries.first { $0.headword == query.value } ?? entries.first
  }

  func usingPrimaryEntryExamples() -> LookupSearchResults {
    LookupSearchResults(
      items: items,
      leadingLexicalEntryCount: leadingLexicalEntryCount,
      presentation: presentation,
      resolution: resolution,
      readingRefinement: readingRefinement,
      usesPrimaryEntryExamples: true,
      hasExactOrPrefixMatch: hasExactOrPrefixMatch
    )
  }

  func offeringReadingRefinement(_ query: SearchQuery) -> LookupSearchResults {
    LookupSearchResults(
      items: items,
      leadingLexicalEntryCount: leadingLexicalEntryCount,
      presentation: presentation,
      resolution: resolution,
      readingRefinement: SearchRefinement(query: query),
      usesPrimaryEntryExamples: usesPrimaryEntryExamples,
      hasExactOrPrefixMatch: hasExactOrPrefixMatch
    )
  }

  func presenting(
    _ presentation: Presentation,
    hasExactOrPrefixMatch: Bool? = nil
  ) -> LookupSearchResults {
    LookupSearchResults(
      items: items,
      leadingLexicalEntryCount: leadingLexicalEntryCount,
      presentation: presentation,
      resolution: resolution,
      readingRefinement: readingRefinement,
      usesPrimaryEntryExamples: usesPrimaryEntryExamples,
      hasExactOrPrefixMatch: hasExactOrPrefixMatch ?? self.hasExactOrPrefixMatch
    )
  }

  static func composing(
    sources: [[LookupSearchResultItem]],
    leadingLexicalEntryCount: Int,
    usesPrimaryEntryExamples: Bool,
    hasExactOrPrefixMatch: Bool = true,
    resolution: Resolution = .direct,
    limit: Int = 60
  ) -> LookupSearchResults {
    var items: [LookupSearchResultItem] = []
    var seen = Set<LanguageReferenceID>()
    for (sourceOrder, source) in sources.enumerated() {
      for item in source where seen.insert(item.entry.id).inserted {
        items.append(item.rebased(sourceOrder: sourceOrder, fallbackOrder: items.count))
        if items.count == limit { break }
      }
      if items.count == limit { break }
    }
    return LookupSearchResults(
      items: items,
      leadingLexicalEntryCount: leadingLexicalEntryCount,
      resolution: resolution,
      usesPrimaryEntryExamples: usesPrimaryEntryExamples,
      hasExactOrPrefixMatch: hasExactOrPrefixMatch
    )
  }

  enum Presentation: Equatable, Sendable {
    case ranked
    case discoveredWords
  }

  enum Resolution: Equatable, Sendable {
    case direct
    case deinflected
    case analyzed
  }
}

struct SearchRefinement: Hashable, Sendable {
  let query: SearchQuery
}
