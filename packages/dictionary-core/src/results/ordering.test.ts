import { describe, expect, test } from 'vitest'
import type { FrequencyDictionary, FrequencyLookup } from '../detail/frequency'
import {
  appliedSort,
  filteredResults,
  filterTitles,
  forgetsSort,
  hiddenCountTitle,
  type LookupsByEntry,
  orderedByFrequency,
  type RankedResult,
  type ResultFilter,
  type ResultSort,
  resultFilter,
  resultFilters,
  resultSort,
  shownCountAnnouncement,
  sortAnnouncement,
  sortedResults,
  sortSummary,
  storedSort,
  type WordStatus
} from './ordering'

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
    coveredSourceRows: 1
  }
}

const jlpt = dictionary('zenbu.jlpt.waller.levels', 'JLPT Levels', 'level')
const youTube = dictionary('zenbu.tubelex.youtube.ja.unidic-3.1', 'YouTube')
const anime = dictionary('zenbu.jiten.anime.ja.ordered-v2', 'Anime')
const byAnime: ResultSort = { by: 'frequency', family: 'zenbu.jiten.anime' }
const byYouTube: ResultSort = { by: 'frequency', family: 'zenbu.tubelex.youtube' }
const knownWords: ResultSort = { by: 'knownWords' }
const relevance: ResultSort = { by: 'relevance' }

const ids = ['一', '二', '三', '四', '五']
const defaultOrder = ids.map(id => ({ id }))

function ranked(id: string, relevance = 0, fallbackOrder = 0): RankedResult {
  return { id, relevance, fallbackOrder }
}

function inOrder(results: RankedResult[]): RankedResult[] {
  return results.map((result, fallbackOrder) => ({ ...result, fallbackOrder }))
}

const lookupsFrom =
  (entries: Record<string, FrequencyLookup[]>): LookupsByEntry =>
  id =>
    Object.hasOwn(entries, id) ? entries[id] : null

const rank = (value: number | null, pack = youTube): FrequencyLookup => ({
  dictionary: pack,
  value
})
const level = (value: number | null): FrequencyLookup => ({ dictionary: jlpt, value })

const order = (results: RankedResult[], entries: Record<string, FrequencyLookup[]>) =>
  orderedByFrequency(results, lookupsFrom(entries)).map(result => result.id)

describe('orderedByFrequency (SearchResultFrequencyOrdering.ordered)', () => {
  test('a later meaning and a mention stay below every first meaning, whatever their frequency', () => {
    expect(
      order([ranked('丙', 2, 0), ranked('乙', 1, 1), ranked('甲', 0, 2)], {
        甲: [rank(50_000)],
        乙: [rank(2)],
        丙: [rank(1)]
      })
    ).toEqual(['甲', '乙', '丙'])
  })

  test('frequency only changes order for equivalent match evidence', () => {
    expect(
      order([ranked('甲', 0, 0), ranked('乙', 0, 1), ranked('丙', 1, 2)], {
        甲: [rank(20)],
        乙: [rank(10)],
        丙: [rank(1)]
      })
    ).toEqual(['乙', '甲', '丙'])
  })

  test('missing and equal frequency evidence keep the retrieval order, then the ID', () => {
    expect(
      order(inOrder([ranked('甲'), ranked('乙'), ranked('丙')]), {
        甲: [rank(10)],
        乙: [rank(10)]
      })
    ).toEqual(['甲', '乙', '丙'])
    expect(order([ranked('b'), ranked('a')], {})).toEqual(['a', 'b'])
  })

  test('JLPT level orders first and the next dictionary’s rank breaks level ties', () => {
    expect(
      order(inOrder([ranked('n3'), ranked('n5Rare'), ranked('n5Common'), ranked('unlisted')]), {
        n3: [level(3), rank(1)],
        n5Rare: [level(5), rank(900)],
        n5Common: [level(5), rank(20)],
        unlisted: [level(null), rank(2)]
      })
    ).toEqual(['n5Common', 'n5Rare', 'unlisted', 'n3'])
  })

  test('an entry the first dictionary misses places by the next dictionary, not last', () => {
    expect(
      order(inOrder([ranked('舎屋'), ranked('屋舎'), ranked('住まい'), ranked('家')]), {
        家: [rank(null), level(5)],
        住まい: [rank(7_056), level(2)],
        屋舎: [rank(252_598), level(null)],
        舎屋: [rank(null), level(null)]
      })
    ).toEqual(['家', '住まい', '屋舎', '舎屋'])
  })

  test('changing the first dictionary’s evidence reorders only equivalent results', () => {
    const results = inOrder([ranked('甲'), ranked('乙')])
    expect(order(results, { 甲: [rank(1)], 乙: [rank(2)] })).toEqual(['甲', '乙'])
    expect(order(results, { 甲: [rank(2)], 乙: [rank(1)] })).toEqual(['乙', '甲'])
  })

  test('evidence that could not be read, or is still loading, keeps the retrieval order', () => {
    const results = inOrder([ranked('甲'), ranked('乙'), ranked('丙')])
    const unreadable: FrequencyLookup[] = [{ dictionary: null, unavailable: 'fixture' }]
    expect(order(results, { 甲: unreadable, 乙: unreadable, 丙: unreadable })).toEqual([
      '甲',
      '乙',
      '丙'
    ])
    expect(order(results, {})).toEqual(['甲', '乙', '丙'])
  })
})

describe('sortedResults (SearchResultSortOrdering.ordered)', () => {
  const known =
    (...known: string[]) =>
    (id: string) =>
      known.includes(id)
  const sorted = (
    sort: ResultSort,
    entries: Record<string, FrequencyLookup[]> = {},
    isKnown = known()
  ) => sortedResults(defaultOrder, sort, lookupsFrom(entries), isKnown).map(result => result.id)

  function values(
    dictionaries: FrequencyDictionary[],
    chosen: FrequencyDictionary,
    chosenValues: Record<string, number>
  ): Record<string, FrequencyLookup[]> {
    return Object.fromEntries(
      ids.map((id, offset) => [
        id,
        dictionaries.map(pack => ({
          dictionary: pack,
          value: pack === chosen ? (chosenValues[id] ?? null) : ids.length - offset
        }))
      ])
    )
  }

  test('a rank dictionary orders every result by its own rank, most common first', () => {
    for (const chosen of [youTube, anime]) {
      const entries = values([jlpt, youTube, anime], chosen, {
        一: 500,
        三: 20,
        四: 500,
        五: 9_000
      })
      expect(
        sorted({ by: 'frequency', family: chosen.id.split('.').slice(0, 3).join('.') }, entries)
      ).toEqual(['三', '一', '四', '五', '二'])
    }
  })

  test('JLPT orders N5 first and N1 last', () => {
    const entries = values([jlpt, youTube], jlpt, { 一: 3, 三: 5, 四: 3, 五: 1 })
    expect(sorted({ by: 'frequency', family: 'zenbu.jlpt.waller' }, entries)).toEqual([
      '三',
      '一',
      '四',
      '五',
      '二'
    ])
  })

  test('Known Words puts known words first and keeps the default order within each group', () => {
    expect(sorted(knownWords, {}, known('一', '四'))).toEqual(['一', '四', '二', '三', '五'])
  })

  test('words the chosen dictionary doesn’t rank go last, in default order', () => {
    expect(sorted(byYouTube, values([youTube], youTube, { 三: 40, 五: 10 }))).toEqual([
      '五',
      '三',
      '一',
      '二',
      '四'
    ])
  })

  test('ties keep their default order, and Default keeps the order it is given', () => {
    const tied = Object.fromEntries(ids.map(id => [id, 7]))
    expect(sorted(byYouTube, values([youTube], youTube, tied))).toEqual(ids)
    expect(sorted(relevance)).toEqual(ids)
    expect(sorted(byYouTube)).toEqual(ids)
  })
})

describe('the Sort By choice', () => {
  test('a disabled or removed dictionary falls back to Default and the choice is forgotten', () => {
    expect(appliedSort(byAnime, [jlpt])).toEqual(relevance)
    expect(forgetsSort(byAnime, [jlpt])).toBe(true)
    expect(appliedSort(byAnime, [jlpt, anime])).toEqual(byAnime)
    expect(forgetsSort(byAnime, [jlpt, anime])).toBe(false)
    expect(appliedSort(knownWords, [])).toEqual(knownWords)
    expect(forgetsSort(knownWords, [])).toBe(false)
  })

  test('while ranks load or can’t be read, a dictionary sort shows Default and is kept', () => {
    expect(appliedSort(byAnime, null)).toEqual(relevance)
    expect(forgetsSort(byAnime, null)).toBe(false)
  })

  test('a rebuilt pack keeps the chosen sort, since the sort names the pack’s family', () => {
    const rebuilt = dictionary('zenbu.jiten.anime.ja.ordered-v3', 'Anime')
    expect(appliedSort(byAnime, [rebuilt])).toEqual(byAnime)
  })

  test.each([
    relevance,
    byYouTube,
    knownWords
  ])('is stored as text that reads back as the same choice: %o', sort => {
    expect(resultSort(storedSort(sort))).toEqual(sort)
  })

  test('is stored as the app has always stored it', () => {
    expect([relevance, byYouTube, knownWords].map(storedSort)).toEqual([
      'default',
      'frequency|zenbu.tubelex.youtube',
      'known-words'
    ])
  })

  test.each([
    '',
    'frequency',
    'frequency|zenbu.jlpt.waller|least-common-first',
    'known-words|unknown-first',
    'x'
  ])('stored text that isn’t a choice reads as Default: %j', stored => {
    expect(resultSort(stored)).toEqual(relevance)
  })

  test('the menu and the list name the order, and VoiceOver hears it', () => {
    expect(sortSummary(relevance, [])).toBe('Default')
    expect(sortSummary(byYouTube, [youTube])).toBe('YouTube')
    expect(sortSummary({ by: 'frequency', family: 'zenbu.jlpt.waller' }, [jlpt])).toBe('JLPT')
    expect(sortSummary(byAnime, [youTube])).toBe('Frequency')
    expect(sortSummary(knownWords, [])).toBe('Known Words')
    expect(sortAnnouncement(byYouTube, [youTube])).toBe('Sorted by YouTube')
    expect(sortAnnouncement(knownWords, [])).toBe('Sorted by known words')
    expect(sortAnnouncement(relevance, [youTube])).toBe('Sorted by default order')
  })
})

describe('the Filter choice (SearchResultFilter)', () => {
  const entries = ids.map(id => ({ id }))
  const statuses: Record<string, WordStatus> = {
    一: 'known',
    二: 'unknown',
    三: 'known',
    四: 'learning',
    五: 'unknown'
  }
  const shown = (filter: ResultFilter, from = entries) =>
    filteredResults(from, filter, id => statuses[id]).map(result => result.id)

  test('picks unknown, Learning, or known words, or all of them, in the order it is given', () => {
    expect(shown('unknown')).toEqual(['二', '五'])
    expect(shown('learning')).toEqual(['四'])
    expect(shown('known')).toEqual(['一', '三'])
    expect(shown('all')).toEqual(ids)
    expect(shown('unknown', [...entries].reverse())).toEqual(['五', '二'])
  })

  test('puts each word under exactly one of Unknown, Learning, and Known', () => {
    const under = (['unknown', 'learning', 'known'] as const).flatMap(filter => shown(filter))
    expect([...under].sort()).toEqual([...ids].sort())
  })

  test('can hide every word', () => {
    expect(shown('unknown', [{ id: '一' }, { id: '三' }])).toEqual([])
    expect(shown('learning', [{ id: '一' }, { id: '二' }])).toEqual([])
  })

  test('names each filter, and counts what it hides and shows', () => {
    expect(resultFilters.map(filter => filterTitles[filter])).toEqual([
      'All',
      'Unknown',
      'Learning',
      'Known'
    ])
    expect(hiddenCountTitle(1)).toBe('1 word hidden by filter')
    expect(hiddenCountTitle(3)).toBe('3 words hidden by filter')
    expect(shownCountAnnouncement(1)).toBe('1 word shown')
    expect(shownCountAnnouncement(2)).toBe('2 words shown')
  })

  test('is stored as its name, and stored text that isn’t a filter reads as All', () => {
    expect(resultFilters.map(resultFilter)).toEqual(['all', 'unknown', 'learning', 'known'])
    expect(
      ['maybe', '', 'Learning', 'unknown|in:zenbu.jlpt.waller', 'in:zenbu.jlpt.waller'].map(
        resultFilter
      )
    ).toEqual(['all', 'all', 'all', 'all', 'all'])
  })
})
