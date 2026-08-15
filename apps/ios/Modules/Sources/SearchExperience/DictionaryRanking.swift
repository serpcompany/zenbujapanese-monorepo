import Foundation

struct PrimaryPriorityMarkers: OptionSet, Hashable, Sendable {
  let rawValue: Int

  static let special = Self(rawValue: 1 << 0)
  static let learner = Self(rawValue: 1 << 1)
  static let news = Self(rawValue: 1 << 2)
  static let loanword = Self(rawValue: 1 << 3)
}

struct SecondaryPriorityMarkers: OptionSet, Hashable, Sendable {
  let rawValue: Int

  static let special = Self(rawValue: 1 << 0)
  static let learner = Self(rawValue: 1 << 1)
  static let news = Self(rawValue: 1 << 2)
  static let loanword = Self(rawValue: 1 << 3)
}

struct LanguageReferencePriorityProfile: Hashable, Sendable, Comparable {
  let primaryMarkers: PrimaryPriorityMarkers
  let secondaryMarkers: SecondaryPriorityMarkers
  let newsFrequencyBand: Int?

  static let unmarked = Self(
    primaryMarkers: [], secondaryMarkers: [], newsFrequencyBand: nil
  )

  var isMarked: Bool {
    !primaryMarkers.isEmpty || !secondaryMarkers.isEmpty || newsFrequencyBand != nil
  }

  private var category: Int {
    if primaryMarkers.contains(.special) { return 0 }
    if primaryMarkers.contains(.learner) { return 1 }
    if primaryMarkers.contains(.news) { return 2 }
    if primaryMarkers.contains(.loanword) || secondaryMarkers.contains(.special) { return 3 }
    if !secondaryMarkers.intersection([.learner, .news]).isEmpty { return 4 }
    if secondaryMarkers.contains(.loanword) { return 5 }
    return 9
  }

  private var primaryBreadthRank: Int {
    -primaryMarkers.rawValue.nonzeroBitCount
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

  var presentationRank: DictionaryPresentationRank {
    .english(
      EnglishDictionaryPresentationRank(
        lane: lane,
        corroborationRank: corroborationRank,
        romajiSpecificityRank: romajiSpecificityRank,
        senseOrder: senseOrder,
        priorityPresenceRank: priorityPresenceRank,
        relation: relation,
        priorityProfile: priorityProfile,
        glossOrder: glossOrder
      )
    )
  }

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

  var presentationRank: DictionaryPresentationRank {
    .japanese(
      JapaneseDictionaryPresentationRank(
        relation: relation,
        priorityProfile: priorityProfile,
        senseBreadthRank: senseBreadthRank
      )
    )
  }

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

enum DictionaryPresentationRank: Equatable, Sendable {
  case english(EnglishDictionaryPresentationRank)
  case japanese(JapaneseDictionaryPresentationRank)
}

struct EnglishDictionaryPresentationRank: Equatable, Sendable {
  let lane: DictionaryMatch.EvidenceLane
  let corroborationRank: Int
  let romajiSpecificityRank: Int
  let senseOrder: Int
  let priorityPresenceRank: Int
  let relation: DictionaryMatch.GlossRelation
  let priorityProfile: LanguageReferencePriorityProfile
  let glossOrder: Int
}

struct JapaneseDictionaryPresentationRank: Equatable, Sendable {
  let relation: DictionaryMatch.FormRelation
  let priorityProfile: LanguageReferencePriorityProfile
  let senseBreadthRank: Int
}
