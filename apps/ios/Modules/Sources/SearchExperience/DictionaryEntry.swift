import Foundation

struct DictionaryEntry: Hashable, Identifiable, Sendable {
  let id: LanguageReferenceID
  let noteID: WordNoteID
  let sourceProvenance: LanguageReferenceProvenance
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

  var frequency: Frequency {
    isCommon ? .common : .unmarked
  }

  enum Frequency: String, Sendable {
    case common = "COMMON"
    case unmarked = "UNMARKED"
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
    return writtenForms
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
}

private extension Character {
  var isCJKUnifiedIdeograph: Bool {
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

struct WordNoteID: Hashable, Sendable {
  let rawValue: String
}

struct LanguageReferenceProvenance: Hashable, Sendable {
  let sourceIdentity: String
  let sourceRecordID: String
}

struct LookupSearchResults: Sendable {
  let best: [DictionaryEntry]
  let additional: [DictionaryEntry]
  let presentation: Presentation
  let readingRefinement: SearchRefinement?
  let usesPrimaryEntryExamples: Bool
  let hasExactOrPrefixMatch: Bool

  init(
    best: [DictionaryEntry],
    additional: [DictionaryEntry],
    presentation: Presentation = .ranked,
    readingRefinement: SearchRefinement? = nil,
    usesPrimaryEntryExamples: Bool = false,
    hasExactOrPrefixMatch: Bool = true
  ) {
    self.best = best
    self.additional = additional
    self.presentation = presentation
    self.readingRefinement = readingRefinement
    self.usesPrimaryEntryExamples = usesPrimaryEntryExamples
    self.hasExactOrPrefixMatch = hasExactOrPrefixMatch
  }

  static let empty = LookupSearchResults(best: [], additional: [], hasExactOrPrefixMatch: false)

  var isEmpty: Bool {
    best.isEmpty && additional.isEmpty
  }

  func primaryEntry(for query: SearchQuery) -> DictionaryEntry? {
    (best + additional).first { $0.headword == query.value }
      ?? best.first
      ?? additional.first
  }

  func usingPrimaryEntryExamples() -> LookupSearchResults {
    LookupSearchResults(
      best: best,
      additional: additional,
      presentation: presentation,
      readingRefinement: readingRefinement,
      usesPrimaryEntryExamples: true,
      hasExactOrPrefixMatch: hasExactOrPrefixMatch
    )
  }

  enum Presentation: Sendable {
    case ranked
    case discoveredWords
  }
}

struct SearchRefinement: Hashable, Sendable {
  let query: SearchQuery
}
