import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { bundledFrequency } from '@zenbu/dictionary-core/artifact/frequency'
import type { FrequencyRow } from '@zenbu/dictionary-core/detail/rows'
import type { EmbeddedSearchResults } from '@zenbu/dictionary-core/embedded/lookup'
import type { LearnerResultsScreen, LearnerState } from '@zenbu/dictionary-core/results/learner'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Embedded, embedded } from './embedded-support'
import {
  caseAsShown,
  describeRows,
  type ResultsSuite,
  recordedCaseAsTheCoreReports,
  resultsSuite,
  type ShownScreen,
  sentenceResultsSuite,
  suiteChip,
  suiteRows
} from './results-suite'
import {
  artifactAvailable,
  artifactDatabase,
  requirePinnedArtifacts,
  sudachiAnalyzer,
  sudachiAvailable
} from './support'

type Screen = Extract<LearnerResultsScreen, { state: 'results' }>

function shown(screen: Screen, results: EmbeddedSearchResults): ShownScreen {
  const items = new Map(results.items.map(item => [item.id, item]))
  return {
    sections: screen.sections,
    examples: screen.examples && {
      title: screen.examples.title,
      count: screen.examples.count,
      primaryEntry: screen.examples.usesHighlightedEntryExamples
        ? screen.examples.highlightedEntry
        : null
    },
    readingRefinement: screen.readingRefinement,
    heading: screen.heading,
    kanji: screen.kanji,
    rows: suiteRows(screen.rows, items, (row, item) => ({
      entSeq: [String(item.entSeq)],
      headword: item.headword,
      reading: item.reading,
      summary: row.summary,
      chips: row.chips.map(chip => suiteChip(chip, chip.pack)),
      match: item.match,
      retrievalOrder: item.fallbackOrder
    })),
    resultCount: screen.rows.length + (screen.kanji ? 1 : 0)
  }
}

async function screen(
  app: Embedded,
  query: string,
  learner: Partial<LearnerState> = {}
): Promise<{ results: EmbeddedSearchResults; screen: LearnerResultsScreen }> {
  const results = await app.lookup<EmbeddedSearchResults>('search', query)
  await app.text<number>('exampleCount', query)
  const exampleCount = await app.text<number>('resultsExampleCount', {
    query,
    primaryEntry: results.primaryEntry,
    usesPrimaryEntryExamples: results.usesPrimaryEntryExamples
  })
  const state = { sort: 'default', filter: 'all', known: [], pickedKanji: false }
  return {
    results,
    screen: await app.presentation<LearnerResultsScreen>('resultsScreen', {
      query,
      results,
      exampleCount,
      learner: { ...state, ...learner }
    })
  }
}

function showsTheScreens(suite: ResultsSuite, app: () => Embedded) {
  test.each(suite.cases)('shows 「$query」 as the suite records', async expected => {
    const found = await screen(app(), expected.query)
    const actual = caseAsShown(
      {
        query: expected.query,
        resolution: found.results.resolution,
        presentation: found.results.presentation
      },
      found.screen.state === 'results' ? shown(found.screen, found.results) : null
    )
    const wanted = recordedCaseAsTheCoreReports(expected)
    expect(
      actual,
      `「${expected.query}」: expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
    ).toEqual(wanted)
    if (found.screen.state === 'results') expect(found.screen.frequencyNotice).toBeNull()
  })
}

describe.runIf(artifactAvailable)('the app’s results screen on the artifact', () => {
  let app: Embedded
  let db: ArtifactDatabase

  beforeAll(async () => {
    requirePinnedArtifacts(resultsSuite.artifacts)
    app = await embedded()
    db = await artifactDatabase()
  })

  showsTheScreens(resultsSuite, () => app)

  test('sorts 「iru」 by YouTube rank, by JLPT level, and by the words the learner knows', async () => {
    const byDefault = await screen(app, 'iru')
    if (byDefault.screen.state !== 'results') throw new Error('「iru」 has no results')
    const ids = byDefault.screen.rows.map(row => row.id)
    const frequency = bundledFrequency(db, ids)
    const value = (id: string, pack: FrequencyRow['pack']) => {
      const row = frequency.get(id)?.find(listed => listed.pack === pack)
      return !row ? null : row.pack === 'jlpt' ? row.level : row.rank
    }
    const sorted = async (learner: Partial<LearnerState>) => {
      const found = (await screen(app, 'iru', learner)).screen
      if (found.state !== 'results') throw new Error('「iru」 has no results')
      return found
    }

    const youTube = await sorted({ sort: 'frequency|zenbu.tubelex.youtube' })
    expect(youTube.menu?.status).toBe('Sorted by YouTube')
    const ranks = youTube.rows.map(row => value(row.id, 'tubelex'))
    const ranked = ranks.filter(rank => rank !== null)
    expect(ranked.length).toBeGreaterThan(3)
    expect(ranked).toEqual([...ranked].sort((left, right) => left - right))
    expect(ranks.slice(ranked.length).every(rank => rank === null)).toBe(true)
    expect(youTube.rows[0].chips[0].source).toBe('YouTube')

    const jlpt = await sorted({ sort: 'frequency|zenbu.jlpt.waller' })
    const levels = jlpt.rows.map(row => value(row.id, 'jlpt')).filter(level => level !== null)
    expect(levels.length).toBeGreaterThan(1)
    expect(levels).toEqual([...levels].sort((left, right) => right - left))

    const known = [ids[ids.length - 1], ids[2]]
    const knownFirst = await sorted({ sort: 'known-words', known })
    expect(knownFirst.rows.slice(0, 2).map(row => row.id)).toEqual([ids[2], ids[ids.length - 1]])
    expect(knownFirst.rows.slice(2).map(row => row.id)).toEqual(
      ids.filter(id => !known.includes(id))
    )
    expect(knownFirst.rows[0].spoken.startsWith('Known, Result 1 of')).toBe(true)

    const onlyKnown = await sorted({ filter: 'known', known })
    expect(onlyKnown.rows.map(row => row.id)).toEqual([ids[2], ids[ids.length - 1]])
    expect(onlyKnown.menu?.status).toBe('Sorted by Default · 1 filter')
  })
})

describe.runIf(artifactAvailable && sudachiAvailable)(
  'the app’s results screen for a sentence, with Sudachi',
  () => {
    let app: Embedded

    beforeAll(async () => {
      requirePinnedArtifacts(sentenceResultsSuite.artifacts)
      app = await embedded(sudachiAnalyzer())
    })

    showsTheScreens(sentenceResultsSuite, () => app)
  }
)
