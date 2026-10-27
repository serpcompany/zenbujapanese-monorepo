import { type FrequencyTier, tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import { readSuite } from './support'

interface SuiteChip {
  pack?: string
  name: string
  text: string
  tier?: string
}

export interface SuiteRow {
  languageReferenceID: string
  entSeq: string[]
  headword: string
  reading: string
  summary: string
  chips: SuiteChip[]
  match: string
  retrievalOrder: number
}

export interface SuiteCase {
  query: string
  covers?: string
  resolution?: string
  presentation?: string
  state?: string
  sections?: string[]
  examples?: { title: string; count: number; primaryEntry?: string }
  readingRefinement?: { title: string; query: string }
  heading?: string
  kanji?: { character: string; label: string; summary: string; entry?: string }
  results?: SuiteRow[]
  voiceOverCount?: number
  frequencyNotice?: string
}

export interface ResultsSuite {
  artifacts: { name: string; sha256: string }[]
  frequencyPacks: string[]
  textAnalysis: 'reduced' | 'full'
  cases: SuiteCase[]
}

export const resultsSuite = readSuite<ResultsSuite>('search-results')

export const sentenceResultsSuite = readSuite<ResultsSuite>('sentence-results')

export function suiteChip(
  chip: { source: string; value: string; tier: FrequencyTier | null },
  pack: string | null | undefined
): SuiteChip {
  return {
    ...(pack ? { pack } : {}),
    name: chip.source,
    text: chip.value,
    ...(chip.tier ? { tier: tierLabels[chip.tier] } : {})
  }
}

export function suiteRows<Row extends { id: string }, Item>(
  rows: readonly Row[],
  items: ReadonlyMap<string, Item>,
  shown: (row: Row, item: Item) => Omit<SuiteRow, 'languageReferenceID'>
): SuiteRow[] {
  return rows.map(row => {
    const item = items.get(row.id)
    if (!item) throw new Error(`No search result for row ${row.id}`)
    return { languageReferenceID: row.id, ...shown(row, item) }
  })
}

export const defaultFrequencyPackIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

export interface ShownScreen {
  sections: string[]
  examples: { title: string; count: number; primaryEntry: string | null } | null
  readingRefinement: { title: string; query: string } | null
  heading: string | null
  kanji: { character: string; label: string; summary: string; entry: string | null } | null
  rows: SuiteRow[]
  resultCount: number
}

export function caseAsShown(
  found: { query: string; resolution: string; presentation: string },
  screen: ShownScreen | null
): SuiteCase {
  if (!screen) return { ...found, state: 'noResults' }
  const { examples, readingRefinement, heading, kanji } = screen
  return {
    ...found,
    state: 'results',
    sections: screen.sections,
    ...(examples
      ? {
          examples: {
            count: examples.count,
            ...(examples.primaryEntry ? { primaryEntry: examples.primaryEntry } : {}),
            title: examples.title
          }
        }
      : {}),
    ...(readingRefinement
      ? { readingRefinement: { title: readingRefinement.title, query: readingRefinement.query } }
      : {}),
    ...(heading ? { heading } : {}),
    ...(kanji
      ? {
          kanji: {
            character: kanji.character,
            label: kanji.label,
            summary: kanji.summary,
            ...(kanji.entry ? { entry: kanji.entry } : {})
          }
        }
      : {}),
    results: screen.rows,
    voiceOverCount: screen.resultCount
  }
}

const withFirstProvenanceOnly = (row: SuiteRow): SuiteRow => ({
  ...row,
  entSeq: row.entSeq.slice(0, 1)
})

export function recordedCaseAsTheCoreReports(expected: SuiteCase): SuiteCase {
  const { covers: _covers, ...rest } = expected
  return {
    ...rest,
    ...(rest.results ? { results: rest.results.map(withFirstProvenanceOnly) } : {})
  }
}

export const describeRows = (rows: SuiteRow[] = []) =>
  rows
    .slice(0, 12)
    .map(row => `${row.headword}（${row.reading}）`)
    .join(', ')
