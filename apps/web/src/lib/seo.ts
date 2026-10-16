import { defaultLocale, type Locale, languageOf, locales } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { absoluteUrl, site, siteOrigin } from './site'

const xDefault = 'x-default'

export function pageLocales(): readonly Locale[] {
  return locales
}

export function hreflangPaths(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      pageLocales().map(locale => [languageOf(locale).code, localizedPath(path, locale)])
    ),
    [xDefault]: localizedPath(path, defaultLocale)
  }
}

export function localizedAlternates(path: string, locale: Locale) {
  return { canonical: localizedPath(path, locale), languages: hreflangPaths(path) }
}

export function siteOpenGraph(locale: Locale) {
  return { siteName: site.name, type: 'website', locale: languageOf(locale).ogLocale } as const
}

export type HeadLink = { rel: 'canonical' | 'alternate'; href: string; hrefLang?: string }

export function homeHeadLinks(locale: Locale, origin = siteOrigin()): HeadLink[] {
  return [
    { rel: 'canonical', href: absoluteUrl(localizedPath('/', locale), origin) },
    ...Object.entries(hreflangPaths('/')).map(([hrefLang, path]) => ({
      rel: 'alternate' as const,
      hrefLang,
      href: absoluteUrl(path, origin)
    }))
  ]
}

function sitemapAlternates(path: string, origin: string) {
  return Object.entries(hreflangPaths(path)).map(([hreflang, alternate]) => ({
    hreflang,
    url: absoluteUrl(alternate, origin)
  }))
}

export function localizedSitemapEntries(path: string, origin: string) {
  const alternates = sitemapAlternates(path, origin)
  return pageLocales().map(locale => ({
    url: absoluteUrl(localizedPath(path, locale), origin),
    alternates
  }))
}
