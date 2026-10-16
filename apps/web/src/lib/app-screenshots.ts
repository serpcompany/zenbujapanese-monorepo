import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'

export interface AppScreenshot {
  src: string
  alt: string
  width: number
  height: number
}

const appStoreScreenshot = (file: string, alt: string): AppScreenshot => ({
  src: `/screenshots/app-store/${file}.webp`,
  alt,
  width: 600,
  height: 1305
})

export function appScreenshotsIn(locale: Locale) {
  const alt = getDictionary(locale).screenshots
  return {
    searchResults: appStoreScreenshot('01-search-results', alt.searchResults),
    wordDetail: appStoreScreenshot('08-word-detail-pitch', alt.wordDetail),
    imageSearchPhoto: appStoreScreenshot('06-image-search-photo', alt.imageSearchPhoto),
    imageSearch: appStoreScreenshot('05-image-search-word', alt.imageSearch),
    imageSearchTranslate: appStoreScreenshot('07-image-search-translate', alt.imageSearchTranslate),
    handwriting: appStoreScreenshot('09-handwriting', alt.handwriting),
    kanjiDetail: appStoreScreenshot('11-kanji-detail', alt.kanjiDetail),
    conjugations: appStoreScreenshot('14-conjugations', alt.conjugations),
    translate: appStoreScreenshot('17-translate-conversation', alt.translate)
  } as const satisfies Record<keyof typeof alt, AppScreenshot>
}
