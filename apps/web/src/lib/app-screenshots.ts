export interface AppScreenshot {
  src: string
  alt: string
}

export const appScreenshotSize = { width: 600, height: 1305 } as const

const appStoreScreenshot = (file: string, alt: string): AppScreenshot => ({
  src: `/screenshots/app-store/${file}.webp`,
  alt
})

export const appScreenshots = {
  searchResults: appStoreScreenshot('search-results', 'Search results for taberu'),
  wordDetail: appStoreScreenshot(
    'word-detail-pitch',
    'The word page for 大丈夫, with its pitch accent and meanings'
  ),
  imageSearch: appStoreScreenshot(
    'image-search-word',
    'Image Search on a ramen menu, with 醤油 open from the photo'
  ),
  handwriting: appStoreScreenshot('handwriting', 'Drawing 峠 by hand'),
  kanjiDetail: appStoreScreenshot('kanji-detail', 'Kanji details for 峠'),
  conjugations: appStoreScreenshot('conjugations', 'Conjugations of 頑張る'),
  translate: appStoreScreenshot('translate-conversation', 'A live conversation in Translate')
} as const satisfies Record<string, AppScreenshot>
