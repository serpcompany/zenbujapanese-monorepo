import { examplesPerPage, wordExample } from '@zenbu/dictionary-core/detail/examples'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PageExample, SearchExamplesData } from '@/lib/dictionary/data'
import { searchExamplesIndexable } from '@/lib/dictionary/data'
import { type Links, pageExample, serviceLinks } from '@/lib/dictionary/page-example'
import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import { gateEnabled, gateService, recordedCases } from './gate'
import { readRenderedExamples, visibleText } from './rendered'
import { SearchExamples } from './search-examples'

// Renders a search's Example Sentences page component to HTML, as the server does, and reads back
// what a reader sees: the title and count, each sentence's words with their links, furigana, and
// the query's words marked, its translation and Tatoeba credit, and the Load more button. The
// first test renders fixed data. The last ones render what the dictionary service answers
// (./gate.ts): for every search-results.json case with an Example Sentences row, as many examples
// as the row's count promises; and for cases of example-search.json, the sentences the app lists,
// in its order, read as the app shows them, loading the rest of each list as the page does.

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
  test('titles the page with the query and its count, and shows each one', () => {
    const html = render({
      query: '食べた',
      listed: 60,
      truncated: false,
      indexable: true,
      examples: Array.from({ length: 25 }, (_, position) => example(position)),
      examplesPath: '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%81%9F/examples.json?build=b'
    })
    expect(visibleText(html)).toMatch(/^食べた 60 examples パン/)
    expect(html).toContain('<h1 lang="ja"')
    const [first, ...rest] = readRenderedExamples(html)
    expect(rest).toHaveLength(24)
    expect(first).toEqual({
      position: 0,
      words: [
        { text: 'パン', furigana: '', href: '/dictionary/w-1049020/', marked: false },
        // A word with several entries searches for its dictionary form.
        { text: 'を', furigana: '', href: '/dictionary/search/%E3%82%92/', marked: false },
        { text: '食べた', furigana: '食(た)', href: '/dictionary/w-1358280/', marked: true },
        { text: '。', furigana: '', href: null, marked: false }
      ],
      translation: 'I ate bread.',
      credit: 'Tatoeba: Japanese #100; English #200 by CK, CC BY 2.0 FR'
    })
    expect(visibleText(html)).toContain('Load more examples')
  })

  test('reads an English query as English', () => {
    const html = render({
      query: 'eat',
      listed: 100,
      truncated: true,
      indexable: false,
      examples: [example(0)],
      examplesPath: '/dictionary/search/eat/examples.json?build=b'
    })
    expect(html).toContain('<h1 class=')
    expect(visibleText(html)).toMatch(/^eat The first 100 of more than 100 examples/)
  })
})

describe('whether search engines may index the page', () => {
  test('only a direct Japanese search’s', () => {
    expect(searchExamplesIndexable('食べた', false)).toBe(true)
    expect(searchExamplesIndexable('食べた', true)).toBe(false)
    expect(searchExamplesIndexable('miru', true)).toBe(false)
    expect(searchExamplesIndexable('eat', false)).toBe(false)
    // A full-width query searches as the ASCII it normalizes to.
    expect(searchExamplesIndexable('ｅａｔ', false)).toBe(false)
  })
})

interface ResultsCase {
  query: string
  examples?: { title: string; count: number; primaryEntry?: string }
}

const rowCases = recordedCases<ResultsCase>('search-results.json').filter(
  expected => expected.examples
)

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u

describe.runIf(gateEnabled)('the search examples page matches its Example Sentences row', () => {
  test.each(rowCases)('「$query」', async expected => {
    const row = expected.examples
    if (!row) throw new Error('no examples row')
    const found = await gateService().searchExamples(expected.query)
    if (!found) throw new Error(`No examples for ${expected.query}`)
    const { listed, rows } = found.data
    // ExampleSentenceResultCount: exact up to 50, and 51 for more.
    if (row.count > 50) expect(listed).toBeGreaterThan(50)
    else expect(listed).toBe(row.count)

    const examples: PageExample[] = rows.map(rows => {
      const example = wordExample(rows)
      return { ...example, tokens: example.tokens.map(token => ({ ...token, path: null })) }
    })
    expect(examples.map(example => example.position)).toEqual(
      Array.from({ length: Math.min(listed, examplesPerPage) }, (_, index) => index)
    )

    if (!row.primaryEntry && japanese.test(expected.query)) {
      for (const example of examples) {
        expect(
          example.tokens.some(token => token.isPageWord),
          example.text
        ).toBe(true)
      }
    }
  })
})

interface ExampleSearchCase {
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
const renderedQueries = ['見る', '食べた', 'miru', 'eat', 'すし', 't*', '^the', 'qzxvkj']

const exampleSearchCases = recordedCases<ExampleSearchCase>('example-search.json').filter(
  expected => renderedQueries.includes(expected.query)
)

describe.runIf(gateEnabled)('the rendered Example Sentences page matches the app', () => {
  test('renders every chosen case', () => {
    expect(exampleSearchCases.map(expected => expected.query).sort()).toEqual(
      [...renderedQueries].sort()
    )
  })

  test.each(exampleSearchCases)('「$query」', async expected => {
    // As data.ts's getSearchExamples reads them, and the examples.json route the rest.
    const query = normalizeSearchQuery(expected.query)
    const service = gateService()
    const found = await service.searchExamples(query)
    const ids = expected.ids ?? []
    // A search without sentences has no page (404), as the app never opens one.
    if (ids.length === 0) {
      expect(found).toBeNull()
      return
    }
    if (!found) throw new Error(`「${query}」 has no Example Sentences`)
    const page = async (from: number) => {
      const answer = from === 0 ? found : await service.searchExamples(query, from)
      if (!answer) throw new Error(`「${query}」 has no examples from ${from}`)
      const linked = serviceLinks(answer.data.slugs, [])
      return {
        examples: answer.data.rows.map(row => pageExample(wordExample(row), linked)),
        pairIds: answer.data.rows.map(row => `esp1_${row.sentence.pairId}`)
      }
    }
    const first = await page(0)
    const data: SearchExamplesData = {
      query: found.data.query,
      listed: found.data.listed,
      truncated: found.data.truncated,
      indexable: searchExamplesIndexable(query, found.data.usesPrimaryEntryExamples),
      examples: first.examples,
      examplesPath: `${searchPath(query)}examples.json?build=${found.build}`
    }
    const html = render(data)
    const rendered = readRenderedExamples(html)

    // The page renders the first 25, then the route serves 25 at a time, each once, in order.
    expect(rendered.map(example => example.position)).toEqual(
      ids.slice(0, examplesPerPage).map((_, position) => position)
    )
    const loaded = [...first.examples]
    const pairIds = [...first.pairIds]
    for (let from = examplesPerPage; from < data.listed; from += examplesPerPage) {
      const next = await page(from)
      loaded.push(...next.examples)
      pairIds.push(...next.pairIds)
    }
    expect(pairIds).toEqual(ids)
    expect(loaded.map(example => example.position)).toEqual(ids.map((_, position) => position))
    expect(visibleText(html)).toContain(ids.length > examplesPerPage ? 'Load more examples' : query)

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
      const wordPage = word.href !== null && !word.href.startsWith('/dictionary/search/')
      if (wordPage && /[㐀-鿿々]/u.test(word.text)) {
        expect(word.furigana, word.text).not.toBe('')
      }
    }
  }, 30_000)
})
