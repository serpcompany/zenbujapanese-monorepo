import type {
  BrowseSitemapResponse,
  BrowseSummaryResponse,
  BrowseWordsResponse,
  CategoryCountsResponse,
  CategoryOrder,
  DictionaryBrowse,
  KanaIndexResponse,
  KanaInitialResponse,
  KanjiHubResponse,
  KanjiListResponse,
  RankedListsResponse
} from '@zenbu/dictionary-core/artifact/browse'
import type { SitemapWord } from '@zenbu/dictionary-core/artifact/contract'
import type {
  Dictionary,
  ExamplesResponse,
  FormExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse,
  WordSitemap
} from '@zenbu/dictionary-core/artifact/dictionary'
import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'

export interface ServiceInfo {
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
  formExamples(form: string, from: number, limit: number): Promise<FormExamplesResponse>
  kanji(character: string): Promise<KanjiResponse | null>
  wordSitemaps(): Promise<WordSitemap[]>
  sitemapWords(number: number, after: number, limit: number): Promise<SitemapWord[] | null>
  retired(): Promise<Record<number, number | null>>
  browseSummary(): Promise<BrowseSummaryResponse>
  kanaIndex(script: KanaScript): Promise<KanaIndexResponse>
  kanaInitial(script: KanaScript, initial: string): Promise<KanaInitialResponse | null>
  kanaWords(script: KanaScript, prefix: string, page: number): Promise<BrowseWordsResponse | null>
  browseCategories(): Promise<CategoryCountsResponse>
  categoryWords(
    slug: string,
    order: CategoryOrder,
    page: number
  ): Promise<BrowseWordsResponse | null>
  rankedLists(): Promise<RankedListsResponse>
  rankedWords(slug: string, page: number): Promise<BrowseWordsResponse | null>
  kanjiHub(): Promise<KanjiHubResponse>
  kanjiList(slug: string): Promise<KanjiListResponse | null>
  browseSitemap(): Promise<BrowseSitemapResponse>
}

export type ServiceMethod = keyof DictionaryService

export function inProcessService(
  dictionary: Dictionary,
  browse: DictionaryBrowse,
  info: ServiceInfo
): DictionaryService {
  return {
    info: async () => info,
    search: query => dictionary.search(query),
    searchExamples: (query, from) => dictionary.searchExamples(query, from),
    word: async entSeq => dictionary.word(entSeq),
    wordExamples: async (entSeq, from) => dictionary.wordExamples(entSeq, from),
    formExamples: async (form, from, limit) => dictionary.formExamples(form, from, limit),
    kanji: async character => dictionary.kanji(character),
    wordSitemaps: async () => dictionary.wordSitemaps(),
    sitemapWords: async (number, after, limit) => {
      const sitemap = dictionary.wordSitemaps().find(candidate => candidate.number === number)
      return sitemap ? dictionary.sitemapWords(sitemap, after, limit) : null
    },
    retired: async () => dictionary.retired(),
    browseSummary: async () => browse.summary(),
    kanaIndex: async script => browse.kanaIndex(script),
    kanaInitial: async (script, initial) => browse.kanaInitial(script, initial),
    kanaWords: async (script, prefix, page) => browse.kanaWords(script, prefix, page),
    browseCategories: async () => browse.categoryCounts(),
    categoryWords: async (slug, order, page) => browse.categoryWords(slug, order, page),
    rankedLists: async () => browse.rankedLists(),
    rankedWords: async (slug, page) => browse.rankedWords(slug, page),
    kanjiHub: async () => browse.kanjiHub(),
    kanjiList: async slug => browse.kanjiList(slug),
    browseSitemap: async () => browse.sitemap()
  }
}
