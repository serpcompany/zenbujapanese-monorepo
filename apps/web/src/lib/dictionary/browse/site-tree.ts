import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  gradeLists,
  jinmeiyo,
  jlptLists,
  rankedLists,
  secondarySchool
} from '@zenbu/dictionary-core/browse/lists'
import { legalPages, sitePages } from '../../pages'
import {
  browsePath,
  categoryIndexes,
  categoryPath,
  frequencyDictionariesPath,
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

const page = (path: string): TreeNode => {
  const found = sitePages.find(candidate => candidate.path === path)
  if (!found) throw new Error(`Unknown page: ${path}`)
  return { title: found.title, path }
}

export const homeTree: TreeNode = {
  ...page('/'),
  children: [
    page('/about/'),
    page('/support/'),
    page('/contact/'),
    page('/sources/'),
    { ...page('/legal/'), children: legalPages.map(legal => page(legal.path)) },
    page('/sitemap/')
  ]
}

export const dictionaryTree: TreeNode = {
  title: 'Japanese dictionary',
  path: '/dictionary/',
  children: [
    {
      title: 'Browse',
      path: browsePath,
      children: [
        { title: 'Kana charts', path: kanaChartsPath },
        { title: 'Hiragana', path: scriptPath('hiragana') },
        { title: 'Katakana', path: scriptPath('katakana') },
        {
          title: 'Kanji lists',
          path: kanjiListsPath,
          children: [
            ...[...gradeLists, secondarySchool, jinmeiyo].map(list => ({
              title: list.name,
              path: kanjiListPath(list.slug)
            })),
            { title: 'By stroke count', path: strokeCountsPath }
          ]
        },
        {
          title: 'Frequency dictionaries',
          path: frequencyDictionariesPath,
          children: [...jlptLists, ...rankedLists].map(list => ({
            title: list.name,
            path: rankedListPath(list.slug)
          }))
        },
        ...Object.values(categoryIndexes).map(index => ({ title: index.name, path: index.path })),
        { title: commonWords.name, path: categoryPath(commonWords.slug) }
      ]
    }
  ]
}
