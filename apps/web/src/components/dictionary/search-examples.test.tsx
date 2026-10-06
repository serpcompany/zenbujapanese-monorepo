import { examplesPerPage, wordExample } from '@zenbu/dictionary-core/detail/examples'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PageExample, SearchExamplesData } from '@/lib/dictionary/data'
import { type Links, pageExample, serviceLinks } from '@/lib/dictionary/page-example'
import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import { gateEnabled, gateService, recordedCases } from '@/test/gate'
import { readRenderedExamples, visibleText } from '@/test/rendered'
import { SearchExamplesSection } from './search-results'

const render = (data: SearchExamplesData) =>
  renderToStaticMarkup(<SearchExamplesSection data={data} />)

const links: Links = {
  word: entSeq => (entSeq === null ? null : `/dictionary/w-${entSeq}/`),
  kanji: () => null
}

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

describe('a search’s Example Sentences section', () => {
  test('sits at #examples, titled with its count, and shows each one', () => {
    const html = render({
      query: 'eat',
      listed: 60,
      truncated: false,
      examples: Array.from({ length: 25 }, (_, position) => example(position)),
      examplesPath: '/dictionary/search/eat/examples.json?build=b'
    })
    expect(visibleText(html)).toMatch(/^Example Sentences 60 examples パン/)
    expect(html).toMatch(/^<div[^>]* id="examples"[^>]*data-section="searchExamples"/)
    expect(html).toContain('<h2 class="font-semibold">Example Sentences</h2>')
    const [first, ...rest] = readRenderedExamples(html)
    expect(rest).toHaveLength(24)
    expect(first).toEqual({
      position: 0,
      words: [
        { text: 'パン', furigana: '', href: '/dictionary/w-1049020/', marked: false },
        { text: 'を', furigana: '', href: '/dictionary/search/%E3%82%92/', marked: false },
        { text: '食べた', furigana: '食(た)', href: '/dictionary/w-1358280/', marked: true },
        { text: '。', furigana: '', href: null, marked: false }
      ],
      translation: 'I ate bread.'
    })
    expect(visibleText(html)).toContain('Load more examples')
  })

  test('credits no single sentence, leaving Tatoeba to the page’s Sources', () => {
    const html = render({
      query: 'eat',
      listed: 1,
      truncated: false,
      examples: [example(0)],
      examplesPath: '/dictionary/search/eat/examples.json?build=b'
    })
    expect(visibleText(html)).not.toContain('Tatoeba')
    expect(html).not.toContain('tatoeba.org')
    expect(Object.keys(example(0)).sort()).toEqual([
      'pairId',
      'position',
      'text',
      'tokens',
      'translation'
    ])
  })

  test('says when it lists only the first 100 of more', () => {
    const html = render({
      query: 'the',
      listed: 100,
      truncated: true,
      examples: [example(0)],
      examplesPath: '/dictionary/search/the/examples.json?build=b'
    })
    expect(visibleText(html)).toMatch(/^Example Sentences The first 100 of more than 100 examples/)
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
const exampleSentenceResultCountExactUpTo = 50

describe.runIf(gateEnabled)('a search’s examples match its Example Sentences row', () => {
  test.each(rowCases)('「$query」', async expected => {
    const row = expected.examples
    if (!row) throw new Error('no examples row')
    const found = await gateService().searchExamples(expected.query)
    if (!found) throw new Error(`No examples for ${expected.query}`)
    const { listed, rows } = found.data
    if (row.count > exampleSentenceResultCountExactUpTo) {
      expect(listed).toBeGreaterThan(exampleSentenceResultCountExactUpTo)
    } else expect(listed).toBe(row.count)

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
  }, 30_000)
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

const renderedQueries = ['見る', '食べた', 'miru', 'eat', 'すし', 't*', '^the', 'qzxvkj']

const exampleSearchCases = recordedCases<ExampleSearchCase>('example-search.json').filter(
  expected => renderedQueries.includes(expected.query)
)

describe.runIf(gateEnabled)('the rendered Example Sentences section matches the app', () => {
  test('renders every chosen case', () => {
    expect(exampleSearchCases.map(expected => expected.query).sort()).toEqual(
      [...renderedQueries].sort()
    )
  })

  test.each(exampleSearchCases)('「$query」', async expected => {
    const query = normalizeSearchQuery(expected.query)
    const service = gateService()
    const found = await service.searchExamples(query)
    const ids = expected.ids ?? []
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
      examples: first.examples,
      examplesPath: `${searchPath(query)}examples.json?build=${found.build}`
    }
    const html = render(data)
    const rendered = readRenderedExamples(html)

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
    expect(visibleText(html).includes('Load more examples')).toBe(ids.length > examplesPerPage)

    for (const [index, shown] of (expected.shown ?? []).entries()) {
      const example = rendered[index]
      expect(example.words.map(word => word.text).join('')).toBe(shown.japanese)
      expect(example.words.map(word => word.text)).toEqual(shown.tokens.map(token => token.surface))
      expect(example.words.map(word => word.marked)).toEqual(
        shown.tokens.map(token => token.queryMatch === true)
      )
      expect(example.translation).toBe(shown.english)
    }
    for (const word of rendered.flatMap(example => example.words)) {
      const wordPage = word.href !== null && !word.href.startsWith('/dictionary/search/')
      if (wordPage && /[㐀-鿿々]/u.test(word.text)) {
        expect(word.furigana, word.text).not.toBe('')
      }
    }
  }, 30_000)
})
