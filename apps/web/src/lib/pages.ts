import type { Locale } from './i18n/config'
import { getDictionary } from './i18n/dictionary'

export type SitePage = {
  path: string
  title: string
  description: string
}

export const sitePaths = [
  '/',
  '/dictionary/',
  '/products/',
  '/products/zenbu-japanese-app/',
  '/about/',
  '/support/',
  '/contact/',
  '/legal/',
  '/legal/privacy/',
  '/legal/terms/',
  '/legal/dmca/',
  '/legal/affiliate-disclosure/',
  '/sources/',
  '/sitemap/'
] as const

export type SitePath = (typeof sitePaths)[number]

export function pageFor(path: SitePath, locale: Locale): SitePage {
  const { title, description } = getDictionary(locale).pages[path]
  return { path, title, description }
}

export function sitePagesIn(locale: Locale): SitePage[] {
  return sitePaths.map(path => pageFor(path, locale))
}

export const legalPaths = sitePaths.filter(
  (path): path is Extract<SitePath, `/legal/${string}/`> =>
    path.startsWith('/legal/') && path !== '/legal/'
)

export function legalPagesIn(locale: Locale): SitePage[] {
  return legalPaths.map(path => pageFor(path, locale))
}
