import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  jlptKanjiLists,
  jlptLists,
  rankedLists,
  schoolLists
} from '@zenbu/dictionary-core/browse/lists'
import type { Locale } from '../../i18n/config'
import { coreText } from '../../i18n/core-text'
import { getDictionary } from '../../i18n/dictionary'
import { fill } from '../../i18n/format'
import { legalPaths, pageFor, type SitePath } from '../../pages'
import { converterPagesIn, toolsIndexIn } from '../../tools/tool-pages'
import { categoryName } from './category-names'
import { kanjiListHeading, kanjiListName } from './copy'
import {
  browsePath,
  type CategoryIndex,
  categoryIndexes,
  categoryPath,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanaChartsPath,
  kanjiListPath,
  kanjiListsPath,
  rankedListPath,
  scriptPath,
  strokeCountsPath
} from './paths'

export interface TreeNode {
  title: string
  path: string
  children?: TreeNode[]
}

export function homeTreeIn(locale: Locale): TreeNode {
  const page = (path: SitePath): TreeNode => ({ title: pageFor(path, locale).title, path })
  return {
    ...page('/'),
    children: [
      { ...page('/products/'), children: [page('/products/zenbu-japanese-app/')] },
      page('/about/'),
      page('/support/'),
      page('/contact/'),
      page('/sources/'),
      { ...page('/legal/'), children: legalPaths.map(page) },
      page('/sitemap/')
    ]
  }
}

export function toolsTreeIn(locale: Locale): TreeNode {
  const index = toolsIndexIn(locale)
  return {
    title: index.title,
    path: index.path,
    children: converterPagesIn(locale).map(converter => ({
      title: converter.name,
      path: converter.path
    }))
  }
}

export function dictionaryTreeIn(locale: Locale): TreeNode {
  const t = getDictionary(locale).browse
  const indexes = Object.keys(categoryIndexes) as CategoryIndex[]
  return {
    title: pageFor('/dictionary/', locale).title,
    path: '/dictionary/',
    children: [
      {
        title: t.names.browse,
        path: browsePath,
        children: [
          { title: t.names.kanaCharts, path: kanaChartsPath },
          { title: t.names.hiragana, path: scriptPath('hiragana') },
          { title: t.names.katakana, path: scriptPath('katakana') },
          {
            title: t.names.kanjiLists,
            path: kanjiListsPath,
            children: [
              ...schoolLists.map(list => ({
                title: kanjiListName(list, locale),
                path: kanjiListPath(list.slug)
              })),
              ...jlptKanjiLists.map(list => ({
                title: kanjiListHeading(list, locale),
                path: kanjiListPath(list.slug)
              })),
              { title: t.names.byStrokeCount, path: strokeCountsPath }
            ]
          },
          {
            title: t.names.frequency,
            path: frequencyDictionariesPath,
            children: [
              ...jlptLists.map(list => ({
                title: fill(t.frequency.jlptHeading, { name: list.name }),
                path: jlptVocabularyPath(list.level)
              })),
              ...rankedLists.map(list => ({
                title: coreText(list.name, locale),
                path: rankedListPath(list.slug)
              }))
            ]
          },
          ...indexes.map(index => ({
            title: t.categoryIndexes[index].name,
            path: categoryIndexes[index].path
          })),
          { title: categoryName(commonWords, locale), path: categoryPath(commonWords.slug) }
        ]
      }
    ]
  }
}
