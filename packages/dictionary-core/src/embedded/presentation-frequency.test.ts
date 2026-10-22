import { describe, expect, test } from 'vitest'
import type { LearnerResultsScreen, WordRow } from '../results/learner'
import { ask, type FakeFrequencyList, fakeDictionary, fakeFrequency } from './fake-host'
import type { EmbeddedHost } from './host'
import type { EmbeddedWordPage } from './presentation'
import { eat, host } from './presentation-fixture'

describe('the embedded presentation engine and the learner’s frequency lists', () => {
  const jlpt = fakeDictionary('zenbu.jlpt.waller.levels', 'JLPT Levels', 'level')
  const youTube = fakeDictionary('zenbu.tubelex.youtube.ja.unidic-3.1', 'YouTube')
  const levels: FakeFrequencyList = { dictionary: jlpt, values: { e1: 5 } }
  const ranks: FakeFrequencyList = { dictionary: youTube, values: { e1: 1_234, e2: 40 } }
  const listing = (...lists: FakeFrequencyList[]) => ({ ...host, ...fakeFrequency(lists) })
  const bothLists = () => listing(levels, ranks)
  const notReady: EmbeddedHost = { ...host, frequencyLists: () => null }
  const nothingReadable: EmbeddedHost = {
    ...host,
    frequencyLists: () => ({ unavailable: 'Bundled frequency data unavailable' })
  }
  const unopened = () => listing({ dictionary: jlpt, unavailable: 'Pack unavailable' }, ranks)
  const unreadable = () => listing({ dictionary: jlpt }, ranks)

  const page = async (asked: EmbeddedHost) =>
    (await ask(asked, 'wordPage', JSON.stringify(eat))) as EmbeddedWordPage

  test('a word page holds a row for each of the learner’s lists, in their order, with its details', async () => {
    expect((await page(bothLists())).frequency).toEqual([
      {
        pack: jlpt.id,
        source: 'JLPT',
        value: 'N5',
        tier: 'veryCommon',
        spokenTier: null,
        label: 'JLPT level N5',
        details: {
          pack: {
            name: 'JLPT Levels',
            domain: 'JLPT Levels domain',
            description: 'Fixture',
            version: '2025.1',
            source: 'JLPT Levels source'
          },
          section: 'Level',
          rows: [{ label: 'JLPT Level', value: 'N5' }],
          explanation: null
        }
      },
      {
        pack: youTube.id,
        source: 'YouTube',
        value: '1,234',
        tier: 'veryCommon',
        spokenTier: 'very common',
        label: 'YouTube frequency rank 1234, very common',
        details: {
          pack: {
            name: 'YouTube',
            domain: 'YouTube domain',
            description: 'Fixture',
            version: '2025.1',
            source: 'YouTube source'
          },
          section: 'Frequency',
          rows: [
            { label: 'Rank', value: '#1,234' },
            { label: 'Percentile', value: 'Top 1.23%' }
          ],
          explanation: null
        }
      }
    ])
    const reordered = await page(listing(ranks, levels))
    expect(reordered.frequency.map(row => row.source)).toEqual(['YouTube', 'JLPT'])
  })

  test('a word page reads its one entry from each list, once', async () => {
    const asked = bothLists()
    await page(asked)
    expect(asked.read).toEqual([
      [jlpt.id, 'e1'],
      [youTube.id, 'e1']
    ])
  })

  test('a word page has no frequency rows without lists: none enabled, a host without any, or not ready yet', async () => {
    expect((await page(listing())).frequency).toEqual([])
    expect((await page(host)).frequency).toEqual([])
    expect((await page(notReady)).frequency).toEqual([])
    expect((await page(notReady)).shareText).toBe('食べる【たべる】\n1. to eat\n2. to live on')
  })

  test.each([
    ['whose file could not be opened', unopened, 'Pack unavailable'],
    ['whose read fails', unreadable, 'Frequency data unavailable']
  ])('a word page says so for a list %s, and still shows the others', async (_, asked, reason) => {
    const rows = (await page(asked())).frequency
    expect(rows.map(row => [row.source, row.value, row.label])).toEqual([
      ['JLPT', 'Unavailable', 'JLPT rank unavailable'],
      ['YouTube', '1,234', 'YouTube frequency rank 1234, very common']
    ])
    expect(rows[0].details).toMatchObject({
      pack: { name: 'JLPT Levels' },
      rows: [],
      explanation: reason
    })
  })

  test('a word page shows one row that says so when no frequency data can be read at all', async () => {
    expect((await page(nothingReadable)).frequency).toEqual([
      {
        pack: null,
        source: 'Frequency',
        value: 'Unavailable',
        tier: null,
        spokenTier: null,
        label: 'Frequency rank unavailable',
        details: {
          pack: null,
          section: 'Frequency',
          rows: [],
          explanation: 'Bundled frequency data unavailable'
        }
      }
    ])
  })

  const candidates = {
    entries: [
      { id: 'e1', summary: 'to eat' },
      { id: 'e2', summary: 'to drink' }
    ],
    known: ['e2']
  }
  const sheet = async (asked: EmbeddedHost) =>
    (await ask(asked, 'wordRows', JSON.stringify(candidates))) as WordRow[]

  test('a word sheet’s candidates are result rows with the chips of the learner’s lists', async () => {
    const asked = bothLists()
    expect(await sheet(asked)).toEqual([
      {
        id: 'e1',
        summary: 'to eat',
        chips: [
          { pack: jlpt.id, source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null },
          {
            pack: youTube.id,
            source: 'YouTube',
            value: '1,234',
            tier: 'veryCommon',
            spokenTier: 'very common'
          }
        ],
        spoken: 'Result 1 of 2, JLPT level N5, YouTube frequency rank 1234, very common'
      },
      {
        id: 'e2',
        summary: 'to drink',
        chips: [
          {
            pack: youTube.id,
            source: 'YouTube',
            value: '40',
            tier: 'veryCommon',
            spokenTier: 'very common'
          }
        ],
        spoken: 'Known, Result 2 of 2, YouTube frequency rank 40, very common'
      }
    ])
    expect(asked.read).toEqual([
      [jlpt.id, 'e1', 'e2'],
      [youTube.id, 'e1', 'e2']
    ])
  })

  test.each([
    ['with no list enabled', () => listing(), 'No frequency dictionary enabled'],
    ['from a host without lists', () => host, 'No frequency dictionary enabled'],
    ['before the lists are ready', () => notReady, 'Frequency rank loading']
  ])('a word sheet’s candidates have no chips %s, and say so', async (_, asked, spoken) => {
    expect((await sheet(asked())).map(row => [row.id, row.chips, row.spoken])).toEqual([
      ['e1', [], `Result 1 of 2, ${spoken}`],
      ['e2', [], `Known, Result 2 of 2, ${spoken}`]
    ])
  })

  test('a word sheet’s candidates say so when no frequency data can be read at all', async () => {
    const unavailable = {
      pack: null,
      source: 'Frequency',
      value: '—',
      tier: null,
      spokenTier: null
    }
    expect((await sheet(nothingReadable)).map(row => [row.chips, row.spoken])).toEqual([
      [[unavailable], 'Result 1 of 2, Frequency rank unavailable'],
      [[unavailable], 'Known, Result 2 of 2, Frequency rank unavailable']
    ])
  })

  test('a word sheet’s candidates name a list that could not be read, beside the others’ chips', async () => {
    const rows = await sheet(unopened())
    expect(rows.map(row => row.chips.map(chip => `${chip.source} ${chip.value}`))).toEqual([
      ['JLPT —', 'YouTube 1,234'],
      ['JLPT —', 'YouTube 40']
    ])
    expect(rows[0].spoken).toBe(
      'Result 1 of 2, JLPT rank unavailable, YouTube frequency rank 1234, very common'
    )
  })

  const listedItem = (id: string, headword: string, reading: string, fallbackOrder: number) => ({
    id,
    entSeq: fallbackOrder + 1,
    headword,
    reading,
    entrySummary: `${headword} summary`,
    matchedSummary: null,
    relevance: 0,
    fallbackOrder,
    match: 'source=0 japanese writtenExact'
  })
  const results = {
    items: [
      listedItem('e3', '呑む', 'のむ', 0),
      listedItem('e2', '飲む', 'のむ', 1),
      listedItem('e1', '食べる', 'たべる', 2)
    ],
    presentation: 'ranked',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    leadingLexicalEntryCount: 3,
    resolution: 'direct',
    primaryEntry: 'e3'
  }
  const screen = async (asked: EmbeddedHost, learner: { sort?: string; known?: string[] } = {}) => {
    const built = (await ask(
      asked,
      'resultsScreen',
      JSON.stringify({
        query: 'のむ',
        results,
        exampleCount: 3,
        learner: { sort: 'default', filter: 'all', known: [], pickedKanji: false, ...learner }
      })
    )) as LearnerResultsScreen
    if (built.state !== 'results') throw new Error('のむ has no results screen')
    return built
  }
  const spoken = (built: Awaited<ReturnType<typeof screen>>) => built.rows.map(row => row.spoken)

  test('the results screen is finished in one call: ordered by the learner’s lists, with their chips and Sort By', async () => {
    const asked = bothLists()
    const built = await screen(asked)
    expect(built).toMatchObject({
      query: 'のむ',
      examples: { title: 'View 3 Example Sentences', highlightedEntry: 'e3' },
      menu: { status: 'Sorted by Default' },
      forgetsSort: false,
      frequencyNotice: null
    })
    expect(
      built.rows.map(row => [row.id, row.chips.map(chip => `${chip.source} ${chip.value}`)])
    ).toEqual([
      ['e1', ['JLPT N5', 'YouTube 1,234']],
      ['e2', ['YouTube 40']],
      ['e3', []]
    ])
    expect(built.menu?.sort.options.map(option => option.title)).toEqual([
      'Default',
      'JLPT',
      'YouTube',
      'Known Words'
    ])
    expect(asked.read).toEqual([
      [jlpt.id, 'e3', 'e2', 'e1'],
      [youTube.id, 'e3', 'e2', 'e1']
    ])
    expect(built).not.toHaveProperty('frequencyEntries')
  })

  test('the results screen sorts by the list the learner chose, and reads the lists again each time it is asked', async () => {
    const asked = bothLists()
    const sorted = await screen(asked, { sort: 'frequency|zenbu.tubelex.youtube' })
    expect(sorted.menu?.status).toBe('Sorted by YouTube')
    expect(sorted.rows.map(row => row.id)).toEqual(['e2', 'e1', 'e3'])
    expect(sorted.rows[1].chips.map(chip => chip.source)).toEqual(['YouTube', 'JLPT'])
    await screen(asked, { known: ['e3'] })
    expect(asked.read).toHaveLength(4)
  })

  test('the results screen follows the lists’ order', async () => {
    const reordered = await screen(listing(ranks, levels))
    expect(reordered.rows.map(row => row.id)).toEqual(['e2', 'e1', 'e3'])
    expect(reordered.rows[1].chips.map(chip => chip.source)).toEqual(['YouTube', 'JLPT'])
    expect(reordered.rows[2].chips.map(chip => `${chip.source} ${chip.value}`)).toEqual([
      'YouTube —'
    ])
    expect(reordered.menu?.sort.options.map(option => option.title)).toEqual([
      'Default',
      'YouTube',
      'JLPT',
      'Known Words'
    ])
  })

  test('before the lists are ready, the results screen keeps the retrieval order, shows no chips, and keeps the stored sort', async () => {
    const built = await screen(notReady, { sort: 'frequency|zenbu.tubelex.youtube' })
    expect(built.rows.map(row => [row.id, row.chips])).toEqual([
      ['e3', []],
      ['e2', []],
      ['e1', []]
    ])
    expect(spoken(built)[0]).toBe('Result 1 of 3, Frequency rank loading')
    expect(built.forgetsSort).toBe(false)
    expect(built.menu?.sort.options.map(option => option.title)).toEqual(['Default', 'Known Words'])
    expect(built.frequencyNotice).toBeNull()
  })

  test.each([
    ['with no list enabled', () => listing()],
    ['from a host without lists', () => host]
  ])('the results screen %s keeps the retrieval order, says so on each row, and forgets a list’s sort', async (_, asked) => {
    const built = await screen(asked(), { sort: 'frequency|zenbu.tubelex.youtube' })
    expect(built.rows.map(row => row.id)).toEqual(['e3', 'e2', 'e1'])
    expect(spoken(built)[0]).toBe('Result 1 of 3, No frequency dictionary enabled')
    expect(built.forgetsSort).toBe(true)
    expect(built.frequencyNotice).toBeNull()
  })

  test.each([
    ['whose file could not be opened', unopened],
    ['whose read fails', unreadable]
  ])('the results screen names a list %s, and the others still order it', async (_, asked) => {
    const built = await screen(asked())
    expect(built.frequencyNotice).toBe(
      'JLPT unavailable. Search is ordered by the other enabled dictionaries.'
    )
    expect(
      built.rows.map(row => [row.id, row.chips.map(chip => `${chip.source} ${chip.value}`)])
    ).toEqual([
      ['e2', ['JLPT —', 'YouTube 40']],
      ['e1', ['JLPT —', 'YouTube 1,234']],
      ['e3', ['JLPT —']]
    ])
    expect(built.menu?.sort.options.map(option => option.title)).toEqual([
      'Default',
      'JLPT',
      'YouTube',
      'Known Words'
    ])
  })

  test('the results screen says why when no frequency data can be read at all, and keeps the stored sort', async () => {
    const built = await screen(nothingReadable, { sort: 'frequency|zenbu.tubelex.youtube' })
    expect(built.frequencyNotice).toBe(
      'Frequency ordering unavailable. Showing dictionary relevance order. Bundled frequency data unavailable'
    )
    expect(built.rows.map(row => row.id)).toEqual(['e3', 'e2', 'e1'])
    expect(spoken(built)[2]).toBe('Result 3 of 3, Frequency rank unavailable')
    expect(built.forgetsSort).toBe(false)
  })
})
