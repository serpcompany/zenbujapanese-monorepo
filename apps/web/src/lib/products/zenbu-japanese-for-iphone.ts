import { appScreenshots } from '@/lib/app-screenshots'
import type { SitePath } from '@/lib/pages'
import { featuredApp, productById } from '@/lib/products/catalog'
import type { ProductDemo, ProductPoint, ProductQuestion } from '@/lib/products/product-page'

export const iphoneAppPage = {
  path: '/products/zenbu-japanese-app/' satisfies SitePath,
  title: featuredApp.title,
  name: 'Zenbu Japanese',
  subtitle: 'Japanese dictionary and translator for iPhone',
  lead: 'Look up any word offline, read Japanese from photos, draw kanji you can’t type, and talk through conversations in Japanese and English.',
  icon: featuredApp.icon,
  facts: { platform: 'iPhone' },
  demos: [
    {
      symbol: 'search',
      label: 'Search',
      title: 'Search in any script',
      description:
        'Type Japanese, kana, romaji, or English. Among equally good matches, the most common words come first.',
      screenshot: appScreenshots.searchResults
    },
    {
      symbol: 'camera',
      label: 'Image Search',
      title: 'Read Japanese from a photo',
      description: 'Snap a menu or a sign, then tap any word to open it.',
      screenshot: appScreenshots.imageSearch
    },
    {
      symbol: 'pen',
      label: 'Handwriting',
      title: 'Draw a kanji you can’t type',
      description: 'Write it in any stroke order. Zenbu reads the finished shape.',
      screenshot: appScreenshots.handwriting
    },
    {
      symbol: 'book',
      label: 'Conjugations',
      title: 'Every form of a verb',
      description: 'Each form, with what it means and real example sentences.',
      screenshot: appScreenshots.conjugations
    },
    {
      symbol: 'languages',
      label: 'Translate',
      title: 'Talk it through, live',
      description: 'Two people, one iPhone, Japanese and English in any order.',
      screenshot: appScreenshots.translate
    }
  ] satisfies ProductDemo[],
  screenshots: [
    { screenshot: appScreenshots.searchResults, caption: 'Search in any script' },
    { screenshot: appScreenshots.wordDetail, caption: 'Pitch accent and meanings' },
    { screenshot: appScreenshots.imageSearch, caption: 'Read Japanese from a photo' },
    { screenshot: appScreenshots.handwriting, caption: 'Draw a kanji you can’t type' },
    { screenshot: appScreenshots.kanjiDetail, caption: 'See how each kanji is built' },
    { screenshot: appScreenshots.conjugations, caption: 'Every form of a verb' },
    { screenshot: appScreenshots.translate, caption: 'Talk it through, live' }
  ],
  features: [
    {
      symbol: 'book',
      title: 'Offline dictionary',
      description:
        'More than 200,000 words with furigana, pitch accent, conjugations, kanji, and example sentences.'
    },
    {
      symbol: 'camera',
      title: 'Image Search',
      description: 'Read Japanese from a photo, across or down the page, and tap any word.'
    },
    {
      symbol: 'pen',
      title: 'Handwriting',
      description: 'Draw a kanji in any stroke order, or build it from its radicals.'
    },
    {
      symbol: 'languages',
      title: 'Translate',
      description: 'Two-way conversations and a listening mode, running on the iPhone.'
    },
    {
      symbol: 'tv',
      title: 'Player',
      description: 'YouTube with linked Japanese captions. Tap a word to look it up.'
    },
    {
      symbol: 'list',
      title: 'Lists and Known Words',
      description: 'Save words to your own lists and hide furigana on words you know.'
    },
    {
      symbol: 'chart',
      title: 'Frequency dictionaries',
      description: 'JLPT and YouTube built in, plus anime, manga, novels, and more.'
    },
    {
      symbol: 'type',
      title: 'Furigana kanji highlight',
      description: 'Tap a kanji to see which part of the reading belongs to it.'
    }
  ] satisfies ProductPoint[],
  questions: [
    {
      question: 'Does it work offline?',
      answer:
        'The dictionary always does. Translate downloads Apple’s Japanese and English speech recognition and translation once, then works without a connection. Player needs one for YouTube.'
    },
    {
      question: 'Which frequency lists does it use?',
      answer:
        'JLPT levels and YouTube come built in. Japanese Wikipedia, TV & Movies, Anime, Manga, Novels, Visual Novels, and Video Games are optional downloads.'
    },
    {
      question: 'Is the web dictionary the same?',
      answer:
        'It has the same entries as the app’s Search tab, free in your browser. Image Search, handwriting, Translate, and Player are in the app.',
      link: { title: 'Search the dictionary', href: '/dictionary/' }
    }
  ] satisfies ProductQuestion[],
  related: ['dictionary', 'browser-extension', 'kana-charts'].map(productById)
} as const
