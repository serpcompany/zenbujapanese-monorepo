import type {
  ExamplesResponse,
  FormExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse,
  WordSitemap
} from './dictionary'

export const dictionaryContract = 2

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
}

export function answeredContract(answered: string | number | null | undefined): number {
  return Number(answered ?? firstDictionaryContract)
}
