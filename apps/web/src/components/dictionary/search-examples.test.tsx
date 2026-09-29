import { examplesPerPage, wordExample } from '@zenbu/dictionary-core/detail/examples'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PageExample } from '@/lib/dictionary/data'
import { ExampleList } from './example-list'
import { gateEnabled, gateService, recordedCases } from './gate'

// A search's examples page (src/app/dictionary/search/[query]/examples), rendered from what the
// dictionary service answers for every search-results.json case with an Example Sentences row
// (./gate.ts). The suite records the row, not the sentences it opens, so this holds the page to
// the row: it lists as many examples as the row's count promises, the first 25 render with the
// page, and each sentence of a Japanese query's own examples accents the query, as the app's
// ExampleSentencesView does.

interface SuiteCase {
  query: string
  examples?: { title: string; count: number; primaryEntry?: string }
}

const suiteCases = recordedCases<SuiteCase>('search-results.json').filter(
  expected => expected.examples
)

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u

describe.runIf(gateEnabled)('the search examples page matches its Example Sentences row', () => {
  test.each(suiteCases)('「$query」', async expected => {
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
    const html = renderToStaticMarkup(
      <ExampleList initial={examples} listed={listed} path="/examples.json?build=gate" />
    )
    expect(html.match(/<li /g)).toHaveLength(examples.length)

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
