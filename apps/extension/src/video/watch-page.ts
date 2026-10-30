export type VideoSite = 'youtube' | 'netflix'

export type SiteVideo = { site: VideoSite; videoId: string }

const youTubeVideoId = /^[\w-]{11}$/

const netflixWatchPath = /^\/watch\/(\d{1,12})\/?$/

export const isVideoSite = (value: unknown): value is VideoSite =>
  value === 'youtube' || value === 'netflix'

export function watchedVideo(url: string | undefined): SiteVideo | null {
  if (url === undefined || !URL.canParse(url)) return null
  const { hostname, pathname, searchParams } = new URL(url)
  if (hostname === 'www.netflix.com') {
    const videoId = netflixWatchPath.exec(pathname)?.[1]
    return videoId === undefined ? null : { site: 'netflix', videoId }
  }
  if (hostname !== 'www.youtube.com' || pathname !== '/watch') return null
  const videoId = searchParams.get('v')
  return videoId !== null && youTubeVideoId.test(videoId) ? { site: 'youtube', videoId } : null
}
