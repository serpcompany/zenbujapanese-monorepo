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

  var shortMeaning: String? { Self.shortMeaning(from: meanings) }

  static func shortMeaning(from meanings: [String], limit: Int = 18) -> String? {
    guard let first = meanings.first else { return nil }
    let withoutNotes = first.replacing(/\s*\([^)]*\)/, with: "")
    var gloss = (withoutNotes.split(separator: ",").first.map(String.init) ?? withoutNotes)
      .trimmingCharacters(in: .whitespaces)
    if gloss.hasPrefix("to ") { gloss.removeFirst(3) }
    guard !gloss.isEmpty else { return nil }
    return gloss.count > limit ? String(gloss.prefix(limit - 1)) + "…" : gloss
  }

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
    PartOfSpeechFormatter.phrase(for: senses.first?.partsOfSpeech ?? partsOfSpeech)
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
}

extension PartOfSpeech {
  static let noun = Self(rawValue: "noun")
  static let pronoun = Self(rawValue: "pronoun")
  static let nounPrefix = Self(rawValue: "nounPrefix")
  static let nounSuffix = Self(rawValue: "nounSuffix")
  static let noAdjective = Self(rawValue: "noAdjective")
  static let prenominal = Self(rawValue: "prenominal")
  static let preNounAdjective = Self(rawValue: "preNounAdjective")
  static let iAdjective = Self(rawValue: "iAdjective")
  static let naAdjective = Self(rawValue: "naAdjective")
  static let taruAdjective = Self(rawValue: "taruAdjective")
  static let archaicAdjective = Self(rawValue: "archaicAdjective")
  static let archaicNaAdjective = Self(rawValue: "archaicNaAdjective")
  static let adverb = Self(rawValue: "adverb")
  static let adverbTo = Self(rawValue: "adverbTo")
  static let auxiliary = Self(rawValue: "auxiliary")
  static let auxiliaryAdjective = Self(rawValue: "auxiliaryAdjective")
  static let auxiliaryVerb = Self(rawValue: "auxiliaryVerb")
  static let conjunction = Self(rawValue: "conjunction")
  static let copula = Self(rawValue: "copula")
  static let counter = Self(rawValue: "counter")
  static let expression = Self(rawValue: "expression")
  static let interjection = Self(rawValue: "interjection")
  static let numeric = Self(rawValue: "numeric")
  static let prefix = Self(rawValue: "prefix")
  static let suffix = Self(rawValue: "suffix")
  static let particle = Self(rawValue: "particle")
  static let unclassified = Self(rawValue: "unclassified")
  static let verb = Self(rawValue: "verb")
  static let ichidanVerb = Self(rawValue: "ichidanVerb")
  static let godanVerb = Self(rawValue: "godanVerb")
  static let suruVerb = Self(rawValue: "suruVerb")
  static let kuruVerb = Self(rawValue: "kuruVerb")
  static let zuruVerb = Self(rawValue: "zuruVerb")
  static let archaicVerb = Self(rawValue: "archaicVerb")
  static let takesSuru = Self(rawValue: "takesSuru")
  static let transitive = Self(rawValue: "transitive")
  static let intransitive = Self(rawValue: "intransitive")
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

extension PitchAccent {
  func levels(moraCount count: Int) -> (morae: [Bool], particle: Bool) {
    let morae = (0..<count).map { index in
      switch downstep {
      case 0: index > 0
      case 1: index == 0
      default: index > 0 && index < downstep
      }
    }
    return (morae, downstep == 0)
  }
}

extension String {
  var morae: [String] {
    let combining = Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ")
    var result: [String] = []
    for character in self {
      if combining.contains(character), let last = result.popLast() {
        result.append(last + String(character))
      } else {
        result.append(String(character))
      }
    }
    return result
  }
}

struct LanguageReferenceID: Hashable, Sendable {
  let rawValue: String

  var bytes: Data? {
    guard rawValue.utf8.count == 32 else { return nil }
    var data = Data(capacity: 16)
    var index = rawValue.startIndex
    while index < rawValue.endIndex {
      let next = rawValue.index(index, offsetBy: 2)
      guard let byte = UInt8(rawValue[index..<next], radix: 16) else { return nil }
      data.append(byte)
      index = next
    }
    return data
  }
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
  let items: [LookupSearchResultItem]
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
