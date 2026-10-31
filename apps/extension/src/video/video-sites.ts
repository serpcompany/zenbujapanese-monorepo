import { netflixBridge } from './netflix-bridge'
import { netflixFollower } from './netflix-follower'
import type { VideoSitePage } from './video-page'
import { youTubeFollower } from './youtube-follower'

type NavigatingWindow = Window & { navigation?: EventTarget }

export const youTubePage: VideoSitePage = {
  name: 'youtube',
  follow: (page, videoId) => youTubeFollower(page, videoId),
  navigations(page, navigated) {
    page.addEventListener('yt-navigate-finish', navigated)
    return () => page.removeEventListener('yt-navigate-finish', navigated)
  }
}

export function netflixPage(page: Document, bridge = netflixBridge(page)): VideoSitePage {
  return {
    name: 'netflix',
    follow: (followed, videoId) => netflixFollower(followed, videoId, bridge),
    navigations(watched, navigated) {
      const navigation = (watched.defaultView as NavigatingWindow | null)?.navigation
      navigation?.addEventListener('currententrychange', navigated)
      return () => navigation?.removeEventListener('currententrychange', navigated)
    },
    captionTracks: videoId => bridge.tracks(videoId)
  }
}
