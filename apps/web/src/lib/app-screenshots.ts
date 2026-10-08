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

export const appScreenshots = {
  searchResults: appStoreScreenshot(
    '01-search-results',
    'Search results for taberu in the app: 食べる, to eat, then 食べるラー油'
  ),
  wordDetail: appStoreScreenshot(
    '08-word-detail-pitch',
    'The app’s word page for 大丈夫, with its pitch accent, meanings, and frequency'
  ),
  imageSearch: appStoreScreenshot(
    '05-image-search-word',
    'Image Search reading a ramen menu in the app, with 醤油, soy sauce, open'
  ),
  handwriting: appStoreScreenshot(
    '09-handwriting',
    'The kanji 峠 drawn by hand in the app, with the kanji it could be above it'
  ),
  conjugations: appStoreScreenshot(
    '14-conjugations',
    'The app’s conjugation table for 頑張る, to persevere, with each ending highlighted'
  ),
  translate: appStoreScreenshot(
    '17-translate-conversation',
    'A conversation in the app’s Translate tab, asking the way to Tokyo Station in English and Japanese'
  )
} as const satisfies Record<string, AppScreenshot>
