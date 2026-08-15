import Foundation

struct LanguageReferencePriorityProfile: Hashable, Sendable, Comparable {
  let primaryMask: Int
  let secondaryMask: Int
  let newsFrequencyBand: Int?

  static let unmarked = Self(primaryMask: 0, secondaryMask: 0, newsFrequencyBand: nil)

  var isMarked: Bool {
    primaryMask != 0 || secondaryMask != 0 || newsFrequencyBand != nil
  }

  private var category: Int {
    if primaryMask & 0b0001 != 0 { return 0 }
    if primaryMask & 0b0010 != 0 { return 1 }
    if primaryMask & 0b0100 != 0 { return 2 }
    if primaryMask & 0b1000 != 0 || secondaryMask & 0b0001 != 0 { return 3 }
    if secondaryMask & 0b0110 != 0 { return 4 }
    if secondaryMask & 0b1000 != 0 { return 5 }
    return 9
  }

  private var primaryBreadthRank: Int {
    -primaryMask.nonzeroBitCount
  }

  static func < (lhs: Self, rhs: Self) -> Bool {
    if lhs.category != rhs.category { return lhs.category < rhs.category }
    if lhs.newsFrequencyBand != rhs.newsFrequencyBand {
      return (lhs.newsFrequencyBand ?? 99) < (rhs.newsFrequencyBand ?? 99)
    }
    return lhs.primaryBreadthRank < rhs.primaryBreadthRank
  }
}

struct DictionaryMatch: Hashable, Sendable {
  enum EvidenceLane: Int, Hashable, Sendable, Comparable {
    case strongGloss
    case tokenGloss
    case romajiOnly

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  enum GlossRelation: Int, Hashable, Sendable, Comparable {
    case exactGloss
    case qualifiedGloss
    case exactInfinitive
    case qualifiedInfinitive
    case glossToken

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  enum RomajiRelation: Int, Hashable, Sendable, Comparable {
    case exact
    case prefix
    case contains

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  enum FormRelation: Int, Hashable, Sendable, Comparable {
    case writtenExact
    case readingExact
    case writtenPrefix
    case readingPrefix
    case writtenContains
    case readingContains

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  struct GlossEvidence: Hashable, Sendable {
    let relation: GlossRelation
    let senseOrder: Int
    let glossOrder: Int
    let partsOfSpeech: [PartOfSpeech]
    let restrictedWrittenForms: [String]
    let restrictedReadingForms: [String]
  }

  struct FormEvidence: Hashable, Sendable {
    let relation: FormRelation
    let normalizedForm: String
    let priorityProfile: LanguageReferencePriorityProfile
  }

  let glossEvidence: [GlossEvidence]
  let romajiEvidence: [RomajiRelation]
  let formEvidence: [FormEvidence]
  let displayedFormPriority: LanguageReferencePriorityProfile
}

struct EnglishDictionaryRank: Comparable, Sendable {
  let lane: DictionaryMatch.EvidenceLane
  let corroborationRank: Int
  let romajiSpecificityRank: Int
  let senseOrder: Int
  let priorityPresenceRank: Int
  let relation: DictionaryMatch.GlossRelation
  let priorityProfile: LanguageReferencePriorityProfile
  let glossOrder: Int
  let headwordLength: Int
  let semanticFingerprint: String

  static func < (lhs: Self, rhs: Self) -> Bool {
    if lhs.lane != rhs.lane { return lhs.lane < rhs.lane }
    if lhs.corroborationRank != rhs.corroborationRank {
      return lhs.corroborationRank < rhs.corroborationRank
    }
    if lhs.romajiSpecificityRank != rhs.romajiSpecificityRank {
      return lhs.romajiSpecificityRank < rhs.romajiSpecificityRank
    }
    if lhs.senseOrder != rhs.senseOrder { return lhs.senseOrder < rhs.senseOrder }
    if lhs.priorityPresenceRank != rhs.priorityPresenceRank {
      return lhs.priorityPresenceRank < rhs.priorityPresenceRank
    }
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    if lhs.priorityProfile < rhs.priorityProfile { return true }
    if rhs.priorityProfile < lhs.priorityProfile { return false }
    if lhs.glossOrder != rhs.glossOrder { return lhs.glossOrder < rhs.glossOrder }
    if lhs.headwordLength != rhs.headwordLength { return lhs.headwordLength < rhs.headwordLength }
    return lhs.semanticFingerprint < rhs.semanticFingerprint
  }
}

struct JapaneseDictionaryRank: Comparable, Sendable {
  let relation: DictionaryMatch.FormRelation
  let priorityProfile: LanguageReferencePriorityProfile
  let senseBreadthRank: Int
  let headwordLength: Int
  let semanticFingerprint: String

  static func < (lhs: Self, rhs: Self) -> Bool {
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    if lhs.priorityProfile < rhs.priorityProfile { return true }
    if rhs.priorityProfile < lhs.priorityProfile { return false }
    if lhs.senseBreadthRank != rhs.senseBreadthRank {
      return lhs.senseBreadthRank < rhs.senseBreadthRank
    }
    if lhs.headwordLength != rhs.headwordLength { return lhs.headwordLength < rhs.headwordLength }
    return lhs.semanticFingerprint < rhs.semanticFingerprint
  }
}
