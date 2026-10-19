import { wordSlug } from '@zenbu/dictionary-core/detail/slug'
import { fixtureKanjiRows, fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { fixtureQueries } from '@/test/core-labels'
import { englishLeftIn, withoutEnglishSource, withoutScripts } from '@/test/japanese-text'
import { htmlText } from '@/test/rendered'
import WordPage from './[word]/page'
import SearchResultsPage from './search/[query]/page'
import SearchIndexPage from './search/page'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))

const sourceData = [
  ...fixtureWordRows.flatMap(({ entry, kanji }) => [
    entry.summary,
    ...entry.senses.map(sense => sense.meaning),
    ...entry.senses.flatMap(sense => sense.notes),
    ...entry.relationships.map(relationship => relationship.summary),
    ...kanji.flatMap(gloss => gloss.meanings)
  ]),
  ...fixtureKanjiRows.flatMap(rows => [
    ...rows.kanji.meanings,
    ...rows.words.map(word => word.summary),
    ...rows.elements.flatMap(element => element.meanings)
  ])
].flatMap(text => [text, ...text.split(', ')])

const labelled = /\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g

function englishOn(html: string, data: readonly string[]): string[] {
  const shown = withoutEnglishSource(withoutScripts(html))
  const text = englishLeftIn(htmlText(shown), data)
  const labels = [...shown.matchAll(labelled)].flatMap(([, label]) => {
    const left = englishLeftIn(htmlText(label), [...data, ...sourceData])
    return left === null ? [] : [label]
  })
  return [...(text === null ? [] : [text]), ...labels]
}

const wordSegments = fixtureWordRows.map(
  ({ entry }) => `${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}`
)

const japanese = <Params,>(params: Params) => ({
  params: Promise.resolve({ locale: 'ja', ...params }),
  searchParams: Promise.resolve({})
})

describe('the Japanese dictionary pages leave no English but source data and names', () => {
  test.each(wordSegments)('the word page %s', async word => {
    const html = renderToStaticMarkup(await WordPage(japanese({ word })))
    expect(englishOn(html, [])).toEqual([])
  })

  test.each(fixtureQueries)('the search page for %s', async query => {
    const html = renderToStaticMarkup(
      await SearchResultsPage(japanese({ query: encodeURIComponent(query) }))
    )
    expect(englishOn(html, [query])).toEqual([])
  })

  test('the search page', async () => {
    const html = renderToStaticMarkup(await SearchIndexPage(japanese({})))
    expect(englishOn(html, [])).toEqual([])
  })
})
