import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import type { SearchExamplesData } from '@/lib/dictionary/data'
import { examplesPerPage, wordExample } from '@/lib/dictionary/detail/examples'
import {
  searchExampleList,
  searchExamplePage,
  websiteExampleSearch
} from '@/lib/dictionary/example-search'
import { type Links, type PageExample, pageExample } from '@/lib/dictionary/page-example'
import type { SearchResults } from '@/lib/dictionary/search/search'
import { websiteSearch } from '@/lib/dictionary/search/website'
import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import { readRenderedExamples, visibleText } from './rendered'
import { SearchExamples } from './search-examples'

// Renders a search's Example Sentences page component to HTML, as the server does, and reads back
// what a reader sees: the title and count, each sentence's words with their links, furigana, and
// the query's words marked, its translation and Tatoeba credit, and the Load more button. The
// first tests render fixed data; the last runs cases of the app-recorded example-search.json
// suite through the search database into the page, and loads the rest of each list as the page
// does (ZENBU_SEARCH_D1=1, part of the search import's gate).

const render = (data: SearchExamplesData) => renderToStaticMarkup(<SearchExamples data={data} />)

/** Every word page under a slug the test can read back. */
const links: Links = {
  word: entSeq => (entSeq === null ? null : `/dictionary/w-${entSeq}/`),
  kanji: () => null
}

/** パンを食べた。 as the page shows it on the search for 食べた. */
const example = (position: number): PageExample =>
  pageExample(
    wordExample({
      sentence: {
        id: position + 1,
        pairId: '0'.repeat(32),
        japanese: 'パンを食べた。',
        english: 'I ate bread.',
        tokens: [
          { text: 'パン' },
          { text: 'を' },
          { text: '食べた', reading: 'たべた', dictionaryForm: '食べる' },
          { text: '。' }
        ],
        japaneseTatoebaId: 100 + position,
        japaneseContributor: null,
        japaneseLicense: 'CC BY 2.0 FR',
        englishTatoebaId: 200 + position,
        englishContributor: 'CK',
        englishLicense: 'CC BY 2.0 FR'
      },
      example: {
        entSeq: 1358280,
        position,
        sentenceId: position + 1,
        highlights: [2],
        links: [
          { token: 0, entSeqs: [1049020] },
          { token: 1, entSeqs: [2029010, 2215430] },
          { token: 2, entSeqs: [1358280] }
        ],
        tokens: null
      }
    }),
    links
  )

describe('the Example Sentences page', () => {
  test('titles the page with the query, counts its examples, and shows each one', () => {
    const html = render({
      query: '食べた',
      listed: 60,
      truncated: false,
      examples: Array.from({ length: 25 }, (_, position) => example(position)),
      examplesPath: '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%81%9F/examples.json?build=b'
    })
    expect(visibleText(html)).toMatch(/^食べた 60 examples /)
    const [first, ...rest] = readRenderedExamples(html)
    expect(rest).toHaveLength(24)
    expect(first).toEqual({
      position: 0,
      words: [
        { text: 'パン', furigana: '', href: '/dictionary/w-1049020', marked: false },
        // A word with several entries searches for its dictionary form.
        { text: 'を', furigana: '', href: '/dictionary/search/%E3%82%92', marked: false },
        { text: '食べた', furigana: '食(た)', href: '/dictionary/w-1358280', marked: true },
        { text: '。', furigana: '', href: null, marked: false }
      ],
      translation: 'I ate bread.',
      credit: 'Tatoeba: Japanese #100; English #200 by CK, CC BY 2.0 FR'
    })
    expect(visibleText(html)).toContain('Load more examples')
  })

  test('says so when no example sentence contains the query', () => {
    const html = render({
      query: 'qzxvkj',
      listed: 0,
      truncated: false,
      examples: [],
      examplesPath: '/x'
    })
    expect(visibleText(html)).toBe(
      'qzxvkj No Example Sentences No example sentence contains qzxvkj.'
    )
  })
})

const enabled = process.env.ZENBU_SEARCH_D1 === '1'

interface SuiteCase {
  query: string
  ids?: string[]
  shown?: {
    japanese: string
    english: string
    tokens: { surface: string; queryMatch?: boolean }[]
  }[]
}

/**
 * The rendered cases: a direct Japanese search (100 examples, over four loads), a deinflected
 * one and a romaji one (the primary entry's examples), English, kana with few, and none.
 */
const renderedQueries = ['見る', '食べた', 'miru', 'eat', 'すし', 'qzxvkj']

const suiteCases: SuiteCase[] = enabled
  ? (
      JSON.parse(
        readFileSync(
          new URL('../../../../ios/LanguageData/Conformance/example-search.json', import.meta.url),
          'utf8'
        )
      ) as { cases: SuiteCase[] }
    ).cases.filter(expected => renderedQueries.includes(expected.query))
  : []

describe.runIf(enabled)('the rendered Example Sentences page matches the app', () => {
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
    // As data.ts's getSearchExamples and getMoreSearchExamples read them.
    const query = normalizeSearchQuery(expected.query)
    const results: SearchResults = await websiteSearch(db).search(query)
    const search = websiteExampleSearch(db)
    const list = await searchExampleList(search, results, query)
    const page = async (from: number) =>
      (await searchExamplePage(search, list, query, from, examplesPerPage)).map(row =>
        pageExample(wordExample(row), links)
      )
    const data: SearchExamplesData = {
      query,
      listed: list.ids.length,
      truncated: list.truncated,
      examples: await page(0),
      examplesPath: `${searchPath(query)}examples.json?build=build`
    }
    const html = render(data)
    const rendered = readRenderedExamples(html)
    const ids = expected.ids ?? []

    // The page renders the first 25, then the route serves 25 at a time, each once, in order.
    expect(rendered.map(example => example.position)).toEqual(
      ids.slice(0, examplesPerPage).map((_, position) => position)
    )
    const loaded = [...data.examples]
    for (let from = examplesPerPage; from < data.listed; from += examplesPerPage) {
      loaded.push(...(await page(from)))
    }
    const pairIds = (await search.sentences(list.ids)).map(sentence => `esp1_${sentence.pairId}`)
    expect(pairIds).toEqual(ids)
    expect(loaded.map(example => example.position)).toEqual(ids.map((_, position) => position))
    expect(visibleText(html)).toContain(ids.length > examplesPerPage ? 'Load more examples' : query)
    if (ids.length === 0) {
      expect(visibleText(html)).toContain('No Example Sentences')
      return
    }

    // The first sentences read as the app shows them: its words, with the query's marked.
    for (const [index, shown] of (expected.shown ?? []).entries()) {
      const example = rendered[index]
      expect(example.words.map(word => word.text).join('')).toBe(shown.japanese)
      expect(example.words.map(word => word.text)).toEqual(shown.tokens.map(token => token.surface))
      expect(example.words.map(word => word.marked)).toEqual(
        shown.tokens.map(token => token.queryMatch === true)
      )
      expect(example.translation).toBe(shown.english)
      expect(example.credit).toMatch(/^Tatoeba: Japanese #\d+.*; English #\d+/)
    }
    // Every word linked to one entry has its page; a word with kanji, furigana.
    for (const word of rendered.flatMap(example => example.words)) {
      if (word.href?.startsWith('/dictionary/w-') && /[㐀-鿿々]/u.test(word.text)) {
        expect(word.furigana, word.text).not.toBe('')
      }
    }
  })
})
