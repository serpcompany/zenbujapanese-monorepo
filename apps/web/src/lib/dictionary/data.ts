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
import { exampleLimit } from '@zenbu/dictionary-core/examples/retrieval'
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
  conjugationsPath: string | null
}

export interface ConjugationWordData {
  entSeq: number
  slug: string
  headword: string
  reading: string
  summary: string
  partOfSpeech: string
  ruby: RubySegment[]
  pitch: PitchAccent | null
  path: string
  conjugationsPath: string
}

export interface ConjugationsPageData extends ConjugationWordData {
  conjugations: Conjugations
}

export interface ConjugatedFormPageData extends ConjugationWordData {
  mode: ConjugationMode
  row: ConjugationRow
  formPath: string
  canonicalPath: string
  examples: PageExample[]
  listed: number
  examplesPath: string
}

export interface KanjiPageData
  extends Omit<KanjiDetail, 'readings' | 'components' | 'elements' | 'words'> {
  readings: (Omit<KanjiReading, 'words'> & { words: Linked<KanjiWord>[] })[]
  components: Linked<{ character: string }>[]
  elements: Linked<KanjiElement>[]
  words: Linked<KanjiWord>[]
  indexable: boolean
}

export interface SearchExamplesData {
  query: string
  examples: PageExample[]
  listed: number
  truncated: boolean
  indexable: boolean
  examplesPath: string
}

export type { PageExample, PageExampleToken } from './page-example'
export type { SearchData, SearchWord } from './results/links'

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))

const fixtureLinks: Links = {
  word(entSeq) {
    const rows = entSeq === null ? undefined : wordRowsBySeq.get(entSeq)
    return rows ? wordPath(rows.entry) : null
  },
  kanji(character) {
    return character !== null && kanjiRowsByCharacter.has(character) ? kanjiPath(character) : null
  }
}

export async function dictionaryService(): Promise<DictionaryApi | null> {
  const { env } = await getCloudflareContext({ async: true })
  const api = dictionaryApi(env)
  if (!api && isDeployedSite()) throw new Error('DICTIONARY_API_URL isn’t set')
  return api
}

const fixtureBuild = 'fixtures'

export const examplesPath = (entSeq: number, build: string) =>
  `/dictionary/examples/${entSeq}.json?build=${encodeURIComponent(build)}`

export const moreSearchExamplesPath = (query: string, build: string) =>
  `${searchPath(query)}examples.json?build=${encodeURIComponent(build)}`

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

export async function getFormExamples(
  surface: string,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  const found = await formExamplePage(surface, from, examplesPerPage)
  return found.build === build ? found.examples : null
}

export async function getConjugationExamples(form: string): Promise<PageExample[]> {
  return (await formExamplePage(form, 0, exampleLimit)).examples
}

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
  if (api) {
    const { screen, kanjiHasPage } = (await api.search(query)).data
    return linkSearchScreen(screen, { dictionaryLoaded: true, kanjiHasPage })
  }
  const kanjiHasPage = isSingleKanji(query) && kanjiRowsByCharacter.has(query)
  return linkSearchScreen(fixtureScreen(query), { dictionaryLoaded: false, kanjiHasPage })
})

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

export const searchExamplesIndexable = (query: string, usesPrimaryEntryExamples: boolean) =>
  !isASCII(normalizeQuery(query)) && !usesPrimaryEntryExamples
