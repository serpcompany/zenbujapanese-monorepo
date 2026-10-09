import { describe, expect, test, vi } from 'vitest'
import type { FrequencyRow } from '../detail/rows'
import type { Rank } from '../search/rank'
import type { SearchDatabase, SearchResultItem, SearchResults } from '../search/search'
import { loadFrequency, orderedItems, searchResultsScreen } from './results'

const readingExact: Rank = {
  kind: 'japanese',
  relation: 1,
  priorityProfile: { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null },
  senseBreadthRank: 0,
  headwordLength: 2,
  semanticFingerprint: ''
}

const strongGloss: Rank = {
  kind: 'english',
  lane: 0,
  corroborationRank: 1,
  romajiSpecificityRank: 0,
  senseOrder: 0,
  priorityPresenceRank: 0,
  priorityProfile: { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null },
  glossOrder: 0,
  headwordLength: 2,
  semanticFingerprint: ''
}

let nextId = 0
function item(
  headword: string,
  options: { rank?: Rank; sourceOrder?: number; matchedSummary?: string; id?: string } = {}
): SearchResultItem {
  const id = options.id ?? (nextId++).toString(16).padStart(32, '0')
  return {
    entry: {
      id,
      sourceRecordId: 1000 + nextId,
      headword,
      reading: 'いる',
      summary: `${headword} summary`,
      partsOfSpeech: []
    },
    sourceOrder: options.sourceOrder ?? 0,
    matchRank: options.rank ?? readingExact,
    fallbackOrder: 0,
    matchedSummary: options.matchedSummary ?? null
  }
}

function results(items: SearchResultItem[], extra: Partial<SearchResults> = {}): SearchResults {
  return {
    items: items.map((entry, fallbackOrder) => ({ ...entry, fallbackOrder })),
    leadingLexicalEntryCount: items.length,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: true,
    ...extra
  }
}

const jlpt = (level: number): FrequencyRow => ({ pack: 'jlpt', level })
const youtube = (rank: number): FrequencyRow => ({ pack: 'tubelex', rank })

function frequencyOf(entries: [SearchResultItem, FrequencyRow[]][]) {
  return new Map(entries.map(([entry, rows]) => [entry.entry.id, rows]))
}

const headwords = (ordered: { entry: { headword: string } }[]) =>
  ordered.map(result => result.entry.headword)

describe('orderedItems (SearchResultFrequencyOrdering.ordered)', () => {
  test('orders equal matches by tier, then JLPT, then YouTube, as the app orders いる', () => {
    const hairu = item('入る')
    const iru = item('要る')
    const kana = item('いる')
    const roast = item('炒る')
    const frequency = frequencyOf([
      [hairu, [jlpt(1)]],
      [iru, [jlpt(5), youtube(949)]],
      [kana, [jlpt(5)]],
      [roast, [jlpt(2), youtube(14_572)]]
    ])
    expect(headwords(orderedItems(results([hairu, iru, kana, roast]), frequency))).toEqual([
      '要る',
      'いる',
      '炒る',
      '入る'
    ])
  })

  test('keeps a stronger English gloss match first, whatever the frequency', () => {
    const gloss = item('上一', { rank: strongGloss })
    const verb = item('要る', { sourceOrder: 0 })
    const frequency = frequencyOf([[verb, [jlpt(5), youtube(1)]]])
    expect(headwords(orderedItems(results([verb, gloss]), frequency))).toEqual(['上一', '要る'])
  })

  test('keeps a later source, such as a deinflected lemma, after the exact form', () => {
    const verb = item('要る', { sourceOrder: 0 })
    const later = item('後', { sourceOrder: 1 })
    expect(
      headwords(orderedItems(results([later, verb]), frequencyOf([[later, [jlpt(5)]]])))
    ).toEqual(['要る', '後'])
  })

  test('takes the tier from the first dictionary that has one, then puts the entry JLPT lists first', () => {
    const listed = item('家')
    const ranked = item('ランク')
    const rare = item('稀')
    const frequency = frequencyOf([
      [rare, [jlpt(1)]],
      [ranked, [youtube(100)]],
      [listed, [jlpt(5)]]
    ])
    expect(headwords(orderedItems(results([rare, ranked, listed]), frequency))).toEqual([
      '家',
      'ランク',
      '稀'
    ])
  })

  test('puts an entry with evidence before one without, then keeps the retrieval order', () => {
    const none = item('無')
    const other = item('他')
    const ranked = item('有')
    const frequency = frequencyOf([[ranked, [youtube(40_000)]]])
    expect(headwords(orderedItems(results([none, other, ranked]), frequency))).toEqual([
      '有',
      '無',
      '他'
    ])
  })

  test('leaves Discovered Words in their order', () => {
    const first = item('一')
    const second = item('二')
    const frequency = frequencyOf([[second, [jlpt(5)]]])
    expect(
      headwords(
        orderedItems(results([first, second], { presentation: 'discoveredWords' }), frequency)
      )
    ).toEqual(['一', '二'])
  })
})

describe('searchResultsScreen (SearchResultsView)', () => {
  test('shows the reading refinement, the rows in order with chips, and the count', () => {
    const iru = item('要る')
    const hairu = item('入る')
    const screen = searchResultsScreen(
      'IRU',
      results([hairu, iru], { readingRefinement: 'いる' }),
      frequencyOf([
        [iru, [jlpt(5), youtube(949)]],
        [hairu, [jlpt(1)]]
      ])
    )
    expect(screen).toMatchObject({
      state: 'results',
      query: 'iru',
      sections: ['readingRefinement', 'results'],
      readingRefinement: { query: 'いる', title: 'Search for「いる」' },
      kanji: null,
      resultCount: 2
    })
    if (screen.state !== 'results') return
    expect(screen.rows.map(row => [row.headword, row.retrievalOrder])).toEqual([
      ['要る', 1],
      ['入る', 0]
    ])
    expect(screen.rows[0].chips.map(chip => `${chip.source} ${chip.value}`)).toEqual([
      'JLPT N5',
      'YouTube 949'
    ])
    expect(screen.rows[1].chips.map(chip => `${chip.source} ${chip.value}`)).toEqual(['JLPT N1'])
  })

  test('shows the meaning an English query matched', () => {
    const eat = item('食べる', { rank: strongGloss, matchedSummary: 'to eat' })
    const screen = searchResultsScreen('eat', results([eat]), new Map())
    expect(screen.state === 'results' && screen.rows[0].summary).toBe('to eat')
  })

  test('leads a one-kanji query with the kanji row, from the entry written as the kanji before the re-sort', () => {
    const compound = item('要点')
    const kanji = item('要', { id: 'f'.repeat(32) })
    const screen = searchResultsScreen(
      '要',
      results([compound, kanji]),
      frequencyOf([[compound, [jlpt(5)]]])
    )
    expect(screen).toMatchObject({
      sections: ['results'],
      kanji: { character: '要', label: 'KANJI', summary: '要 summary', entryId: 'f'.repeat(32) },
      resultCount: 3
    })
  })

  test('shows a kanji row even without words, and No Dictionary Matches otherwise', () => {
    expect(searchResultsScreen('㐂', results([]), new Map())).toMatchObject({
      state: 'results',
      kanji: { character: '㐂', summary: 'Kanji detail', entryId: null },
      rows: [],
      resultCount: 1
    })
    expect(searchResultsScreen('qzxvkj', results([]), new Map())).toEqual({
      state: 'noResults',
      query: 'qzxvkj'
    })
  })

  test('lists at most 12 Discovered Words under their heading, without a kanji row', () => {
    const many = Array.from({ length: 14 }, (_, index) => item(`語${index}`))
    const screen = searchResultsScreen(
      '猫がnyan',
      results(many, { presentation: 'discoveredWords' }),
      new Map()
    )
    expect(screen).toMatchObject({ sections: ['discoveredWords'], kanji: null, resultCount: 12 })
  })
})

describe('loadFrequency', () => {
  test("reads every result's evidence from the JLPT and TUBELEX packs, in catalog order", async () => {
    const all = vi.fn(async (sql: string, _params: readonly string[]) =>
      sql.includes('jlpt.level_evidence')
        ? [{ id: 'a', level: 5 }]
        : [
            { id: 'a', rank: 120 },
            { id: 'b', rank: 9000 }
          ]
    )
    const db: SearchDatabase = { all: all as SearchDatabase['all'] }
    const frequency = await loadFrequency(
      db,
      results([item('一', { id: 'a' }), item('二', { id: 'b' })])
    )
    expect(all).toHaveBeenCalledTimes(2)
    expect(all.mock.calls.map(([, params]) => params)).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ])
    expect(frequency).toEqual(
      new Map([
        [
          'a',
          [
            { pack: 'jlpt', level: 5 },
            { pack: 'tubelex', rank: 120 }
          ]
        ],
        ['b', [{ pack: 'tubelex', rank: 9000 }]]
      ])
    )
  })

  test('reads nothing without results', async () => {
    const all = vi.fn()
    expect(await loadFrequency({ all }, results([]))).toEqual(new Map())
    expect(all).not.toHaveBeenCalled()
  })
})
