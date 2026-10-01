import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { SearchData, SearchWord } from '@/lib/dictionary/data'
import { linkSearchScreen } from '@/lib/dictionary/results/links'
import { normalizeSearchQuery, searchExamplesPath } from '@/lib/dictionary/urls'
import { gateEnabled, gateService, recordedCases } from './gate'
import { readRenderedPage, visibleText } from './rendered'
import { SearchResults } from './search-results'

const render = (data: SearchData) => renderToStaticMarkup(<SearchResults data={data} />)

function word(
  entSeq: number,
  headword: string,
  reading: string,
  summary: string,
  chips: [string, string][]
): SearchWord {
  return {
    id: String(entSeq),
    entSeq,
    headword,
    reading,
    ruby: rubySegments(headword, reading),
    summary,
    chips: chips.map(([source, value]) => ({
      source,
      value,
      tier: 'veryCommon',
      spokenTier: null
    })),
    retrievalOrder: 0,
    path: `/dictionary/${headword}-${entSeq}/`
  }
}

describe('the search results page', () => {
  test('shows the Example Sentences row, the reading refinement, then the rows in order with their chips', () => {
    const html = render({
      state: 'results',
      query: 'iru',
      sections: ['examples', 'readingRefinement', 'results'],
      examples: {
        title: 'View 3 Example Sentences',
        count: 3,
        primaryEntry: 'x',
        path: '/dictionary/search/iru/examples/'
      },
      readingRefinement: {
        query: 'いる',
        title: 'Search for「いる」',
        path: '/dictionary/search/いる/'
      },
      kanji: null,
      rows: [
        word(1546640, '要る', 'いる', 'to be needed', [
          ['JLPT', 'N5'],
          ['YouTube', '949']
        ]),
        word(1577980, 'いる', 'いる', 'to be (of animate objects)', [['JLPT', 'N5']])
      ],
      resultCount: 2
    })
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'readingRefinement', 'results'])
    expect(page.examples).toEqual({
      text: 'View 3 Example Sentences',
      href: '/dictionary/search/iru/examples/'
    })
    expect(page.refinement).toBe('Search for「いる」')
    expect(html).toContain('href="/dictionary/search/いる')
    expect(page.kanji).toBeNull()
    expect(page.rows).toEqual([
      {
        entSeq: 1546640,
        headword: '要る',
        summary: 'to be needed',
        chips: ['JLPT N5', 'YouTube 949']
      },
      {
        entSeq: 1577980,
        headword: 'いる',
        summary: 'to be (of animate objects)',
        chips: ['JLPT N5']
      }
    ])
  })

  test('leads a one-kanji query with the KANJI row and its primary entry’s meaning', () => {
    const html = render({
      state: 'results',
      query: '要',
      sections: ['results'],
      examples: null,
      readingRefinement: null,
      kanji: {
        character: '要',
        label: 'KANJI',
        summary: 'pivot, vital point, key point',
        entryId: 'x',
        path: '/dictionary/kanji/要/'
      },
      rows: [word(1609600, '必要', 'ひつよう', 'necessary', [['JLPT', 'N4']])],
      resultCount: 2
    })
    const page = readRenderedPage(html)
    expect(page.kanji).toEqual({ character: '要', text: 'KANJI pivot, vital point, key point' })
    expect(html.indexOf('data-kanji-row')).toBeLessThan(html.indexOf('data-result-row'))
    expect(page.rows.map(row => row.headword)).toEqual(['必要'])
  })

  test('says No Dictionary Matches, as the app does, when nothing matches', () => {
    const page = readRenderedPage(render({ state: 'noResults', query: 'qzxvkj' }))
    expect(page.noResults).toBe(
      'No Dictionary Matches Try another Japanese or English Search query.'
    )
    expect(page.rows).toEqual([])
  })

  test('clamps each meaning to two lines, as the app does', () => {
    const html = render({
      state: 'results',
      query: 'x',
      sections: ['results'],
      examples: null,
      readingRefinement: null,
      kanji: null,
      rows: [word(1, '語', 'ご', 'word', [])],
      resultCount: 1
    })
    expect(html).toContain('<p class="line-clamp-2 text-sm">word</p>')
  })

  test('shows only the Example Sentences row when only sentences match', () => {
    const page = readRenderedPage(
      render({
        state: 'results',
        query: 'it is',
        sections: ['examples'],
        examples: {
          title: 'View 50+ Example Sentences',
          count: 51,
          primaryEntry: null,
          path: '/dictionary/search/it%20is/examples/'
        },
        readingRefinement: null,
        kanji: null,
        rows: [],
        resultCount: 0
      })
    )
    expect(page.sections).toEqual(['examples'])
    expect(page.rows).toEqual([])
  })

  test('leads with the Example Sentences row, linked to the search’s examples page', () => {
    const html = render({
      state: 'results',
      query: 'eat',
      sections: ['examples', 'results'],
      examples: {
        count: 51,
        title: 'View 50+ Example Sentences',
        primaryEntry: null,
        path: '/dictionary/search/eat/examples/'
      },
      readingRefinement: null,
      kanji: null,
      rows: [word(1358280, '食べる', 'たべる', 'to eat', [])],
      resultCount: 1
    })
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'results'])
    expect(page.examples).toEqual({
      text: 'View 50+ Example Sentences',
      href: '/dictionary/search/eat/examples/'
    })
  })

  test('lists a sentence’s Discovered Words, below its Example Sentences row', () => {
    const html = render({
      state: 'results',
      query: '日本語を勉強する',
      sections: ['examples', 'discoveredWords'],
      examples: { count: 3, title: 'View 3 Example Sentences', primaryEntry: null, path: null },
      readingRefinement: null,
      kanji: null,
      rows: [word(1464530, '日本語', 'にほんご', 'Japanese (language)', [])],
      resultCount: 1
    })
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'discoveredWords'])
    expect(page.rows.map(row => row.headword)).toEqual(['日本語'])
  })
})

interface SuiteCase {
  query: string
  state?: string
  sections?: string[]
  examples?: { title: string; count: number }
  readingRefinement?: { title: string }
  kanji?: { character: string; label: string; summary: string }
  results?: {
    entSeq: string[]
    headword: string
    summary: string
    chips: { name: string; text: string }[]
  }[]
}

const renderedQueries = ['iru', 'いる', '日', 'eat', 'かえる', 'い', 'qzxvkj']

const suiteCases = recordedCases<SuiteCase>('search-results.json').filter(expected =>
  renderedQueries.includes(expected.query)
)

describe.runIf(gateEnabled)('the rendered search results page matches the app', () => {
  test('renders every chosen case', () => {
    expect(suiteCases.map(expected => expected.query).sort()).toEqual([...renderedQueries].sort())
  })

  test.each(suiteCases)('「$query」', async expected => {
    const { screen, kanjiHasPage } = (await gateService().search(expected.query)).data
    const data = linkSearchScreen(screen, { dictionaryLoaded: true, kanjiHasPage })
    const html = render(data)
    const page = readRenderedPage(html)
    for (const row of data.state === 'results' ? data.rows : []) {
      expect(html).toContain(`href="${row.path ?? ''}"`)
    }

    if (expected.state === 'noResults') {
      expect(page.noResults).toMatch(/^No Dictionary Matches/)
      return
    }
    expect(page.sections).toEqual(expected.sections ?? [])
    expect(page.examples).toEqual(
      expected.examples
        ? {
            text: expected.examples.title,
            href: searchExamplesPath(normalizeSearchQuery(expected.query))
          }
        : null
    )
    expect(page.refinement).toBe(expected.readingRefinement?.title ?? null)
    expect(page.kanji).toEqual(
      expected.kanji
        ? {
            character: expected.kanji.character,
            text: `${expected.kanji.label} ${expected.kanji.summary}`
          }
        : null
    )
    const expectedRows = (expected.results ?? []).map(row => ({
      entSeq: Number(row.entSeq[0]),
      headword: row.headword,
      summary: row.summary,
      chips: row.chips.map(chip => `${chip.name} ${chip.text}`)
    }))
    expect(page.rows).toEqual(expectedRows)
    expect(visibleText(html)).toMatch(new RegExp(`^${expectedRows.length} words? for `))
  })
})
