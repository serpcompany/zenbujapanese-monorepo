import type { SegmentationResponse } from '../cards/segmentation'
import type { RadicalFile } from '../search/radicals'
import type {
  BrowseSitemapResponse,
  BrowseSummaryResponse,
  BrowseWordsResponse,
  CategoryCountsResponse,
  KanaIndexResponse,
  KanaInitialResponse,
  KanjiHubResponse,
  KanjiListResponse,
  RankedListsResponse
} from './browse'
import type {
  ExamplesResponse,
  FormExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse,
  WordSitemap
} from './dictionary'
import type { PagesResponse } from './pages'

export const dictionaryContract = 9

export const firstDictionaryContract = 1

export const dictionaryContractHeader = 'X-Dictionary-Contract'

export interface SitemapWord {
  entSeq: number
  slug: string
}

export interface DictionaryContract {
  search: SearchResponse
  searchExamples: SearchExamplesResponse
  word: WordResponse
  wordExamples: ExamplesResponse
  formExamples: FormExamplesResponse
  kanji: KanjiResponse
  wordSitemaps: WordSitemap[]
  sitemapWords: SitemapWord[]
  retired: Record<string, number | null>
  pages: PagesResponse
  browseSummary: BrowseSummaryResponse
  kanaIndex: KanaIndexResponse
  kanaInitial: KanaInitialResponse
  browseWords: BrowseWordsResponse
  browseCategories: CategoryCountsResponse
  rankedLists: RankedListsResponse
  kanjiHub: KanjiHubResponse
  kanjiList: KanjiListResponse
  browseSitemap: BrowseSitemapResponse
  segmentation: SegmentationResponse
  radicals: RadicalFile
}

export function answeredContract(answered: string | number | null | undefined): number {
  return Number(answered ?? firstDictionaryContract)
}
