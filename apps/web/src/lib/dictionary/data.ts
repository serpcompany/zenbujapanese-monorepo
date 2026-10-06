import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  isReadableLength,
  type SearchExamplesResponse
} from '@zenbu/dictionary-core/artifact/dictionary'
import { examplesPerPage, formExample, wordExample } from '@zenbu/dictionary-core/detail/examples'
import { type KanjiWord, kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { FrequencyRow, KanjiRows, WordRows } from '@zenbu/dictionary-core/detail/rows'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  wordDetail
} from '@zenbu/dictionary-core/detail/word'
import { exampleLimit } from '@zenbu/dictionary-core/examples/retrieval'
import {
  fixtureFormExamples,
  fixtureKanjiRows,
  fixtureSearchOrder,
  fixtureWordRows
} from '@zenbu/dictionary-core/fixtures'
import {
  type SearchResultsScreen,
  searchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import type { SearchResults } from '@zenbu/dictionary-core/search/search'
import { cache } from 'react'
import { errorFields, log } from '@/lib/log'
import { isDeployedSite } from '@/lib/site'
import { type Answer, type DictionaryApi, dictionaryApi } from './api'
import type { KanjiDetailsData } from './kanji-details'
import {
  type Linked,
  type Links,
  type PageExample,
  pageExample,
  serviceLinks,
  storedWordPath
} from './page-example'
import { linkSearchScreen, type SearchData } from './results/links'
import { kanjiSearchPath, searchPath, wordPath, wordSlug } from './urls'

export interface WordPageData
  extends Omit<WordDetail, 'alternatives' | 'kanji' | 'alternativeKanji' | 'related' | 'examples'> {
  slug: string
  path: string
  alternatives: Linked<AlternativeForm>[]
  kanji: Linked<WordKanji>[]
  alternativeKanji: Linked<WordKanji>[]
  related: Linked<RelatedWord>[]
  examples: PageExample[]
  examplesPath: string
}

export interface WordPageKanji extends Linked<WordKanji> {
  details: KanjiDetailsData | null
}

export interface WordPageWithKanji extends Omit<WordPageData, 'kanji' | 'alternativeKanji'> {
  kanji: WordPageKanji[]
  alternativeKanji: WordPageKanji[]
}

export interface SearchExamplesData {
  query: string
  examples: PageExample[]
  listed: number
  truncated: boolean
  examplesPath: string
}

export type { PageExample } from './page-example'
export type { SearchData, SearchWord } from './results/links'

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))

const fixtureLinks: Links = {
  word(entSeq) {
    const rows = entSeq === null ? undefined : wordRowsBySeq.get(entSeq)
    return rows ? wordPath(rows.entry) : null
  },
  kanji(character) {
    return character !== null && kanjiRowsByCharacter.has(character)
      ? kanjiSearchPath(character)
      : null
  }
}

export async function dictionaryService(): Promise<DictionaryApi | null> {
  if (process.env.ZENBU_DICTIONARY_FIXTURES === '1' && !isDeployedSite()) return null
  const { env } = await getCloudflareContext({ async: true })
  const api = dictionaryApi(env)
  if (!api && isDeployedSite()) throw new Error('DICTIONARY_API_URL isn’t set')
  return api
}

const fixtureBuild = 'fixtures'

const examplesPath = (entSeq: number, build: string) =>
  `/dictionary/examples/${entSeq}.json?build=${encodeURIComponent(build)}`

const moreSearchExamplesPath = (query: string, build: string) =>
  `${searchPath(query)}examples.json?build=${encodeURIComponent(build)}`

function wordPage(rows: WordRows, slug: string, links: Links, build: string): WordPageData {
  const detail = wordDetail(rows)
  const linkKanji = (kanji: WordKanji) => ({ ...kanji, path: links.kanji(kanji.character) })
  return {
    ...detail,
    slug,
    path: storedWordPath(slug, detail.entSeq),
    alternatives: detail.alternatives.map(form => ({ ...form, path: links.kanji(form.kanji) })),
    kanji: detail.kanji.map(linkKanji),
    alternativeKanji: detail.alternativeKanji.map(linkKanji),
    related: detail.related.map(word => ({ ...word, path: links.word(word.entSeq) })),
    examples: detail.examples.map(example => pageExample(example, links)),
    examplesPath: examplesPath(detail.entSeq, build)
  }
}

function kanjiDetails(rows: KanjiRows, links: Links): KanjiDetailsData {
  const detail = kanjiDetail(rows)
  const linkWord = (word: KanjiWord) => ({ ...word, path: links.word(word.entSeq) })
  return {
    ...detail,
    readings: detail.readings.map(reading => ({ ...reading, words: reading.words.map(linkWord) })),
    components: detail.components.map(component => ({
      character: component,
      path: links.kanji(component)
    })),
    elements: detail.elements.map(element => ({
      ...element,
      path: links.kanji(element.character)
    })),
    words: detail.words.map(linkWord)
  }
}

const getWordRows = cache(async (entSeq: number): Promise<WordPageData | null> => {
  const api = await dictionaryService()
  if (api) {
    const found = await api.word(entSeq)
    if (!found) return null
    const { rows, slug, slugs, kanjiPages } = found.data
    return wordPage(rows, slug, serviceLinks(slugs, kanjiPages), found.build)
  }
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return wordPage(
    { ...rows, examples: rows.examples.slice(0, examplesPerPage) },
    wordSlug(rows.entry.headword, rows.entry.reading),
    fixtureLinks,
    fixtureBuild
  )
})

async function detailsIfAvailable(character: string): Promise<KanjiDetailsData | null> {
  try {
    return await getKanjiDetails(character)
  } catch (error) {
    log('warn', 'kanji_details_unavailable', { character, ...errorFields(error) })
    return null
  }
}

async function withKanjiDetails(kanji: Linked<WordKanji>[]): Promise<WordPageKanji[]> {
  return Promise.all(
    kanji.map(async item => ({ ...item, details: await detailsIfAvailable(item.character) }))
  )
}

export const getWordPage = cache(async (entSeq: number): Promise<WordPageWithKanji | null> => {
  const page = await getWordRows(entSeq)
  if (!page) return null
  const [kanji, alternativeKanji] = await Promise.all([
    withKanjiDetails(page.kanji),
    withKanjiDetails(page.alternativeKanji)
  ])
  return { ...page, kanji, alternativeKanji }
})

export async function getWordExamples(
  entSeq: number,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  const api = await dictionaryService()
  if (api) {
    const found = await api.wordExamples(entSeq, from)
    if (!found || found.build !== build) return null
    const links = serviceLinks(found.data.slugs, [])
    return found.data.rows.map(row => pageExample(wordExample(row), links))
  }
  if (build !== fixtureBuild) return null
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return rows.examples
    .slice(from, from + examplesPerPage)
    .map(row => pageExample(wordExample(row), fixtureLinks))
}

async function formExamplePage(
  surface: string,
  limit: number
): Promise<{ examples: PageExample[]; listed: number; build: string }> {
  const api = await dictionaryService()
  if (api) {
    if (!isReadableLength(surface)) return { examples: [], listed: 0, build: '' }
    const found = await api.formExamples(surface, 0, limit)
    const links = serviceLinks(found.data.slugs, [])
    return {
      examples: found.data.rows.map(row => pageExample(formExample(row), links)),
      listed: found.data.listed,
      build: found.build
    }
  }
  const rows = fixtureFormExamples.get(surface) ?? []
  return {
    examples: rows.slice(0, limit).map(row => pageExample(formExample(row), fixtureLinks)),
    listed: rows.length,
    build: fixtureBuild
  }
}

export async function getConjugationExamples(form: string): Promise<PageExample[]> {
  return (await formExamplePage(form, exampleLimit)).examples
}

export const getKanjiDetails = cache(
  async (character: string): Promise<KanjiDetailsData | null> => {
    const api = await dictionaryService()
    if (api) {
      const found = await api.kanji(character)
      if (!found) return null
      const { rows, slugs, kanjiPages } = found.data
      return kanjiDetails(rows, serviceLinks(slugs, kanjiPages))
    }
    const rows = kanjiRowsByCharacter.get(character)
    return rows ? kanjiDetails(rows, fixtureLinks) : null
  }
)

function searchResults(items: SearchResults['items']): SearchResults {
  return {
    items,
    leadingLexicalEntryCount: items.length,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: items.length > 0
  }
}

function fixtureScreen(query: string): SearchResultsScreen {
  const ordered = Object.hasOwn(fixtureSearchOrder, query) ? fixtureSearchOrder[query] : undefined
  const matches: WordRows[] = ordered
    ? ordered.flatMap(entSeq => wordRowsBySeq.get(entSeq) ?? [])
    : fixtureWordRows.filter(
        ({ entry }) =>
          entry.headword === query ||
          entry.reading === query ||
          entry.summary.toLowerCase().split(/[,;] /).includes(query)
      )
  const results = searchResults(
    matches.map(({ entry }, position) => ({
      entry: { ...entry, sourceRecordId: entry.entSeq },
      sourceOrder: position,
      matchRank: {
        kind: 'japanese',
        relation: 0,
        priorityProfile: { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null },
        senseBreadthRank: 0,
        headwordLength: 0,
        semanticFingerprint: ''
      },
      fallbackOrder: position,
      matchedSummary: null
    }))
  )
  const frequency = new Map<string, FrequencyRow[]>(
    matches.map(rows => [rows.entry.id, rows.frequency])
  )
  return searchResultsScreen(query, results, frequency)
}

export const searchDictionary = cache(async (query: string): Promise<SearchData> => {
  const api = await dictionaryService()
  if (!isReadableLength(query)) return { state: 'noResults', query }
  const screen = api ? (await api.search(query)).data.screen : fixtureScreen(query)
  const kanji =
    screen.state === 'results' && screen.kanji
      ? await detailsIfAvailable(screen.kanji.character)
      : null
  return linkSearchScreen(screen, { dictionaryLoaded: api !== null, kanji })
})

export function searchExamplesData(found: Answer<SearchExamplesResponse>): SearchExamplesData {
  const links = serviceLinks(found.data.slugs, [])
  return {
    query: found.data.query,
    examples: found.data.rows.map(row => pageExample(wordExample(row), links)),
    listed: found.data.listed,
    truncated: found.data.truncated,
    examplesPath: moreSearchExamplesPath(found.data.query, found.build)
  }
}

export const getSearchExamples = cache(
  async (query: string, from = 0, build?: string): Promise<SearchExamplesData | null> => {
    const api = await dictionaryService()
    if (!api || !isReadableLength(query)) return null
    const found = await api.searchExamples(query, from)
    if (!found || (build !== undefined && found.build !== build)) return null
    return searchExamplesData(found)
  }
)
