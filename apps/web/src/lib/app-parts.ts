import { type AppScreenshot, appScreenshots } from '@/lib/app-screenshots'

export interface AppPart {
  name: string
  line: string
  screenshot: AppScreenshot
}

export const pageEnd = {
  title: 'Everything you need to read Japanese, in one app.',
  line: 'Dictionary, Image Search, Translate, and Player on your iPhone.'
}

const appParts: readonly AppPart[] = [
  {
    name: 'Dictionary',
    line: 'Every word, fully explained',
    screenshot: appScreenshots.searchResults
  },
  {
    name: 'Image Search',
    line: 'Point at Japanese, tap a word',
    screenshot: appScreenshots.imageSearch
  },
  { name: 'Translate', line: 'Talk it through, live', screenshot: appScreenshots.translate },
  {
    name: 'Conjugations',
    line: 'Every form, and what it means',
    screenshot: appScreenshots.conjugations
  },
  { name: 'Kanji', line: 'Readings and stroke order', screenshot: appScreenshots.kanjiDetail },
  { name: 'Pitch accent', line: 'Hear how a word is said', screenshot: appScreenshots.wordDetail }
]

export const collageColumns = [0, 1].map(column => {
  const parts = appParts.filter((_, index) => index % 2 === column)
  return [...parts, parts[0]].filter((part): part is AppPart => part !== undefined)
})
