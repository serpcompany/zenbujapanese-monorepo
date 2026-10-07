import Foundation

extension LanguageReferenceData {
  static func deduplicated(_ entries: [RankedDictionaryEntry]) -> [RankedDictionaryEntry] {
    var groups: [String: [RankedDictionaryEntry]] = [:]
    var orderedFingerprints: [String] = []
    for entry in entries {
      if groups[entry.semanticFingerprint] == nil {
        orderedFingerprints.append(entry.semanticFingerprint)
      }
      groups[entry.semanticFingerprint, default: []].append(entry)
    }
    return orderedFingerprints.compactMap { fingerprint in
      guard let group = groups[fingerprint], let leading = group.first,
        let strongestMatch = group.min(by: {
          $0.presentationRank < $1.presentationRank
        }),
        let normalized = LanguageReferenceIdentity.normalizedEntry(
          group.map(\.entry),
          preserving: leading.entry
        )
      else { return nil }
      return RankedDictionaryEntry(
        entry: normalized,
        presentationRank: strongestMatch.presentationRank,
        legacyPresentationRank: leading.legacyPresentationRank,
        hasExactOrPrefixMatch: group.contains(where: \.hasExactOrPrefixMatch),
        semanticFingerprint: fingerprint,
        matchedSummary: strongestMatch.matchedSummary
      )
    }
  }

  static func resultItems(
    for entries: [RankedDictionaryEntry]
  ) -> [LookupSearchResultItem] {
    entries.enumerated().map { fallbackOrder, entry in
        LookupSearchResultItem(
          entry: entry.entry,
          relevance: DictionaryRelevance(
            sourceOrder: 0,
            matchRank: entry.presentationRank
          ),
          fallbackOrder: fallbackOrder,
          matchedSummary: entry.matchedSummary
        )
    }
  }
}

struct RankedDictionaryEntry {
  let entry: DictionaryEntry
  let presentationRank: DictionaryPresentationRank
  let legacyPresentationRank: DictionaryLegacyPresentationRank
  let hasExactOrPrefixMatch: Bool
  let semanticFingerprint: String
  let matchedSummary: String?
}
