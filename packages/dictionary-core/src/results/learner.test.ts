import { describe, expect, test } from 'vitest'
import type { FrequencyDictionary } from '../detail/frequency'
import {
  evidenceLookups,
  type FrequencyEvidence,
  type LearnerState,
  learnerResultsScreen,
  wordRows
} from './learner'
import type { ListedItem, ListedResults } from './results'

function dictionary(
  id: string,
  name: string,
  kind: FrequencyDictionary['kind'] = 'rank'
): FrequencyDictionary {
  return {
    id,
    kind,
    name,
    domain: 'Fixture',
    description: 'Fixture',
    version: '1',
    source: 'Fixture',
    coveredSourceRows: 100_000
  }
}

const jlpt = dictionary('zenbu.jlpt.waller.levels', 'JLPT Levels', 'level')
const youTube = dictionary('zenbu.tubelex.youtube.ja.unidic-3.1', 'YouTube')
const anime = dictionary('zenbu.jiten.anime.ja.ordered-v2', 'Anime')

function item(headword: string, extra: Partial<ListedItem> = {}): ListedItem {
  return {
    id: headword,
    entSeq: 1,
    headword,
    reading: 'よみ',
    entrySummary: `${headword} summary`,
    matchedSummary: null,
    relevance: 0,
    fallbackOrder: 0,
    ...extra
  }
}

function listed(items: ListedItem[], extra: Partial<ListedResults> = {}): ListedResults {
  return {
    items: items.map((entry, fallbackOrder) => ({ ...entry, fallbackOrder })),
    presentation: 'ranked',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    leadingLexicalEntryCount: items.length,
    ...extra
  }
}

function evidence(
  dictionaries: FrequencyDictionary[],
  values: Record<string, (number | null)[]>
): FrequencyEvidence {
  return {
    dictionaries,
    entries: Object.fromEntries(
      Object.entries(values).map(([id, entry]) => [
        id,
        entry.map((value, index) => ({ dictionary: index, value }))
      ])
    )
  }
}

const learner = (state: Partial<LearnerState> = {}): LearnerState => ({
  frequency: null,
  sort: 'default',
  filter: 'all',
  known: [],
  fromRadicals: false,
  ...state
})

function screen(
  query: string,
  results: ListedResults,
  state: Partial<LearnerState> = {},
  exampleCount = 0
) {
  const built = learnerResultsScreen(query, results, exampleCount, learner(state))
  if (built.state !== 'results') throw new Error(`「${query}」 has no results screen`)
  return built
}

const three = listed([item('甲'), item('乙'), item('丙')])
const ranks = evidence([jlpt, youTube, anime], {
  甲: [3, 900, null],
  乙: [5, 20, 7],
  丙: [null, 40, 3]
})

describe('learnerResultsScreen', () => {
  test('says No Dictionary Matches for nothing found, unless the query is one kanji', () => {
    expect(learnerResultsScreen('qzxvkj', listed([]), 0, learner())).toEqual({
      state: 'noResults',
      query: 'qzxvkj'
    })
    expect(screen('㐂', listed([])).kanji).toEqual({
      character: '㐂',
      label: 'KANJI',
      summary: 'Kanji detail',
      entry: null,
      spoken: 'Result 1 of 1, Kanji primary'
    })
  })

  test('orders by the learner’s dictionaries, shows their chips, and says each row’s place', () => {
    const shown = screen('kou', three, { frequency: ranks, known: ['丙'] })
    expect(shown.rows.map(row => row.id)).toEqual(['乙', '丙', '甲'])
    expect(shown.rows.map(row => row.chips.map(chip => `${chip.source} ${chip.value}`))).toEqual([
      ['JLPT N5', 'YouTube 20', 'Anime 7'],
      ['YouTube 40', 'Anime 3'],
      ['JLPT N3', 'YouTube 900']
    ])
    expect(shown.rows.map(row => row.spoken)).toEqual([
      'Result 1 of 3, JLPT level N5, YouTube frequency rank 20, very common, Anime frequency rank 7, very common',
      'Known, Result 2 of 3, YouTube frequency rank 40, very common, Anime frequency rank 3, very common',
      'Result 3 of 3, JLPT level N3, YouTube frequency rank 900, very common'
    ])
    expect(shown.frequencyNotice).toBeNull()
    expect(shown.frequencyEntries).toEqual(['甲', '乙', '丙'])
  })

  test('shows the retrieval order and no chips while the dictionaries load', () => {
    const shown = screen('kou', three, { sort: 'frequency|zenbu.jiten.anime' })
    expect(shown.rows.map(row => [row.id, row.chips, row.spoken])).toEqual([
      ['甲', [], 'Result 1 of 3, Frequency rank loading'],
      ['乙', [], 'Result 2 of 3, Frequency rank loading'],
      ['丙', [], 'Result 3 of 3, Frequency rank loading']
    ])
    expect(shown.forgetsSort).toBe(false)
    expect(shown.menu?.sort).toMatchObject({ chosen: 'default', summary: 'Default' })
    expect(shown.menu?.sort.options.map(option => option.title)).toEqual(['Default', 'Known Words'])
  })

  test('offers Default, each enabled dictionary, and Known Words, and sorts by the one chosen', () => {
    const shown = screen('kou', three, { frequency: ranks, sort: 'frequency|zenbu.jiten.anime' })
    expect(shown.menu).toEqual({
      status: 'Sorted by Anime',
      sort: {
        chosen: 'frequency|zenbu.jiten.anime',
        summary: 'Anime',
        options: [
          { value: 'default', title: 'Default', announcement: 'Sorted by default order' },
          {
            value: 'frequency|zenbu.jlpt.waller',
            title: 'JLPT',
            announcement: 'Sorted by JLPT'
          },
          {
            value: 'frequency|zenbu.tubelex.youtube',
            title: 'YouTube',
            announcement: 'Sorted by YouTube'
          },
          {
            value: 'frequency|zenbu.jiten.anime',
            title: 'Anime',
            announcement: 'Sorted by Anime'
          },
          { value: 'known-words', title: 'Known Words', announcement: 'Sorted by known words' }
        ]
      },
      filter: {
        chosen: 'all',
        title: 'All',
        options: [
          { value: 'all', title: 'All', announcement: '3 words shown' },
          { value: 'known', title: 'Known', announcement: '0 words shown' },
          { value: 'unknown', title: 'Unknown', announcement: '3 words shown' }
        ]
      }
    })
    expect(shown.rows.map(row => row.id)).toEqual(['丙', '乙', '甲'])
    expect(shown.rows[2].chips.map(chip => `${chip.source} ${chip.value}`)).toEqual([
      'Anime —',
      'JLPT N3',
      'YouTube 900'
    ])
  })

  test('forgets a sort by a dictionary that is no longer enabled, and shows Default', () => {
    const shown = screen('kou', three, {
      frequency: evidence([jlpt], { 甲: [3], 乙: [5], 丙: [null] }),
      sort: 'frequency|zenbu.jiten.anime'
    })
    expect(shown.forgetsSort).toBe(true)
    expect(shown.menu?.status).toBe('Sorted by Default')
    expect(shown.rows.map(row => row.id)).toEqual(['乙', '甲', '丙'])
  })

  test('filters to known or unknown words, counts the filter, and says when it hides every word', () => {
    const unknown = screen('kou', three, { filter: 'unknown', known: ['乙'], sort: 'known-words' })
    expect(unknown.rows.map(row => row.id)).toEqual(['甲', '丙'])
    expect(unknown.rows.map(row => row.spoken.split(',')[0])).toEqual([
      'Result 1 of 2',
      'Result 2 of 2'
    ])
    expect(unknown.menu?.status).toBe('Sorted by Known Words · 1 filter')
    expect(unknown.menu?.filter).toMatchObject({ chosen: 'unknown', title: 'Unknown' })
    expect(unknown.menu?.filter.options.map(option => option.announcement)).toEqual([
      '3 words shown',
      '1 word shown',
      '2 words shown'
    ])
    expect(unknown.hiddenByFilter).toBeNull()

    const known = screen('kou', three, { filter: 'known' })
    expect(known.rows).toEqual([])
    expect(known.hiddenByFilter).toBe('3 words hidden by filter')
    expect(known.menu).not.toBeNull()
  })

  test('leads a one-kanji query with the kanji row, which counts as the first result', () => {
    const shown = screen('要', listed([item('要点'), item('要')]), { filter: 'unknown' })
    expect(shown.kanji).toEqual({
      character: '要',
      label: 'KANJI',
      summary: '要 summary',
      entry: '要',
      spoken: 'Result 1 of 3, Kanji primary'
    })
    expect(shown.rows.map(row => row.spoken.split(',')[0])).toEqual([
      'Result 2 of 3',
      'Result 3 of 3'
    ])
  })

  test('lists Discovered Words in their order, twelve at most, without Sort By or a kanji row', () => {
    const many = Array.from({ length: 14 }, (_, index) => item(`語${index}`))
    const shown = screen('猫', listed(many, { presentation: 'discoveredWords' }), {
      filter: 'known',
      sort: 'known-words',
      known: ['語3']
    })
    expect(shown.heading).toBe('Discovered Words')
    expect(shown.menu).toBeNull()
    expect(shown.kanji).toBeNull()
    expect(shown.rows).toHaveLength(12)
    expect(shown.rows[3].spoken).toBe('Known, Discovered word 4 of 12, Frequency rank loading')
    expect(shown.hiddenByFilter).toBeNull()
    expect(shown.frequencyEntries).toHaveLength(12)
  })

  test('lists only the leading entries of a one-character query from the radical panel', () => {
    const found = listed([item('一'), item('二'), item('三')], { leadingLexicalEntryCount: 1 })
    const shown = screen('一', found, { fromRadicals: true })
    expect(shown.rows.map(row => row.id)).toEqual(['一'])
    expect(shown.frequencyEntries).toEqual(['一'])
    expect(screen('一', found).rows).toHaveLength(3)
    expect(screen('一二', found, { fromRadicals: true }).rows).toHaveLength(3)
  })

  test('offers the examples with the entry they highlight, and the Japanese reading of a romaji query', () => {
    const shown = screen(
      'iru',
      listed([item('入る'), item('iru')], {
        usesPrimaryEntryExamples: true,
        readingRefinement: 'いる'
      }),
      {},
      51
    )
    expect(shown.examples).toEqual({
      title: 'View 50+ Example Sentences',
      count: 51,
      highlightedEntry: 'iru',
      usesHighlightedEntryExamples: true
    })
    expect(shown.readingRefinement).toEqual({
      query: 'いる',
      title: 'Search for「いる」',
      spoken: 'Search for Japanese reading いる'
    })
    expect(screen('iru', listed([item('入る')]), {}, 1).examples).toMatchObject({
      title: 'View 1 Example Sentence',
      highlightedEntry: '入る',
      usesHighlightedEntryExamples: false
    })
  })

  test('shows the meaning an English query matched', () => {
    const shown = screen('eat', listed([item('食べる', { matchedSummary: 'to eat' })]))
    expect(shown.rows[0].summary).toBe('to eat')
  })

  test('says which dictionaries could not be read, and still offers the others', () => {
    const partly: FrequencyEvidence = {
      dictionaries: [jlpt, youTube],
      entries: {
        甲: [
          { dictionary: 0, unavailable: 'Pack unavailable' },
          { dictionary: 1, value: 20 }
        ],
        乙: [
          { dictionary: 0, unavailable: 'Pack unavailable' },
          { dictionary: 1, value: 10 }
        ]
      }
    }
    const shown = screen('kou', listed([item('甲'), item('乙')]), { frequency: partly })
    expect(shown.frequencyNotice).toBe(
      'JLPT unavailable. Search is ordered by the other enabled dictionaries.'
    )
    expect(shown.rows.map(row => row.id)).toEqual(['乙', '甲'])
    expect(shown.rows[0].chips.map(chip => `${chip.source} ${chip.value}`)).toEqual([
      'JLPT —',
      'YouTube 10'
    ])
    expect(shown.menu?.sort.options.map(option => option.title)).toEqual([
      'Default',
      'JLPT',
      'YouTube',
      'Known Words'
    ])
  })

  test('keeps the order and the stored sort when no dictionary could be asked at all', () => {
    const unreadable: FrequencyEvidence = {
      dictionaries: [],
      entries: {
        甲: [{ dictionary: null, unavailable: 'Frequency data unavailable' }],
        乙: [{ dictionary: null, unavailable: 'Frequency data unavailable' }]
      }
    }
    const shown = screen('kou', listed([item('甲'), item('乙')]), {
      frequency: unreadable,
      sort: 'frequency|zenbu.jiten.anime'
    })
    expect(shown.frequencyNotice).toBe(
      'Frequency ordering unavailable. Showing dictionary relevance order. Frequency data unavailable'
    )
    expect(shown.forgetsSort).toBe(false)
    expect(shown.rows.map(row => row.spoken)).toEqual([
      'Result 1 of 2, Frequency rank unavailable',
      'Result 2 of 2, Frequency rank unavailable'
    ])
  })

  test('with no dictionary enabled, says so on each row and forgets a dictionary sort', () => {
    const none: FrequencyEvidence = { dictionaries: [], entries: { 甲: [], 乙: [] } }
    const shown = screen('kou', listed([item('甲'), item('乙')]), {
      frequency: none,
      sort: 'frequency|zenbu.jiten.anime'
    })
    expect(shown.forgetsSort).toBe(true)
    expect(shown.rows[0].spoken).toBe('Result 1 of 2, No frequency dictionary enabled')
  })
})

describe('evidenceLookups', () => {
  test('refuses evidence that names a dictionary it does not list', () => {
    const broken: FrequencyEvidence = {
      dictionaries: [],
      entries: { 甲: [{ dictionary: 2, value: 1 }] }
    }
    expect(() => evidenceLookups(broken)('甲')).toThrow('names no dictionary 2')
    expect(evidenceLookups(broken)('constructor')).toBeNull()
  })
})

describe('wordRows', () => {
  test('lists a word sheet’s candidates with their chips and places', () => {
    expect(
      wordRows(
        [item('甲'), item('乙')],
        evidenceLookups(evidence([youTube], { 甲: [20], 乙: [null] })),
        id => id === '乙',
        index => `Result ${index + 1} of 2`
      )
    ).toEqual([
      {
        id: '甲',
        summary: '甲 summary',
        chips: [
          {
            pack: youTube.id,
            source: 'YouTube',
            value: '20',
            tier: 'veryCommon',
            spokenTier: 'very common'
          }
        ],
        spoken: 'Result 1 of 2, YouTube frequency rank 20, very common'
      },
      {
        id: '乙',
        summary: '乙 summary',
        chips: [{ pack: youTube.id, source: 'YouTube', value: '—', tier: null, spokenTier: null }],
        spoken: 'Known, Result 2 of 2, YouTube has no rank for this entry'
      }
    ])
  })
})
