import { type Interruptible, type SearchEntry, stopIfInterrupted } from './database'
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

export function minimum<Value>(
  values: readonly Value[],
  compare: (lhs: Value, rhs: Value) => number
) {
  let best: Value | undefined
  for (const value of values) {
    if (best === undefined || compare(value, best) < 0) best = value
  }
  return best
}

export function canonicalEntry<Entry extends { id: string }>(
  equivalents: readonly Entry[]
): Entry | undefined {
  return minimum(equivalents, (lhs, rhs) => compareStrings(lhs.id, rhs.id))
}

export function deduplicated(ranked: RankedEntry[], client: Interruptible = {}): RankedEntry[] {
  const groups = new Map<string, RankedEntry[]>()
  let step = 0
  for (const entry of ranked) {
    stopIfInterrupted(client, step++)
    const group = groups.get(entry.semanticFingerprint)
    if (group) group.push(entry)
    else groups.set(entry.semanticFingerprint, [entry])
  }
  return [...groups.values()].map(group => {
    const leading = group[0]
    const strongest = minimum(group, (lhs, rhs) =>
      comparePresentationRanks(lhs.presentationRank, rhs.presentationRank)
    )
    const canonical = canonicalEntry(group.map(ranked => ranked.entry)) ?? leading.entry
    return {
      entry: {
        ...leading.entry,
        id: canonical.id,
        sourceRecordId: canonical.sourceRecordId
      },
      rank: leading.rank,
      hasExactOrPrefixMatch: group.some(ranked => ranked.hasExactOrPrefixMatch),
      semanticFingerprint: leading.semanticFingerprint,
      presentationRank: strongest?.presentationRank ?? leading.presentationRank,
      matchedSummary: strongest?.matchedSummary ?? null
    }
  })
}
