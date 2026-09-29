// What the HTTP layer asks of the dictionary: the core's `Dictionary`, asynchronous so that it
// can run in worker threads (./pool.ts), and loaded from the app's files (./load.ts).

import type {
  Dictionary,
  ExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse,
  WordSitemap
} from '@zenbu/dictionary-core/artifact/dictionary'

/** Which data and code answer: the artifact, and the build the service runs. */
export interface ServiceInfo {
  /** Names this build of the data and code, for pages that must not mix builds. */
  build: string
  artifact: { name: string; sha256: string }
  features: { sentenceSearch: boolean }
}

export interface DictionaryService {
  info(): Promise<ServiceInfo>
  search(query: string): Promise<SearchResponse>
  searchExamples(query: string, from: number): Promise<SearchExamplesResponse | null>
  word(entSeq: number): Promise<WordResponse | null>
  wordExamples(entSeq: number, from: number): Promise<ExamplesResponse | null>
  conjugationExamples(form: string): Promise<ExamplesResponse>
  kanji(character: string): Promise<KanjiResponse | null>
  wordSitemaps(): Promise<WordSitemap[]>
  sitemapWords(
    number: number,
    after: number,
    limit: number
  ): Promise<{ entSeq: number; slug: string }[] | null>
  indexableKanji(): Promise<string[]>
  retired(): Promise<Record<number, number | null>>
}

export type ServiceMethod = keyof DictionaryService

/** The service over a dictionary in this thread. */
export function inProcessService(dictionary: Dictionary, info: ServiceInfo): DictionaryService {
  return {
    info: async () => info,
    search: query => dictionary.search(query),
    searchExamples: (query, from) => dictionary.searchExamples(query, from),
    word: async entSeq => dictionary.word(entSeq),
    wordExamples: async (entSeq, from) => dictionary.wordExamples(entSeq, from),
    conjugationExamples: async form => dictionary.conjugationExamples(form),
    kanji: async character => dictionary.kanji(character),
    wordSitemaps: async () => dictionary.wordSitemaps(),
    sitemapWords: async (number, after, limit) => {
      const sitemap = dictionary.wordSitemaps().find(candidate => candidate.number === number)
      return sitemap ? dictionary.sitemapWords(sitemap, after, limit) : null
    },
    indexableKanji: async () => dictionary.indexableKanji(),
    retired: async () => dictionary.retired()
  }
}
