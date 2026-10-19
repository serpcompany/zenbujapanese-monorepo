import { withoutDefaultLocale } from './i18n/routing'

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

export function movedPath(pathname: string): string | undefined {
  const unprefixed = withoutDefaultLocale(pathname)
  return movedPages[(unprefixed ?? pathname).replace(/(.)\/$/, '$1')] ?? unprefixed
}

export function movedPageResponse(url: URL): Response | null {
  const destination = movedPath(url.pathname)
  if (!destination) return null
  const location = new URL(url)
  location.pathname = destination
  return Response.redirect(location.href, 308)
}
