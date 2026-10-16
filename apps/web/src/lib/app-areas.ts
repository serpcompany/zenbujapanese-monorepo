import { type AppScreenshot, appScreenshotsIn } from '@/lib/app-screenshots'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
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

type AreaText = { name: string; pitch: string; features: Record<string, string> }

const area = (id: AppAreaId, text: AreaText, media: readonly AreaMedia[]): AppArea => ({
  id,
  name: text.name,
  pitch: text.pitch,
  features: Object.values(text.features),
  media
})

export function appAreasIn(
  locale: Locale,
  videos: readonly AppVideo[] = appVideos
): readonly AppArea[] {
  const { dictionary, imageSearch, translate, player, lists } = getDictionary(locale).home.areas
  const shots = appScreenshotsIn(locale)
  return [
    area('dictionary', dictionary, [
      screenshot(dictionary.media.searchResults, shots.searchResults),
      screenshot(dictionary.media.wordDetail, shots.wordDetail),
      screenshot(dictionary.media.conjugations, shots.conjugations),
      screenshot(dictionary.media.kanjiDetail, shots.kanjiDetail),
      screenshot(dictionary.media.handwriting, shots.handwriting)
    ]),
    area('image-search', imageSearch, [
      screenshot(imageSearch.media.photo, shots.imageSearchPhoto),
      screenshot(imageSearch.media.word, shots.imageSearch),
      screenshot(imageSearch.media.translated, shots.imageSearchTranslate)
    ]),
    area('translate', translate, [screenshot(translate.media.conversation, shots.translate)]),
    area('player', player, [drawn(player.media.player, 'player'), ...videos.map(videoMedia)]),
    area('lists', lists, [
      drawn(lists.media.list, 'list'),
      drawn(lists.media.frequency, 'frequency'),
      drawn(lists.media.furigana, 'furigana')
    ])
  ]
}
