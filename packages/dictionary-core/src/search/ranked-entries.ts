import type { SearchEntry } from './database'
import { compareStrings } from './query'
import { comparePresentationRanks, type Rank } from './rank'

export interface RankedEntry {
  entry: SearchEntry
  rank: Rank
  presentationRank: Rank
  hasExactOrPrefixMatch: boolean
  semanticFingerprint: string
  matchedSummary: string | null
}

export function minimum<Value>(values: Value[], compare: (lhs: Value, rhs: Value) => number) {
  let best: Value | undefined
  for (const value of values) {
    if (best === undefined || compare(value, best) < 0) best = value
  }
  return best
}

export function deduplicated(ranked: RankedEntry[]): RankedEntry[] {
  const groups = new Map<string, RankedEntry[]>()
  for (const entry of ranked) {
    const group = groups.get(entry.semanticFingerprint)
    if (group) group.push(entry)
    else groups.set(entry.semanticFingerprint, [entry])
  }
  return [...groups.values()].map(group => {
    const leading = group[0]
    const strongest = minimum(group, (lhs, rhs) =>
      comparePresentationRanks(lhs.presentationRank, rhs.presentationRank)
    )
    const canonical =
      minimum(group, (lhs, rhs) => compareStrings(lhs.entry.id, rhs.entry.id)) ?? leading
    return {
      entry: {
        ...leading.entry,
        id: canonical.entry.id,
        sourceRecordId: canonical.entry.sourceRecordId
      },
      rank: leading.rank,
      hasExactOrPrefixMatch: group.some(ranked => ranked.hasExactOrPrefixMatch),
      semanticFingerprint: leading.semanticFingerprint,
      presentationRank: strongest?.presentationRank ?? leading.presentationRank,
      matchedSummary: strongest?.matchedSummary ?? null
    }
  })
}
