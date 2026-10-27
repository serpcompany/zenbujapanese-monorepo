import { describe, expect, test } from 'vitest'
import { defaultFrequencyLookups } from '../detail/frequency'
import type { FrequencyRow } from '../detail/rows'
import type { Rank } from '../search/rank'
import type { SearchResultItem, SearchResults } from '../search/search'
import { orderedByFrequency } from './ordering'
import { type FrequencyByEntry, listedResults, resultsLayout, searchResultsScreen } from './results'

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

const headwords = (ordered: { headword: string }[]) => ordered.map(result => result.headword)

function orderedItems(found: SearchResults, frequency: FrequencyByEntry) {
  return orderedByFrequency(listedResults(found).items, id =>
    defaultFrequencyLookups(frequency.get(id) ?? [])
  )
}

describe('orderedByFrequency (SearchResultFrequencyOrdering.ordered)', () => {
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

  test('gives equally relevant matches one place and a weaker match a later one', () => {
    const gloss = item('上一', { rank: strongGloss })
    const first = item('要る')
    const second = item('入る')
    const later = item('後', { sourceOrder: 1 })
    expect(
      listedResults(results([later, first, gloss, second])).items.map(listed => [
        listed.headword,
        listed.relevance
      ])
    ).toEqual([
      ['後', 2],
      ['要る', 1],
      ['上一', 0],
      ['入る', 1]
    ])
  })
})

describe('resultsLayout', () => {
  test('leaves Discovered Words in their order, twelve at most', () => {
    const many = Array.from({ length: 14 }, (_, index) => item(`語${index}`))
    const layout = resultsLayout(
      '猫がnyan',
      listedResults(results(many, { presentation: 'discoveredWords' })),
      0
    )
    expect(layout.isDiscovered).toBe(true)
    expect(headwords(layout.presented)).toEqual(
      headwords(listedResults(results(many)).items).slice(0, 12)
    )
  })

  test('lists only the leading entries when asked, as a Radicals or Grade pick does for one character', () => {
    const listed = listedResults(
      results([item('一'), item('二'), item('三')], { leadingLexicalEntryCount: 2 })
    )
    expect(headwords(resultsLayout('一', listed, 0, true).presented)).toEqual(['一', '二'])
    expect(headwords(resultsLayout('一', listed, 0).presented)).toEqual(['一', '二', '三'])
    expect(
      headwords(resultsLayout('一', { ...listed, leadingLexicalEntryCount: 9 }, 0, true).presented)
    ).toEqual(['一', '二', '三'])
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

  test('sums up the kanji row with the kanji’s own meanings', () => {
    const sunday = item('日', { id: 'a'.repeat(32) })
    const meanings = new Map([
      ['日', ['day', 'sun', 'Japan', 'counter for days']],
      ['要', []]
    ])
    const kanjiMeanings = (character: string) => meanings.get(character)
    const kanjiRow = (query: string, found: SearchResultItem[]) => {
      const screen = searchResultsScreen(query, results(found), new Map(), 0, false, kanjiMeanings)
      return screen.state === 'results' ? screen.kanji : null
    }
    expect(kanjiRow('日', [sunday])).toEqual({
      character: '日',
      label: 'KANJI',
      summary: 'day, sun, Japan, counter for days',
      entryId: sunday.entry.id
    })
    expect(kanjiRow('要', [item('要')])?.summary).toBe('要 summary')
    expect(kanjiRow('㐂', [])?.summary).toBe('Kanji detail')
  })

  test('lists only the leading entries of a kanji picked from the radicals, re-sorted, with its kanji row', () => {
    const kanji = item('要', { id: 'e'.repeat(32) })
    const reading = item('要', { id: 'f'.repeat(32) })
    const compound = item('要点')
    const found = results([kanji, reading, compound], { leadingLexicalEntryCount: 2 })
    const frequency = frequencyOf([
      [reading, [jlpt(5)]],
      [compound, [jlpt(5)]]
    ])
    const picked = searchResultsScreen('要', found, frequency, 0, true)
    expect(picked).toMatchObject({ kanji: { character: '要', entryId: kanji.entry.id } })
    if (picked.state !== 'results') throw new Error('The pick found nothing')
    expect(picked.rows.map(row => row.id)).toEqual([reading.entry.id, kanji.entry.id])
    expect(picked.resultCount).toBe(3)
    const typed = searchResultsScreen('要', found, frequency)
    expect(typed.state === 'results' && typed.rows).toHaveLength(3)
    const longer = searchResultsScreen('要点', found, frequency, 0, true)
    expect(longer.state === 'results' && longer.rows).toHaveLength(3)
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
