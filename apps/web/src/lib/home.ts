import { type AppScreenshot, appScreenshots } from '@/lib/app-screenshots'
import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import { type Source, sources } from '@/lib/dictionary/sources'
import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import type { MenuSymbol } from '@/lib/site-menus'

export const homeTitle = 'Zenbu Japanese: Japanese Dictionary and Translator for iPhone'

const exampleSearch = (query: string, lang: 'ja' | 'en') => ({
  query,
  lang,
  path: searchPath(normalizeSearchQuery(query))
})

export const exampleSearches = [
  exampleSearch('大丈夫', 'ja'),
  exampleSearch('taberu', 'en'),
  exampleSearch('峠', 'ja'),
  exampleSearch('to persevere', 'en')
]

export type AppFeatureId = 'image-search' | 'handwriting' | 'dictionary' | 'translate'

export interface AppFeature {
  id: AppFeatureId
  name: string
  title: string
  body: string
  screenshot: AppScreenshot
  shows: 'top' | 'bottom'
}

export const appFeatures: readonly AppFeature[] = [
  {
    id: 'image-search',
    name: 'Image Search',
    title: 'Point at Japanese. Tap any word.',
    body: 'Take a photo of a menu, a sign, or a page from a book, or choose one you already have. Zenbu reads the Japanese, across or down the page, and any word you tap opens in the dictionary. Switch to Translate for the whole passage.',
    screenshot: appScreenshots.imageSearch,
    shows: 'top'
  },
  {
    id: 'handwriting',
    name: 'Handwriting',
    title: 'Draw a kanji you can’t type',
    body: 'Write it in any stroke order: Zenbu reads the finished shape and lists the kanji it could be. Or find it by its radicals.',
    screenshot: appScreenshots.handwriting,
    shows: 'bottom'
  },
  {
    id: 'dictionary',
    name: 'Dictionary',
    title: 'Every word, fully explained',
    body: 'Furigana and pitch accent, and how common a word is, from JLPT levels to YouTube and anime. Every conjugation with what it means, each kanji with its readings and stroke order, and example sentences.',
    screenshot: appScreenshots.conjugations,
    shows: 'top'
  },
  {
    id: 'translate',
    name: 'Translate',
    title: 'Talk it through, live',
    body: 'Two people share one iPhone and speak Japanese or English, in any order. What each says appears as it’s spoken, with its translation under it, and the translation is read aloud when they pause. It all runs on the iPhone, so after a one-time download it works without a connection.',
    screenshot: appScreenshots.translate,
    shows: 'top'
  }
]

export type AppExtraId = 'player' | 'lists' | 'frequency' | 'furigana'

export const appExtras: Record<AppExtraId, { title: string; body: string }> = {
  player: {
    title: 'Watch YouTube in Japanese',
    body: 'The Japanese captions sit under the video, and every word in them opens the dictionary. Paste a link, or search YouTube from the app.'
  },
  lists: {
    title: 'Lists and Known Words',
    body: 'Save words to your own lists. Mark the ones you know, and the app can hide their furigana as you read.'
  },
  frequency: {
    title: 'Frequency dictionaries',
    body: 'Order results by JLPT level, or by how often a word comes up on YouTube, in anime, manga, novels, and more. You choose which comes first.'
  },
  furigana: {
    title: 'Tap a kanji to split its reading',
    body: 'See which part of the furigana belongs to each kanji, sound changes included.'
  }
}

interface WebTool {
  title: string
  description: string
  href: string
  symbol: MenuSymbol
}

export const webTools: readonly WebTool[] = [
  {
    title: 'Dictionary',
    description: 'Search in Japanese, kana, romaji, or English',
    href: '/dictionary/',
    symbol: 'search'
  },
  {
    title: 'Kana charts',
    description: 'Hiragana and katakana, with words for each kana',
    href: kanaChartsPath,
    symbol: 'type'
  },
  {
    title: 'Kanji lists',
    description: 'By school grade, JLPT level, and stroke count',
    href: kanjiListsPath,
    symbol: 'grid'
  },
  {
    title: 'Frequency lists',
    description: 'JLPT levels, and the top words on YouTube, in anime, and more',
    href: frequencyDictionariesPath,
    symbol: 'chart'
  }
]

export const openDataSources: readonly Source[] = [
  sources.jmdict,
  sources.kanjidic2,
  sources.tatoeba,
  sources.kanjivg
]
