import type { AppScreenshot } from '@/lib/app-screenshots'

export interface AppVideo {
  youtubeId: string
  title: string
  thumbnail: AppScreenshot
}

export const appVideos: readonly AppVideo[] = []

export const videosSectionId = 'watch-it-work'

export const youtubeEmbedUrl = (youtubeId: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0`
