import { normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'
import { drawerLinks, type MegaMenu, type SiteMenu, siteMenus } from '@/lib/site-menus'

export const homeTitle = 'Zenbu Japanese: Japanese Dictionary and Translator for iPhone'

const exampleSearch = (query: string, lang?: 'ja' | 'ja-Latn') => ({
  query,
  lang,
  path: searchPath(normalizeSearchQuery(query))
})

export const exampleSearches = [
  exampleSearch('大丈夫', 'ja'),
  exampleSearch('taberu', 'ja-Latn'),
  exampleSearch('峠', 'ja'),
  exampleSearch('to persevere')
]

export type AppAreaId = 'dictionary' | 'image-search' | 'translate' | 'player'

export interface AppArea {
  id: AppAreaId
  name: string
  pitch: string
  features: readonly string[]
}

export const appAreas: readonly AppArea[] = [
  {
    id: 'dictionary',
    name: 'Dictionary',
    pitch: 'Every word, fully explained, with no connection needed.',
    features: [
      'Search in Japanese, romaji, or English, conjugated forms included.',
      'Draw a kanji in any stroke order, or find it by its radicals.',
      'Furigana and pitch accent, and every conjugation with what it means.',
      'Each kanji’s readings and stroke order, and real example sentences.'
    ]
  },
  {
    id: 'image-search',
    name: 'Image Search',
    pitch: 'Point at Japanese, then tap any word.',
    features: [
      'Take a photo, or choose one from your library or your files.',
      'Reads text across or down the page, even with English around it.',
      'Tap a word to open it in the dictionary, with the photo still in view.',
      'Switch to Translate for the whole passage, paragraph by paragraph.'
    ]
  },
  {
    id: 'translate',
    name: 'Translate',
    pitch: 'Talk it through, live, in Japanese and English.',
    features: [
      'Two people share one iPhone and speak either language, in any order.',
      'What each says appears as it’s spoken, and its translation is read aloud after a pause.',
      'Listening mode follows a TV, a guide, or announcements.',
      'It all runs on the iPhone, so after a one-time download it works offline.'
    ]
  },
  {
    id: 'player',
    name: 'Player',
    pitch: 'Watch YouTube in Japanese, and tap any word in its captions.',
    features: [
      'Paste a link, or search YouTube from the app.',
      'The Japanese captions sit under the video and follow it as it plays.',
      'Tap a word to pause the video and open the word in the dictionary.',
      'Repeat a line, step through one line at a time, or slow down to 0.5×.'
    ]
  }
]

export type AppExtraId = 'lists' | 'frequency' | 'furigana'

export const appExtras: Record<AppExtraId, { title: string; body: string }> = {
  lists: {
    title: 'Lists and Known Words',
    body: 'Save words to your own lists. Mark the ones you know, and the app can hide their furigana as you read.'
  },
  frequency: {
    title: 'Frequency dictionaries',
    body: 'Among equally good matches, the most common words come first: by JLPT level, or by how often a word comes up on YouTube, in anime, manga, novels, and more. You choose which list leads.'
  },
  furigana: {
    title: 'Tap a kanji to split its reading',
    body: 'See which part of the furigana belongs to each kanji, sound changes included.'
  }
}

const isToolsMenu = (menu: SiteMenu): menu is MegaMenu =>
  menu.kind === 'mega' && menu.label === 'Tools'

export const webTools = siteMenus
  .filter(isToolsMenu)
  .flatMap(menu => drawerLinks(menu))
  .filter(link => link.target === undefined)
