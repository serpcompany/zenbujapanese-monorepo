import type { Metadata } from 'next'
import type { Locale } from './i18n/config'
import { getDictionary } from './i18n/dictionary'
import { localizedPath } from './i18n/paths'
import { pageFor, type SitePage, type SitePath } from './pages'
import { localizedAlternates, siteOpenGraph } from './seo'
import { site, siteOrigin } from './site'
import { siteTitle } from './snippets'

const siteIcons = {
  icon: [
    { url: '/favicon.ico', sizes: 'any' },
    { url: '/zenbu-icon-flat-vector.svg', type: 'image/svg+xml' },
    { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
  ],
  apple: { url: '/apple-touch-icon.png', sizes: '180x180' }
} satisfies Metadata['icons']

const siteManifest = '/site.webmanifest'

export function siteMetadata(locale: Locale): Metadata {
  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: site.name, template: siteTitle('%s') },
    description: getDictionary(locale).site.description,
    openGraph: siteOpenGraph(locale),
    twitter: { card: 'summary_large_image' },
    icons: siteIcons,
    manifest: siteManifest
  }
}

export function sitePageMetadata(page: SitePage, locale: Locale): Metadata {
  return {
    title: page.title,
    description: page.description,
    alternates: localizedAlternates(page.path, locale),
    openGraph: {
      ...siteOpenGraph(locale),
      title: page.title,
      description: page.description,
      url: localizedPath(page.path, locale)
    }
  }
}

export const pageMetadata = (path: Exclude<SitePath, '/'>, locale: Locale) =>
  sitePageMetadata(pageFor(path, locale), locale)
