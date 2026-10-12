import {
  type FrequencyDictionary,
  type FrequencyLookup,
  type FrequencyTier,
  frequencyFamily,
  frequencySortName,
  frequencySortValue,
  frequencyTier
} from '../detail/frequency'

export interface RankedResult {
  id: string
  relevance: number
  fallbackOrder: number
}

export type LookupsByEntry = (id: string) => readonly FrequencyLookup[] | null

const tierValue: Record<FrequencyTier, number> = {
  rare: 1,
  uncommon: 2,
  moderate: 3,
  common: 4,
  veryCommon: 5
}

interface Ranks {
  values: (number | null)[]
  tier: number | null
}

function ranks(lookups: readonly FrequencyLookup[]): Ranks {
  const tier = lookups.map(frequencyTier).find(found => found !== null)
  return { values: lookups.map(frequencySortValue), tier: tier ? tierValue[tier] : null }
}

export function orderedByFrequency<Result extends RankedResult>(
  results: readonly Result[],
  lookups: LookupsByEntry
): Result[] {
  const ranksById = new Map(results.map(result => [result.id, ranks(lookups(result.id) ?? [])]))
  return [...results].sort((lhs, rhs) => {
    if (lhs.relevance !== rhs.relevance) return lhs.relevance - rhs.relevance
    const left = ranksById.get(lhs.id) as Ranks
    const right = ranksById.get(rhs.id) as Ranks
    if (left.tier !== right.tier) {
      if (left.tier === null) return 1
      if (right.tier === null) return -1
      return right.tier - left.tier
    }
    for (let index = 0; index < Math.max(left.values.length, right.values.length); index++) {
      const lhsValue = left.values[index] ?? null
      const rhsValue = right.values[index] ?? null
      if (lhsValue !== null && rhsValue !== null && lhsValue !== rhsValue) {
        return lhsValue - rhsValue
      }
      if (lhsValue !== null && rhsValue === null) return -1
      if (lhsValue === null && rhsValue !== null) return 1
    }
    if (lhs.fallbackOrder !== rhs.fallbackOrder) return lhs.fallbackOrder - rhs.fallbackOrder
    return lhs.id < rhs.id ? -1 : lhs.id > rhs.id ? 1 : 0
  })
}

export function firstOfEachGroup<Result extends RankedResult>(
  ordered: readonly Result[]
): Result[] {
  const groups = new Set<number>()
  const listed = new Set<string>()
  return ordered.filter(result => {
    if (groups.has(result.relevance)) return false
    groups.add(result.relevance)
    if (listed.has(result.id)) return false
    listed.add(result.id)
    return true
  })
}

export type ResultSort =
  | { by: 'relevance' }
  | { by: 'frequency'; family: string }
  | { by: 'knownWords' }

export const relevanceSort: ResultSort = { by: 'relevance' }

export function resultSort(stored: string): ResultSort {
  const parts = stored.split('|').filter(part => part !== '')
  if (parts.length === 1 && parts[0] === 'default') return relevanceSort
  if (parts.length === 2 && parts[0] === 'frequency') return { by: 'frequency', family: parts[1] }
  if (parts.length === 1 && parts[0] === 'known-words') return { by: 'knownWords' }
  return relevanceSort
}

export function storedSort(sort: ResultSort): string {
  if (sort.by === 'frequency') return `frequency|${sort.family}`
  return sort.by === 'knownWords' ? 'known-words' : 'default'
}

const sameSort = (lhs: ResultSort, rhs: ResultSort) => storedSort(lhs) === storedSort(rhs)

export function appliedSort(
  sort: ResultSort,
  dictionaries: readonly FrequencyDictionary[] | null
): ResultSort {
  if (sort.by !== 'frequency') return sort
  const isEnabled = dictionaries?.some(({ id }) => frequencyFamily(id) === sort.family) ?? false
  return isEnabled ? sort : relevanceSort
}

export function forgetsSort(
  sort: ResultSort,
  dictionaries: readonly FrequencyDictionary[] | null
): boolean {
  return dictionaries !== null && !sameSort(appliedSort(sort, dictionaries), sort)
}

function sortedDictionaryName(family: string, dictionaries: readonly FrequencyDictionary[]) {
  const dictionary = dictionaries.find(({ id }) => frequencyFamily(id) === family)
  return dictionary ? frequencySortName(dictionary) : 'Frequency'
}

export function sortSummary(
  sort: ResultSort,
  dictionaries: readonly FrequencyDictionary[]
): string {
  if (sort.by === 'frequency') return sortedDictionaryName(sort.family, dictionaries)
  return sort.by === 'knownWords' ? 'Known Words' : 'Default'
}

export function sortAnnouncement(
  sort: ResultSort,
  dictionaries: readonly FrequencyDictionary[]
): string {
  if (sort.by === 'frequency') {
    return `Sorted by ${sortedDictionaryName(sort.family, dictionaries)}`
  }
  return sort.by === 'knownWords' ? 'Sorted by known words' : 'Sorted by default order'
}

function stablySorted<Result>(
  results: readonly Result[],
  key: (result: Result) => number[]
): Result[] {
  return results
    .map((result, offset) => ({ result, key: [...key(result), offset] }))
    .sort((lhs, rhs) => {
      for (let index = 0; index < Math.min(lhs.key.length, rhs.key.length); index++) {
        if (lhs.key[index] !== rhs.key[index]) return lhs.key[index] - rhs.key[index]
      }
      return lhs.key.length - rhs.key.length
    })
    .map(({ result }) => result)
}

export function sortedResults<Result extends { id: string }>(
  results: readonly Result[],
  sort: ResultSort,
  lookups: LookupsByEntry,
  isKnown: (id: string) => boolean
): Result[] {
  if (sort.by === 'relevance') return [...results]
  if (sort.by === 'knownWords') return stablySorted(results, ({ id }) => [isKnown(id) ? 0 : 1])
  return stablySorted(results, ({ id }) => {
    const lookup = lookups(id)?.find(
      ({ dictionary }) => dictionary !== null && frequencyFamily(dictionary.id) === sort.family
    )
    const value = lookup ? frequencySortValue(lookup) : null
    return value === null ? [1] : [0, value]
  })
}

export const resultFilters = ['all', 'known', 'unknown'] as const

export type ResultFilter = (typeof resultFilters)[number]

export function resultFilter(stored: string): ResultFilter {
  return resultFilters.find(filter => filter === stored) ?? 'all'
}

export const filterTitles: Record<ResultFilter, string> = {
  all: 'All',
  known: 'Known',
  unknown: 'Unknown'
}

export function filteredResults<Result extends { id: string }>(
  results: readonly Result[],
  filter: ResultFilter,
  isKnown: (id: string) => boolean
): Result[] {
  if (filter === 'all') return [...results]
  return results.filter(({ id }) => isKnown(id) === (filter === 'known'))
}

export function hiddenCountTitle(count: number): string {
  return count === 1 ? '1 word hidden by filter' : `${count} words hidden by filter`
}

export function shownCountAnnouncement(count: number): string {
  return count === 1 ? '1 word shown' : `${count} words shown`
}
