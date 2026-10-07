import type { BrowseSitemapResponse } from '@zenbu/dictionary-core/artifact/browse'
import { kanaScriptOf } from '@zenbu/dictionary-core/browse/kana'
import { jlptList, minimumIndexedWords, pageCount } from '@zenbu/dictionary-core/browse/lists'
import {
  browsePath,
  categoryIndexes,
  categoryPath,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanaChartsPath,
  kanaPath,
  kanjiListPath,
  kanjiListsPath,
  rankBandPath,
  scriptPath
} from './paths'

const pages = (count: number, pathFor: (page: number) => string) =>
  Array.from({ length: pageCount(count) }, (_, index) => pathFor(index + 1))

const indexed = ({ count }: { count: number }) => count >= minimumIndexedWords

export function browseSitemapPaths(sitemap: BrowseSitemapResponse): string[] {
  return [
    browsePath,
    kanaChartsPath,
    scriptPath('hiragana'),
    scriptPath('katakana'),
    kanjiListsPath,
    frequencyDictionariesPath,
    ...Object.values(categoryIndexes).map(index => index.path),
    ...sitemap.kana.flatMap(initial => {
      const script = kanaScriptOf(initial.initial)
      return [
        ...(indexed(initial) ? [kanaPath(script, initial.initial)] : []),
        ...initial.prefixes
          .filter(indexed)
          .flatMap(({ kana, count }) => pages(count, page => kanaPath(script, kana, page)))
      ]
    }),
    ...sitemap.categories
      .filter(indexed)
      .flatMap(({ slug, count }) => pages(count, page => categoryPath(slug, 'used', page))),
    ...sitemap.rankedLists.flatMap(({ slug, bands }) =>
      bands.flatMap((count, index) => (indexed({ count }) ? [rankBandPath(slug, index + 1)] : []))
    ),
    ...sitemap.jlptLists.filter(indexed).flatMap(({ slug, count }) => {
      const level = jlptList(slug)?.level
      return level === undefined ? [] : pages(count, page => jlptVocabularyPath(level, page))
    }),
    ...sitemap.kanjiLists.filter(indexed).map(({ slug }) => kanjiListPath(slug))
  ]
}
