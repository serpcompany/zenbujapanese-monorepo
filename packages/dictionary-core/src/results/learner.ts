import {
  type FrequencyChip,
  type FrequencyDictionary,
  type FrequencyEvidence,
  type FrequencyLookup,
  frequencyFamily,
  frequencyLookupChips,
  frequencySortName,
  frequencyUnavailableNotice
} from '../detail/frequency'
import {
  appliedSort,
  filteredResults,
  filterTitles,
  forgetsSort,
  hiddenCountTitle,
  type LookupsByEntry,
  orderedByFrequency,
  type ResultSort,
  relevanceSort,
  resultFilter,
  resultFilters,
  resultSort,
  shownCountAnnouncement,
  sortAnnouncement,
  sortedResults,
  sortSummary,
  storedSort
} from './ordering'
import {
  discoveredWordsHeading,
  type ListedItem,
  type ListedResults,
  noMatches,
  type ResultsSection,
  readingRefinementSpoken,
  resultsLayout
} from './results'

export type ReadFrequency = (ids: readonly string[]) => FrequencyEvidence | null

export function evidenceLookups(evidence: FrequencyEvidence | null): LookupsByEntry {
  if (!evidence) return () => null
  return id => {
    if (!Object.hasOwn(evidence.entries, id)) return null
    return evidence.entries[id].map((lookup): FrequencyLookup => {
      const dictionary =
        lookup.dictionary === null ? null : evidence.dictionaries[lookup.dictionary]
      if ('unavailable' in lookup) {
        return { dictionary: dictionary ?? null, unavailable: lookup.unavailable }
      }
      if (!dictionary) throw new Error(`The evidence names no dictionary ${lookup.dictionary}`)
      return { dictionary, value: lookup.value }
    })
  }
}

function enabledDictionaries(
  ids: readonly string[],
  lookups: LookupsByEntry
): FrequencyDictionary[] | null {
  for (const id of ids) {
    const found = lookups(id)
    if (!found) continue
    const dictionaries = found.flatMap(({ dictionary }) => (dictionary ? [dictionary] : []))
    return dictionaries.length === found.length ? dictionaries : null
  }
  return null
}

export interface LearnerState {
  sort: string
  filter: string
  known: readonly string[]
  fromRadicals: boolean
}

export interface WordRow {
  id: string
  summary: string
  chips: FrequencyChip[]
  spoken: string
}

interface Choice {
  value: string
  title: string
  announcement: string
}

interface ResultsMenu {
  status: string
  sort: { chosen: string; summary: string; options: Choice[] }
  filter: { chosen: string; title: string; options: Choice[] }
}

export type LearnerResultsScreen =
  | { state: 'noResults'; query: string; title: string; message: string }
  | {
      state: 'results'
      query: string
      sections: ResultsSection[]
      menu: ResultsMenu | null
      forgetsSort: boolean
      examples: {
        title: string
        count: number
        highlightedEntry: string | null
        usesHighlightedEntryExamples: boolean
      } | null
      readingRefinement: { query: string; title: string; spoken: string } | null
      heading: string | null
      kanji: {
        character: string
        label: string
        summary: string
        entry: string | null
        spoken: string
      } | null
      rows: WordRow[]
      hiddenByFilter: string | null
      frequencyNotice: string | null
    }

export function wordRows(
  items: readonly Pick<ListedItem, 'id' | 'entrySummary' | 'matchedSummary'>[],
  lookups: LookupsByEntry,
  isKnown: (id: string) => boolean,
  place: (index: number) => string,
  leadingFamily: string | null = null
): WordRow[] {
  return items.map((item, index) => {
    const chips = frequencyLookupChips(lookups(item.id), leadingFamily)
    return {
      id: item.id,
      summary: item.matchedSummary ?? item.entrySummary,
      chips: chips.chips,
      spoken: [...(isKnown(item.id) ? ['Known'] : []), place(index), chips.spoken].join(', ')
    }
  })
}

function menu(
  sort: ResultSort,
  filter: ReturnType<typeof resultFilter>,
  dictionaries: readonly FrequencyDictionary[],
  ordered: readonly ListedItem[],
  isKnown: (id: string) => boolean
): ResultsMenu {
  const sorts: ResultSort[] = [
    relevanceSort,
    ...dictionaries.map(({ id }): ResultSort => ({ by: 'frequency', family: frequencyFamily(id) })),
    { by: 'knownWords' }
  ]
  const summary = sortSummary(sort, dictionaries)
  return {
    status: `Sorted by ${summary}${filter === 'all' ? '' : ' · 1 filter'}`,
    sort: {
      chosen: storedSort(sort),
      summary,
      options: sorts.map((option, index) => ({
        value: storedSort(option),
        title:
          option.by === 'frequency'
            ? frequencySortName(dictionaries[index - 1])
            : sortSummary(option, dictionaries),
        announcement: sortAnnouncement(option, dictionaries)
      }))
    },
    filter: {
      chosen: filter,
      title: filterTitles[filter],
      options: resultFilters.map(option => ({
        value: option,
        title: filterTitles[option],
        announcement: shownCountAnnouncement(filteredResults(ordered, option, isKnown).length)
      }))
    }
  }
}

export function learnerResultsScreen(
  rawQuery: string,
  results: ListedResults,
  exampleCount: number,
  learner: LearnerState,
  frequency: ReadFrequency
): LearnerResultsScreen {
  const layout = resultsLayout(rawQuery, results, exampleCount, learner.fromRadicals)
  if (layout.isEmpty) return { state: 'noResults', query: layout.query, ...noMatches }
  const known = new Set(learner.known)
  const isKnown = (id: string) => known.has(id)
  const frequencyEntries = [...new Set(layout.presented.map(item => item.id))]
  const lookups = evidenceLookups(frequency(frequencyEntries))
  const dictionaries = enabledDictionaries(frequencyEntries, lookups)
  const chosen = resultSort(learner.sort)
  const sort = appliedSort(chosen, dictionaries)
  const filter = resultFilter(learner.filter)
  const ordered = sortedResults(
    orderedByFrequency(layout.presented, lookups),
    sort,
    lookups,
    isKnown
  )
  const shown = filteredResults(ordered, filter, isKnown)
  const isRanked = layout.sections.includes('results')
  const count = shown.length + (layout.kanji ? 1 : 0)
  const rows = layout.isDiscovered
    ? wordRows(
        layout.presented,
        lookups,
        isKnown,
        index => `Discovered word ${index + 1} of ${layout.presented.length}`
      )
    : isRanked
      ? wordRows(
          shown,
          lookups,
          isKnown,
          index => `Result ${index + (layout.kanji ? 2 : 1)} of ${count}`,
          sort.by === 'frequency' ? sort.family : null
        )
      : []
  return {
    state: 'results',
    query: layout.query,
    sections: layout.sections,
    menu:
      !layout.isDiscovered && layout.presented.length > 0
        ? menu(sort, filter, dictionaries ?? [], ordered, isKnown)
        : null,
    forgetsSort: forgetsSort(chosen, dictionaries),
    examples: layout.examples && {
      ...layout.examples,
      highlightedEntry: layout.primary?.id ?? null,
      usesHighlightedEntryExamples: results.usesPrimaryEntryExamples
    },
    readingRefinement: layout.readingRefinement && {
      ...layout.readingRefinement,
      spoken: readingRefinementSpoken(layout.readingRefinement.query)
    },
    heading: layout.isDiscovered ? discoveredWordsHeading : null,
    kanji: layout.kanji && {
      character: layout.kanji.character,
      label: layout.kanji.label,
      summary: layout.kanji.summary,
      entry: layout.kanji.entryId,
      spoken: `Result 1 of ${count}, Kanji primary`
    },
    rows,
    hiddenByFilter:
      isRanked && shown.length === 0 && ordered.length > 0
        ? hiddenCountTitle(ordered.length - shown.length)
        : null,
    frequencyNotice: isRanked
      ? frequencyUnavailableNotice(
          frequencyEntries.flatMap(id => {
            const found = lookups(id)
            return found ? [found] : []
          })
        )
      : null
  }
}
