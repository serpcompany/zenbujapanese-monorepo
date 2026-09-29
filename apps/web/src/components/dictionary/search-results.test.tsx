import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import type { SearchData, SearchWord } from '@/lib/dictionary/data'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import { resultsExampleCount, websiteExampleSearch } from '@/lib/dictionary/example-search'
import { linkedWords, linkSearchScreen, resultsPerPage } from '@/lib/dictionary/results/links'
import { loadFrequency, searchResultsScreen } from '@/lib/dictionary/results/results'
import { d1SearchDatabase } from '@/lib/dictionary/search/search'
import { websiteSearch } from '@/lib/dictionary/search/website'
import { normalizeSearchQuery, searchExamplesPath } from '@/lib/dictionary/urls'
import { readRenderedPage, visibleText } from './rendered'
import { SearchResults } from './search-results'

// Renders the search results page's component to HTML, as the server does, and reads back what a
// reader sees: the sections in order, the Example Sentences row, the reading refinement, the kanji
// row, each row's headword, meaning, and chips, the first 25 words and the rest the rows route
// serves, and the no-results state. The first tests render fixed data; the last runs cases of the
// app-recorded search-results.json suite through the search database and the results core into
// the page (ZENBU_SEARCH_D1=1, part of the search import's gate).

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
      wordCount: 2,
      rowsPath: null,
      resultCount: 2
    })
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'readingRefinement', 'results'])
    expect(page.examples).toEqual({
      text: 'View 3 Example Sentences',
      href: '/dictionary/search/iru/examples'
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
      wordCount: 1,
      rowsPath: null,
      resultCount: 2
    })
    const page = readRenderedPage(html)
    expect(page.kanji).toEqual({ character: '要', text: 'KANJI pivot, vital point, key point' })
    // The kanji row comes before the first word.
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
      wordCount: 1,
      rowsPath: null,
      resultCount: 1
    })
    expect(html).toContain('<p class="line-clamp-2 text-sm">word</p>')
  })

  test('renders the first 25 of 60 words, counts all 60, and offers the rest', () => {
    const rows = Array.from({ length: 25 }, (_, index) => word(index + 1, '語', 'ご', 'word', []))
    const html = render({
      state: 'results',
      query: 'い',
      sections: ['results'],
      examples: null,
      readingRefinement: null,
      kanji: null,
      rows,
      wordCount: 60,
      rowsPath: '/dictionary/search/%E3%81%84/results.json?build=b',
      resultCount: 60
    })
    const page = readRenderedPage(html)
    expect(page.rows.map(row => row.entSeq)).toEqual(rows.map(row => row.entSeq))
    expect(visibleText(html)).toMatch(/^60 words for い /)
    // Without JavaScript, the button loads the rest; with it, scrolling does.
    expect(visibleText(html)).toContain('Load more words')
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
        wordCount: 0,
        rowsPath: null,
        resultCount: 0
      })
    )
    expect(page.sections).toEqual(['examples'])
    expect(page.rows).toEqual([])
  })
})

const enabled = process.env.ZENBU_SEARCH_D1 === '1'

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

/**
 * The rendered cases: romaji with a refinement and its primary entry's examples, a kanji, English,
 * kana, 60 words, and no results.
 */
const renderedQueries = ['iru', 'いる', '日', 'eat', 'かえる', 'い', 'qzxvkj']

const suiteCases: SuiteCase[] = enabled
  ? (
      JSON.parse(
        readFileSync(
          new URL('../../../../ios/LanguageData/Conformance/search-results.json', import.meta.url),
          'utf8'
        )
      ) as { cases: SuiteCase[] }
    ).cases.filter(expected => renderedQueries.includes(expected.query))
  : []

describe.runIf(enabled)('the rendered search results page matches the app', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let db: D1Database

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_SEARCH_D1_PATH ?? '.search-d1'}/v3` }
    })
    if (!proxy.env.SEARCH_DB) throw new Error('wrangler.jsonc has no local SEARCH_DB binding')
    db = proxy.env.SEARCH_DB
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test('renders every chosen case', () => {
    expect(suiteCases.map(expected => expected.query).sort()).toEqual([...renderedQueries].sort())
  })

  test.each(suiteCases)('「$query」', async expected => {
    // As data.ts's searchDictionary reads it.
    const results = await websiteSearch(db).search(expected.query)
    const [frequency, exampleCount] = await Promise.all([
      loadFrequency(d1SearchDatabase(db), results),
      resultsExampleCount(websiteExampleSearch(db), results, expected.query)
    ])
    const screen = searchResultsScreen(expected.query, results, frequency, exampleCount)
    // Linked as searchDictionary links them once the dictionary database is loaded.
    const links = { dictionaryLoaded: true, kanjiHasPage: true, build: 'build' }
    const data = linkSearchScreen(screen, links)
    const html = render(data)
    const page = readRenderedPage(html)
    for (const row of data.state === 'results' ? data.rows : []) {
      expect(html).toContain(`href="${(row.path ?? '').replace(/\/$/, '')}`)
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
            href: searchExamplesPath(normalizeSearchQuery(expected.query)).replace(/\/$/, '')
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
    // The page renders the first 25 words and counts them all.
    expect(page.rows).toEqual(expectedRows.slice(0, resultsPerPage))
    expect(visibleText(html)).toMatch(new RegExp(`^${expectedRows.length} words? for `))
    // The rows route serves the rest, 25 at a time, as the page asks for them.
    const words = linkedWords(screen, true)
    const loaded = [...page.rows.map(row => row.entSeq)]
    for (let from = resultsPerPage; from < words.length; from += resultsPerPage) {
      loaded.push(...words.slice(from, from + resultsPerPage).map(row => row.entSeq))
    }
    expect(loaded).toEqual(expectedRows.map(row => row.entSeq))
    expect(data.state === 'results' && data.rowsPath !== null).toBe(expectedRows.length > 25)
  })
})
