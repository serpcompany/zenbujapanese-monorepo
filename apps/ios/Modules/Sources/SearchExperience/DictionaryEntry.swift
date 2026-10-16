import Foundation

struct DictionaryEntry: Hashable, Identifiable, Sendable {
  let id: LanguageReferenceID
  let noteID: WordNoteID
  let sourceRecord: LanguageReferenceProvenance
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
  let pitch: PitchAccent?
  let compoundPitch: PitchAccent?
  let isCommon: Bool

  var shortMeaning: String? { Self.shortMeaning(from: meanings) }

  static func shortMeaning(from meanings: [String]) -> String? {
    meanings.first.flatMap(PresentationCore.shared.gloss)
  }

  func withSourceProvenances(_ provenances: [LanguageReferenceProvenance]) -> DictionaryEntry {
    DictionaryEntry(
      id: id,
      noteID: noteID,
      sourceRecord: sourceRecord,
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
      pitch: pitch,
      compoundPitch: compoundPitch,
      isCommon: isCommon
    )
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
  static func sortedProvenances(
    _ provenances: [LanguageReferenceProvenance]
  ) -> [LanguageReferenceProvenance] {
    Array(Set(provenances)).sorted {
      if $0.sourceIdentity != $1.sourceIdentity { return $0.sourceIdentity < $1.sourceIdentity }
      return $0.sourceRecordID < $1.sourceRecordID
    }
  }
}

struct LookupSearchResults: Sendable {
  let entries: [DictionaryEntry]
  let presentation: Presentation
  let resolution: Resolution
  let readingRefinement: SearchRefinement?
  let usesPrimaryEntryExamples: Bool
  let primaryEntry: DictionaryEntry?
  let listed: String

  static let empty = LookupSearchResults(
    entries: [], presentation: .ranked, resolution: .direct, readingRefinement: nil,
    usesPrimaryEntryExamples: false, primaryEntry: nil, listed: "{\"items\":[]}")

  var isEmpty: Bool {
    entries.isEmpty
  }

  enum Presentation: String, Decodable, Equatable, Sendable {
    case ranked
    case discoveredWords
  }

  enum Resolution: String, Decodable, Equatable, Sendable {
    case direct
    case deinflected
    case analyzed
  }
}

struct SearchRefinement: Hashable, Sendable {
  let query: SearchQuery
}
