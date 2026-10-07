import type { KanaScript } from './kana'

export type BrowseAnswer =
  | 'browseSummary'
  | 'kanaIndex'
  | 'kanaInitial'
  | 'browseWords'
  | 'browseCategories'
  | 'rankedLists'
  | 'kanjiHub'
  | 'kanjiList'
  | 'browseSitemap'

export interface BrowsePath<Name extends BrowseAnswer> {
  answer: Name
  path: string
}

const at = <Name extends BrowseAnswer>(answer: Name, path: string): BrowsePath<Name> => ({
  answer,
  path
})

const segment = encodeURIComponent

export const browseService = {
  summary: () => at('browseSummary', '/v1/browse'),
  kanaIndex: (script: KanaScript) => at('kanaIndex', `/v1/browse/kana/${script}`),
  kanaInitial: (script: KanaScript, initial: string) =>
    at('kanaInitial', `/v1/browse/kana/${script}/${segment(initial)}`),
  kanaWords: (script: KanaScript, prefix: string, page: number) => {
    const [initial] = Array.from(prefix)
    return at(
      'browseWords',
      `/v1/browse/kana/${script}/${segment(initial)}/${segment(prefix)}?page=${page}`
    )
  },
  categories: () => at('browseCategories', '/v1/browse/categories'),
  categoryWords: (slug: string, order: 'used' | 'kana', page: number) =>
    at(
      'browseWords',
      `/v1/browse/categories/${segment(slug)}?${order === 'kana' ? 'order=kana&' : ''}page=${page}`
    ),
  rankedLists: () => at('rankedLists', '/v1/browse/ranked'),
  rankedWords: (slug: string, page: number) =>
    at('browseWords', `/v1/browse/ranked/${segment(slug)}?page=${page}`),
  kanjiHub: () => at('kanjiHub', '/v1/browse/kanji'),
  kanjiList: (slug: string) => at('kanjiList', `/v1/browse/kanji/${segment(slug)}`),
  sitemap: () => at('browseSitemap', '/v1/sitemaps/browse')
}
