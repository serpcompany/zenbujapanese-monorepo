import Foundation

enum FrequencyTier: Int, Comparable, Sendable {
  case rare = 1
  case uncommon
  case moderate
  case common
  case veryCommon

  init(rank: Int) {
    switch rank {
    case ...1_500: self = .veryCommon
    case ...5_000: self = .common
    case ...15_000: self = .moderate
    case ...30_000: self = .uncommon
    default: self = .rare
    }
  }

  var label: String {
    switch self {
    case .veryCommon: "very common"
    case .common: "common"
    case .moderate: "moderately common"
    case .uncommon: "uncommon"
    case .rare: "rare"
    }
  }

  init(level: JLPTLevel) {
    switch level {
    case .n5, .n4: self = .veryCommon
    case .n3, .n2: self = .common
    case .n1: self = .moderate
    }
  }

  static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

struct FrequencyPresentationModel: Equatable, Sendable {
  let result: FrequencyLookupResult
  let packName: String
  let tier: FrequencyTier?
  let inlineText: String
  let inlineAccessibilityLabel: String
  let pack: FrequencyPackDisclosure?
  let rankText: String?
  let percentileText: String?
  let levelText: String?
  let explanation: String?
  let missingText: String

  init(result: FrequencyLookupResult) {
    self.result = result
    pack = result.pack
    switch result {
    case .evidence(let evidence):
      let formattedRank = evidence.rank.formatted(.number.locale(Locale(identifier: "en_US")))
      packName = evidence.pack.shortName
      tier = FrequencyTier(rank: evidence.rank)
      inlineText = formattedRank
      inlineAccessibilityLabel =
        "\(evidence.pack.shortName) frequency rank \(evidence.rank), "
        + "\(FrequencyTier(rank: evidence.rank).label). Double tap for details."
      rankText = "#\(formattedRank)"
      percentileText = evidence.topPercentDisplay
      levelText = nil
      explanation = nil
      missingText = "No rank"
    case .level(let evidence):
      packName = evidence.pack.shortName
      tier = FrequencyTier(level: evidence.level)
      inlineText = evidence.level.label
      inlineAccessibilityLabel =
        "\(evidence.pack.shortName) level \(evidence.level.label). Double tap for details."
      rankText = nil
      percentileText = nil
      levelText = evidence.level.label
      explanation = FrequencyLevelEvidence.explanation
      missingText = "Not listed"
    case .noEvidence(let pack):
      packName = pack.shortName
      tier = nil
      inlineText = "—"
      rankText = nil
      percentileText = nil
      levelText = nil
      switch pack.kind {
      case .rank:
        inlineAccessibilityLabel =
          "\(pack.shortName) has no rank for this entry. Double tap for details."
        explanation = "\(pack.displayName) has no mapped frequency rank for this entry."
        missingText = "No rank"
      case .level:
        inlineAccessibilityLabel =
          "\(pack.shortName) does not list this entry. Double tap for details."
        explanation =
          "\(pack.displayName) does not list this entry. \(FrequencyLevelEvidence.explanation)"
        missingText = "Not listed"
      }
    case .unavailable(let unavailable):
      packName = unavailable.pack?.shortName ?? "Frequency"
      tier = nil
      inlineText = "—"
      inlineAccessibilityLabel = "\(packName) rank unavailable. Double tap for details."
      rankText = nil
      percentileText = nil
      levelText = nil
      explanation = unavailable.reason
      missingText = "Unavailable"
    }
  }
}

struct SearchFrequencyRankPresentationModel: Equatable, Sendable {
  let chips: [FrequencyPresentationModel]
  let accessibilityValue: String

  init(ranks: FrequencyRanks?) {
    guard let ranks, !ranks.isEmpty else {
      chips = []
      accessibilityValue =
        ranks == nil ? "Frequency rank loading" : "No frequency dictionary enabled"
      return
    }
    let shown = ranks.enumerated().filter { offset, result in
      if result.hasEvidence { return true }
      if case .noEvidence(let pack) = result, pack.kind == .level { return false }
      return offset == 0
    }.map(\.element)
    guard !shown.isEmpty else {
      chips = []
      accessibilityValue = "No frequency rank"
      return
    }
    chips = shown.map(FrequencyPresentationModel.init(result:))
    accessibilityValue = zip(shown, chips).map { result, chip in
      switch result {
      case .evidence(let evidence):
        "\(chip.packName) frequency rank \(evidence.rank), \(chip.tier?.label ?? "")"
      case .level(let evidence): "\(chip.packName) level \(evidence.level.label)"
      case .noEvidence: "\(chip.packName) has no rank for this entry"
      case .unavailable: "\(chip.packName) rank unavailable"
      }
    }.joined(separator: ", ")
  }

  func collapsed(to limit: Int) -> (chips: [FrequencyPresentationModel], hiddenCount: Int) {
    (Array(chips.prefix(limit)), max(chips.count - limit, 0))
  }
}
