import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  jlptKanjiLists,
  jlptLists,
  rankedLists,
  schoolLists
} from '@zenbu/dictionary-core/browse/lists'
import { legalPages, pageFor, type SitePath } from '../../pages'
import {
  browsePath,
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

const page = (path: SitePath): TreeNode => ({ title: pageFor(path).title, path })

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
            ...schoolLists.map(list => ({ title: list.name, path: kanjiListPath(list.slug) })),
            ...jlptKanjiLists.map(list => ({
              title: `${list.name} kanji`,
              path: kanjiListPath(list.slug)
            })),
            { title: 'By stroke count', path: strokeCountsPath }
          ]
        },
        {
          title: 'Frequency dictionaries',
          path: frequencyDictionariesPath,
          children: [
            ...jlptLists.map(list => ({
              title: `${list.name} vocabulary`,
              path: jlptVocabularyPath(list.level)
            })),
            ...rankedLists.map(list => ({ title: list.name, path: rankedListPath(list.slug) }))
          ]
        },
        ...Object.values(categoryIndexes).map(index => ({ title: index.name, path: index.path })),
        { title: commonWords.name, path: categoryPath(commonWords.slug) }
      ]
    }
  ]
}
