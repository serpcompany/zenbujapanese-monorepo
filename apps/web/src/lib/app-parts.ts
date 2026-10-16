import { type AppScreenshot, appScreenshotsIn } from '@/lib/app-screenshots'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'

export interface AppPart {
  name: string
  line: string
  screenshot: AppScreenshot
}

export function collageColumnsIn(locale: Locale): AppPart[][] {
  const text = getDictionary(locale).home.closing.parts
  const shots = appScreenshotsIn(locale)
  const appParts: readonly AppPart[] = [
    { ...text.dictionary, screenshot: shots.searchResults },
    { ...text.imageSearch, screenshot: shots.imageSearch },
    { ...text.translate, screenshot: shots.translate },
    { ...text.conjugations, screenshot: shots.conjugations },
    { ...text.kanji, screenshot: shots.kanjiDetail },
    { ...text.pitchAccent, screenshot: shots.wordDetail }
  ]
  return [0, 1].map(column => {
    const parts = appParts.filter((_, index) => index % 2 === column)
    return [...parts, parts[0]].filter((part): part is AppPart => part !== undefined)
  })
}
