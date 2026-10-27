const videoIdPattern = /^[\w-]{11}$/

export function watchedVideoId(url: string | undefined): string | null {
  if (url === undefined || !URL.canParse(url)) return null
  const { hostname, pathname, searchParams } = new URL(url)
  if (hostname !== 'www.youtube.com' || pathname !== '/watch') return null
  const videoId = searchParams.get('v')
  return videoId !== null && videoIdPattern.test(videoId) ? videoId : null
}
