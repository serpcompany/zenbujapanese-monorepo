import { type AppScreenshot, appScreenshots } from '@/lib/app-screenshots'
import { type AppVideo, appVideos } from '@/lib/videos'

export type AppAreaId = 'dictionary' | 'image-search' | 'translate' | 'player' | 'lists'

export type DrawnPreviewId = 'player' | 'list' | 'frequency' | 'furigana'

export type AreaMedia =
  | { kind: 'screenshot'; label: string; screenshot: AppScreenshot }
  | { kind: 'drawn'; label: string; preview: DrawnPreviewId }
  | { kind: 'video'; label: string; video: AppVideo }

export interface AppArea {
  id: AppAreaId
  name: string
  pitch: string
  features: readonly string[]
  media: readonly AreaMedia[]
}

const screenshot = (label: string, shot: AppScreenshot): AreaMedia => ({
  kind: 'screenshot',
  label,
  screenshot: shot
})

const drawn = (label: string, preview: DrawnPreviewId): AreaMedia => ({
  kind: 'drawn',
  label,
  preview
})

const videoMedia = (video: AppVideo): AreaMedia => ({ kind: 'video', label: video.title, video })

export const appAreasWith = (videos: readonly AppVideo[]): readonly AppArea[] => [
  {
    id: 'dictionary',
    name: 'Dictionary',
    pitch: 'Every word, fully explained, with no connection needed.',
    features: [
      'Search in Japanese, romaji, or English, conjugated forms included',
      'Draw a kanji in any stroke order, or find it by its radicals',
      'Furigana and pitch accent, with every conjugation and what it means',
      'Each kanji’s readings and stroke order, plus real example sentences'
    ],
    media: [
      screenshot('Search results', appScreenshots.searchResults),
      screenshot('Word page', appScreenshots.wordDetail),
      screenshot('Conjugations', appScreenshots.conjugations),
      screenshot('Kanji page', appScreenshots.kanjiDetail),
      screenshot('Handwriting', appScreenshots.handwriting)
    ]
  },
  {
    id: 'image-search',
    name: 'Image Search',
    pitch: 'Point at Japanese, then tap any word.',
    features: [
      'Take a photo, or choose one from your library or files',
      'Reads text across or down the page, even with English around it',
      'Tap a word to open it in the dictionary with the photo still in view',
      'Switch to Translate for the whole passage'
    ],
    media: [
      screenshot('Words on a photo', appScreenshots.imageSearchPhoto),
      screenshot('A word from a photo', appScreenshots.imageSearch),
      screenshot('A photo translated', appScreenshots.imageSearchTranslate)
    ]
  },
  {
    id: 'translate',
    name: 'Translate',
    pitch: 'Talk it through, live, in Japanese and English.',
    features: [
      'Two people share one iPhone and speak either language in any order',
      'Speech appears as it’s spoken, and the translation is read aloud after a pause',
      'Listening mode follows a TV, a guide, or announcements',
      'It all runs on the iPhone, so after a one-time download it works offline'
    ],
    media: [screenshot('A conversation', appScreenshots.translate)]
  },
  {
    id: 'player',
    name: 'Player',
    pitch: 'Watch YouTube in Japanese, and tap any word in its captions.',
    features: [
      'Paste a link or search YouTube from the app',
      'Japanese captions sit under the video and follow it',
      'Tap a word to pause and open it in the dictionary',
      'Repeat a line, step line by line, or slow down to 0.5×'
    ],
    media: [drawn('A video with its captions', 'player'), ...videos.map(videoMedia)]
  },
  {
    id: 'lists',
    name: 'Lists',
    pitch: 'Keep the words you meet, in the order that helps you.',
    features: [
      'Save words to your own lists',
      'Mark the words you know, and the app can hide their furigana as you read',
      'Equally good matches come first by the frequency list you choose: JLPT, YouTube, anime, manga, novels, and more',
      'Tap a kanji to see which part of the reading belongs to it'
    ],
    media: [
      drawn('A list with known words', 'list'),
      drawn('Frequency dictionaries', 'frequency'),
      drawn('Tap a kanji', 'furigana')
    ]
  }
]

export const appAreas = appAreasWith(appVideos)
