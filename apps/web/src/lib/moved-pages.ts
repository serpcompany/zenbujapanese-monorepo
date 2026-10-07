export const movedPages: Readonly<Record<string, string>> = {
  '/privacy': '/legal/privacy/'
}

export const removedDictionaryPages: readonly { source: string; destination: string }[] = [
  { source: '/dictionary/kanji/:character', destination: '/dictionary/search/:character/' },
  {
    source: '/dictionary/:word([^/]*\\d)/conjugations/:form*',
    destination: '/dictionary/:word/'
  },
  { source: '/dictionary/search/:query/examples', destination: '/dictionary/search/:query/' }
]

export function movedPageResponse(url: URL): Response | null {
  const destination = movedPages[url.pathname.replace(/(.)\/$/, '$1')]
  if (!destination) return null
  const location = new URL(destination, url)
  location.search = url.search
  return Response.redirect(location.href, 308)
}
