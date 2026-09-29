import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Slugs } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  type Example,
  type ExampleToken,
  examplesPerPage,
  wordExample
} from '@zenbu/dictionary-core/detail/examples'
import {
  type KanjiDetail,
  type KanjiElement,
  type KanjiReading,
  type KanjiWord,
  kanjiDetail
} from '@zenbu/dictionary-core/detail/kanji'
import type { FrequencyRow, KanjiRows, WordRows } from '@zenbu/dictionary-core/detail/rows'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  wordDetail
} from '@zenbu/dictionary-core/detail/word'
import {
  fixtureKanjiRows,
  fixtureSearchOrder,
  fixtureWordRows
} from '@zenbu/dictionary-core/fixtures'
import {
  isSingleKanji,
  type SearchResultsScreen,
  searchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import type { SearchResults } from '@zenbu/dictionary-core/search/search'
import { cache } from 'react'
import { isDeployedSite } from '@/lib/site'
import { type DictionaryApi, dictionaryApi } from './api'
import { linkSearchScreen, type SearchData } from './results/links'
import { hasSearchPath, kanjiPath, searchPath, wordPath, wordSlug } from './urls'

// Pages read the dictionary only through this module. It runs the detail core over the rows the
// dictionary service answers with (./api.ts, ADR 0009) and adds only the site's URLs. Only local
// development without a service (no DICTIONARY_API_URL, as in `pnpm dev` by default) falls back to
// fixtures; staging and production, which serve the dictionary, never do.

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

/** An example's word with where it links: its word page, or a search for an ambiguous word. */
export type PageExampleToken = Linked<ExampleToken>

export interface PageExample extends Omit<Example, 'tokens'> {
  tokens: PageExampleToken[]
}

export interface WordPageData
  extends Omit<WordDetail, 'alternatives' | 'kanji' | 'alternativeKanji' | 'related' | 'examples'> {
  /** Where the word's page lives now; a request under another slug redirects here. */
  slug: string
  path: string
  alternatives: Linked<AlternativeForm>[]
  kanji: Linked<WordKanji>[]
  alternativeKanji: Linked<WordKanji>[]
  related: Linked<RelatedWord>[]
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  examplesPath: string
}

export interface KanjiPageData
  extends Omit<KanjiDetail, 'readings' | 'components' | 'elements' | 'words'> {
  readings: (Omit<KanjiReading, 'words'> & { words: Linked<KanjiWord>[] })[]
  components: Linked<{ character: string }>[]
  elements: Linked<KanjiElement>[]
  words: Linked<KanjiWord>[]
  /** A kanji with no meanings or readings stays out of search engines (#465). */
  indexable: boolean
}

/** What a search's Example Sentences row opens (`/dictionary/search/<query>/examples/`). */
export interface SearchExamplesData {
  query: string
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  /** How many there are, at most 100, and whether more matched than are listed. */
  listed: number
  truncated: boolean
  examplesPath: string
}

export type { SearchData, SearchWord } from './results/links'

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))

/** Where a page's links go: a path, or null for a word or kanji without a page. */
interface Links {
  word(entSeq: number | null): string | null
  kanji(character: string | null): string | null
}

/** The fixtures' links: only fixture words and kanji have pages. */
const fixtureLinks: Links = {
  word(entSeq) {
    const rows = entSeq === null ? undefined : wordRowsBySeq.get(entSeq)
    return rows ? wordPath(rows.entry) : null
  },
  kanji(character) {
    return character !== null && kanjiRowsByCharacter.has(character) ? kanjiPath(character) : null
  }
}

/** A word page's path, under its slug. */
const storedWordPath = (slug: string, entSeq: number) => `/dictionary/${slug}-${entSeq}/`

/** Links from a service answer, which names the slug of every word it links to. */
function serviceLinks(slugs: Slugs, kanjiPages: readonly string[]): Links {
  const pages = new Set(kanjiPages)
  return {
    word(entSeq) {
      const slug = entSeq === null ? undefined : slugs[entSeq]
      return entSeq === null || slug === undefined ? null : storedWordPath(slug, entSeq)
    },
    kanji(character) {
      return character !== null && pages.has(character) ? kanjiPath(character) : null
    }
  }
}

/**
 * The dictionary service, or null when local development runs without one. Staging and
 * production (`SITE_ENV` set) always name one, so there a missing service fails the request
 * rather than passing fixtures off as the dictionary.
 */
export async function dictionaryService(): Promise<DictionaryApi | null> {
  const { env } = await getCloudflareContext({ async: true })
  const api = dictionaryApi(env)
  if (!api && isDeployedSite()) throw new Error('DICTIONARY_API_URL isn’t set')
  return api
}

const fixtureBuild = 'fixtures'

/**
 * Where a page loads more of a word's examples (src/app/dictionary/examples), for the build the
 * page came from, so a page never mixes its first examples with another build's next ones.
 */
export const examplesPath = (entSeq: number, build: string) =>
  `/dictionary/examples/${entSeq}.json?build=${encodeURIComponent(build)}`

/**
 * Where a search's examples page loads more of them (src/app/dictionary/search/[query]/
 * examples.json), for the build the page came from.
 */
export const moreSearchExamplesPath = (query: string, build: string) =>
  `${searchPath(query)}examples.json?build=${encodeURIComponent(build)}`

/** An example with its links: a word to its page, an ambiguous word to a search for it. */
function pageExample(example: Example, links: Links): PageExample {
  return {
    ...example,
    tokens: example.tokens.map(token => ({
      ...token,
      path: !token.link
        ? null
        : 'entSeq' in token.link
          ? links.word(token.link.entSeq)
          : hasSearchPath(token.link.query)
            ? searchPath(token.link.query)
            : null
    }))
  }
}

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

function kanjiPage(rows: KanjiRows, indexable: boolean, links: Links): KanjiPageData {
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
    words: detail.words.map(linkWord),
    indexable
  }
}

/**
 * A failing service throws, so the request fails rather than rendering a 404. Memoized per
 * request, so the page and its metadata ask once.
 */
export const getWordPage = cache(async (entSeq: number): Promise<WordPageData | null> => {
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

/**
 * `examplesPerPage` of a word's examples from position `from`, as its page loads more; null for
 * an unknown word, or when `build` isn't the build that answers now (the page is from an earlier
 * deploy). A failing service throws.
 */
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

/** Memoized per request, like getWordPage. */
export const getKanjiPage = cache(async (character: string): Promise<KanjiPageData | null> => {
  const api = await dictionaryService()
  if (api) {
    const found = await api.kanji(character)
    if (!found) return null
    const { rows, indexable, slugs, kanjiPages } = found.data
    return kanjiPage(rows, indexable, serviceLinks(slugs, kanjiPages))
  }
  const rows = kanjiRowsByCharacter.get(character)
  if (!rows) return null
  const { meanings, readings } = rows.kanji
  return kanjiPage(rows, meanings.length > 0 || readings.length > 0, fixtureLinks)
})

/** Results as the search core returns them, for `searchResultsScreen`. */
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

/**
 * The fixtures' results, in the order the app lists them (`fixtureSearchOrder`), with their
 * frequency. Each is its own match group, so the re-sort keeps that order.
 */
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

/**
 * The search results screen with its links: every word links to its page, and a one-kanji
 * query's kanji row to the kanji's; on fixtures, only fixture words and kanji. Memoized per
 * request, so the page and its metadata search once.
 */
export const searchDictionary = cache(async (query: string): Promise<SearchData> => {
  const api = await dictionaryService()
  if (api) {
    const { screen, kanjiHasPage } = (await api.search(query)).data
    return linkSearchScreen(screen, { dictionaryLoaded: true, kanjiHasPage })
  }
  const kanjiHasPage = isSingleKanji(query) && kanjiRowsByCharacter.has(query)
  return linkSearchScreen(fixtureScreen(query), { dictionaryLoaded: false, kanjiHasPage })
})

/**
 * What a search's Example Sentences row opens, from position `from`: the primary entry's
 * examples for a romaji or deinflected query, otherwise the sentences containing the query.
 * Null without any, or on fixtures, which hold no example search. Memoized per request.
 */
export const getSearchExamples = cache(
  async (query: string, from = 0, build?: string): Promise<SearchExamplesData | null> => {
    const api = await dictionaryService()
    if (!api) return null
    const found = await api.searchExamples(query, from)
    if (!found || (build !== undefined && found.build !== build)) return null
    const links = serviceLinks(found.data.slugs, [])
    return {
      query: found.data.query,
      examples: found.data.rows.map(row => pageExample(wordExample(row), links)),
      listed: found.data.listed,
      truncated: found.data.truncated,
      examplesPath: moreSearchExamplesPath(found.data.query, found.build)
    }
  }
)

/**
 * A conjugated form's examples (the app's ConjugatedFormView): the first 100 sentences containing
 * the form in which it is one word, accenting it. Empty on fixtures.
 */
export async function getConjugationExamples(form: string): Promise<PageExample[]> {
  const api = await dictionaryService()
  if (!api) return []
  const found = await api.conjugationExamples(form)
  const links = serviceLinks(found.data.slugs, [])
  return found.data.rows.map(row => pageExample(wordExample(row), links))
}
