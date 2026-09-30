import { getCloudflareContext } from '@opennextjs/cloudflare'
import { isReadableLength } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  canonicalForm
} from '@zenbu/dictionary-core/detail/conjugation'
import { examplesPerPage, formExample, wordExample } from '@zenbu/dictionary-core/detail/examples'
import {
  type KanjiDetail,
  type KanjiElement,
  type KanjiReading,
  type KanjiWord,
  kanjiDetail
} from '@zenbu/dictionary-core/detail/kanji'
import type { PitchAccent } from '@zenbu/dictionary-core/detail/pitch'
import type { FrequencyRow, KanjiRows, WordRows } from '@zenbu/dictionary-core/detail/rows'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  wordDetail
} from '@zenbu/dictionary-core/detail/word'
import {
  fixtureFormExamples,
  fixtureKanjiRows,
  fixtureSearchOrder,
  fixtureWordRows
} from '@zenbu/dictionary-core/fixtures'
import {
  isSingleKanji,
  type SearchResultsScreen,
  searchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { isASCII, normalizeQuery } from '@zenbu/dictionary-core/search/query'
import type { SearchResults } from '@zenbu/dictionary-core/search/search'
import { cache } from 'react'
import { isDeployedSite } from '@/lib/site'
import { type DictionaryApi, dictionaryApi } from './api'
import {
  type Linked,
  type Links,
  type PageExample,
  pageExample,
  serviceLinks,
  storedWordPath
} from './page-example'
import { linkSearchScreen, type SearchData } from './results/links'
import {
  conjugatedFormPath,
  conjugationsPath,
  kanjiPath,
  searchPath,
  wordPath,
  wordSlug
} from './urls'

// Pages read the dictionary only through this module. It runs the detail core over the rows the
// dictionary service answers with (./api.ts, ADR 0009) and adds only the site's URLs. Only local
// development without a service (no DICTIONARY_API_URL, as in `pnpm dev` by default) falls back to
// fixtures; staging and production, which serve the dictionary, never do.

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
  /** The conjugation table's page, which the part of speech's sheet links to; null without one. */
  conjugationsPath: string | null
}

/** A word as its conjugation screens show it: the headline, meaning, and word class. */
export interface ConjugationWordData {
  entSeq: number
  /** The slug the word's pages live under; another redirects. */
  slug: string
  headword: string
  reading: string
  summary: string
  partOfSpeech: string
  ruby: RubySegment[]
  pitch: PitchAccent | null
  /** The word's page, and its conjugation table's. */
  path: string
  conjugationsPath: string
}

/** The conjugation table's page (ConjugationsView). */
export interface ConjugationsPageData extends ConjugationWordData {
  conjugations: Conjugations
}

/** A conjugated form's page (ConjugatedFormView). */
export interface ConjugatedFormPageData extends ConjugationWordData {
  mode: ConjugationMode
  row: ConjugationRow
  /** Where the form's page lives, and the page search engines should index for it. */
  formPath: string
  canonicalPath: string
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  /** How many examples the form lists, at most 100. */
  listed: number
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
  /** Whether search engines may index it (`searchExamplesIndexable`). */
  indexable: boolean
  examplesPath: string
}

export type { PageExample, PageExampleToken } from './page-example'
export type { SearchData, SearchWord } from './results/links'

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))

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

/** Where a conjugated form's page loads more of its examples, by the form's spelling. */
export const formExamplesPath = (surface: string, build: string) =>
  `/dictionary/examples/forms/${encodeURIComponent(surface)}.json?build=${encodeURIComponent(build)}`

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
    examplesPath: examplesPath(detail.entSeq, build),
    conjugationsPath: detail.conjugations
      ? conjugationsPath(storedWordPath(slug, detail.entSeq))
      : null
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

/** A word's conjugation screens' rows, without examples, and its slug; null without a table. */
async function conjugationWord(entSeq: number): Promise<{ rows: WordRows; slug: string } | null> {
  const api = await dictionaryService()
  if (api) return (await api.conjugationWord(entSeq))?.data ?? null
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return {
    rows: { ...rows, examples: [], exampleCount: null },
    slug: wordSlug(rows.entry.headword, rows.entry.reading)
  }
}

/**
 * The conjugation table's page (ConjugationsView), which the part of speech's sheet links to;
 * null for an unknown word or one whose part of speech opens none. Memoized per request, like
 * getWordPage.
 */
export const getConjugationsPage = cache(
  async (entSeq: number): Promise<ConjugationsPageData | null> => {
    const word = await conjugationWord(entSeq)
    if (!word) return null
    const detail = wordDetail(word.rows)
    if (!detail.conjugations) return null
    const path = storedWordPath(word.slug, detail.entSeq)
    return {
      entSeq: detail.entSeq,
      slug: word.slug,
      headword: detail.headword,
      reading: detail.reading,
      summary: detail.summary,
      partOfSpeech: detail.partOfSpeech,
      ruby: detail.ruby,
      pitch: detail.pitch,
      path,
      conjugationsPath: conjugationsPath(path),
      conjugations: detail.conjugations
    }
  }
)

/**
 * A conjugated form's page (ConjugatedFormView) and its first examples; null for an unknown
 * word, a word without a table, or a register or kind its table lacks. Memoized per request.
 */
export const getConjugatedFormPage = cache(
  async (
    entSeq: number,
    mode: ConjugationMode,
    kind: string
  ): Promise<ConjugatedFormPageData | null> => {
    const page = await getConjugationsPage(entSeq)
    if (!page?.conjugations.modes.includes(mode)) return null
    const row = page.conjugations.rows[mode].find(form => form.kind === kind)
    if (!row) return null
    const { conjugations, ...word } = page
    const canonical = canonicalForm(
      {
        plain: conjugations.rows.Plain,
        polite: conjugations.modes.includes('Polite') ? conjugations.rows.Polite : []
      },
      mode,
      row
    )
    const found = await formExamplePage(row.surface, 0, examplesPerPage)
    return {
      ...word,
      mode,
      row,
      formPath: conjugatedFormPath(page.path, mode, row.kind),
      canonicalPath: conjugatedFormPath(page.path, canonical.mode, canonical.kind),
      examples: found.examples,
      listed: found.listed,
      examplesPath: formExamplesPath(row.surface, found.build)
    }
  }
)

/**
 * `limit` of a conjugated form's examples from `from`, linked, with how many it lists and the
 * build that answered. A form past the service's query limit lists none.
 */
async function formExamplePage(
  surface: string,
  from: number,
  limit: number
): Promise<{ examples: PageExample[]; listed: number; build: string }> {
  const api = await dictionaryService()
  if (api) {
    if (!isReadableLength(surface)) return { examples: [], listed: 0, build: '' }
    const found = await api.formExamples(surface, from, limit)
    const links = serviceLinks(found.data.slugs, [])
    return {
      examples: found.data.rows.map(row => pageExample(formExample(row), links)),
      listed: found.data.listed,
      build: found.build
    }
  }
  const rows = fixtureFormExamples.get(surface) ?? []
  return {
    examples: rows
      .slice(from, from + limit)
      .map(row => pageExample(formExample(row), fixtureLinks)),
    listed: rows.length,
    build: fixtureBuild
  }
}

/**
 * `examplesPerPage` of a conjugated form's examples from position `from`, by the form's
 * spelling, as its page loads more; null when `build` isn't the build that answers now. A failing
 * service throws.
 */
export async function getFormExamples(
  surface: string,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  const found = await formExamplePage(surface, from, examplesPerPage)
  return found.build === build ? found.examples : null
}

/**
 * All of a conjugated form's examples, at most 100, as the word page's conjugations sheet lists
 * them when the form opens.
 */
export async function getConjugationExamples(form: string): Promise<PageExample[]> {
  return (await formExamplePage(form, 0, 100)).examples
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
  // Past the service's limit (`maximumQueryLength`), a query finds nothing.
  if (!isReadableLength(query)) return { state: 'noResults', query }
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
 * Null without any, which the app never opens, so the page answers 404; and on fixtures, which
 * hold no example search. Memoized per request.
 */
export const getSearchExamples = cache(
  async (query: string, from = 0, build?: string): Promise<SearchExamplesData | null> => {
    const api = await dictionaryService()
    if (!api || !isReadableLength(query)) return null
    const found = await api.searchExamples(query, from)
    if (!found || (build !== undefined && found.build !== build)) return null
    const links = serviceLinks(found.data.slugs, [])
    return {
      query: found.data.query,
      examples: found.data.rows.map(row => pageExample(wordExample(row), links)),
      listed: found.data.listed,
      truncated: found.data.truncated,
      indexable: searchExamplesIndexable(query, found.data.usesPrimaryEntryExamples),
      examplesPath: moreSearchExamplesPath(found.data.query, found.build)
    }
  }
)

/**
 * Whether search engines may index a search's Example Sentences page: only a direct Japanese
 * search's, by the owner's decision on #511. A romaji or deinflected search lists its primary
 * entry's examples, which that entry's word page already has.
 */
export const searchExamplesIndexable = (query: string, usesPrimaryEntryExamples: boolean) =>
  !isASCII(normalizeQuery(query)) && !usesPrimaryEntryExamples
