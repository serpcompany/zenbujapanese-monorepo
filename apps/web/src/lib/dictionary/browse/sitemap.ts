import type { BrowseSitemapResponse } from '@zenbu/dictionary-core/artifact/browse'
import { kanaScriptOf } from '@zenbu/dictionary-core/browse/kana'
import {
  browsePath,
  categoryIndexes,
  categoryPath,
  frequencyDictionariesPath,
  kanaChartsPath,
  kanaPath,
  kanjiListPath,
  kanjiListsPath,
  rankedListPath,
  scriptPath
} from './paths'

const pages = (count: number, pathFor: (page: number) => string) =>
  Array.from({ length: count }, (_, index) => pathFor(index + 1))

export function browseSitemapPaths(sitemap: BrowseSitemapResponse): string[] {
  return [
    browsePath,
    kanaChartsPath,
    scriptPath('hiragana'),
    scriptPath('katakana'),
    kanjiListsPath,
    frequencyDictionariesPath,
    ...Object.values(categoryIndexes).map(index => index.path),
    ...sitemap.kana.flatMap(({ initial, prefixes }) => {
      const script = kanaScriptOf(initial)
      return [
        kanaPath(script, initial),
        ...prefixes.flatMap(({ prefix, pages: count }) =>
          pages(count, page => kanaPath(script, prefix, page))
        )
      ]
    }),
    ...sitemap.categories.flatMap(({ slug, pages: count }) => [
      ...pages(count, page => categoryPath(slug, 'used', page)),
      ...pages(count, page => categoryPath(slug, 'kana', page))
    ]),
    ...sitemap.rankedLists.flatMap(({ slug, pages: count }) =>
      pages(count, page => rankedListPath(slug, page))
    ),
    ...sitemap.kanjiLists.map(kanjiListPath)
  ]
}
