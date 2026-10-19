import { describe, expect, test } from 'vitest'
import { dictionaryMetadata } from './dictionary/metadata'
import { locales } from './i18n/config'
import { siteMetadata, sitePageMetadata } from './metadata'
import { pageFor } from './pages'

const image = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'Zenbu Japanese'
}

const siteOpenGraph = {
  en: { siteName: 'Zenbu Japanese', type: 'website', locale: 'en_US', images: [image] },
  ja: { siteName: 'Zenbu Japanese', type: 'website', locale: 'ja_JP', images: [image] }
}

describe('every page shares with the full Open Graph set and a large image card', () => {
  test.each(
    locales
  )('the site’s own metadata, in %s, names the site, its type, language, and image', locale => {
    const metadata = siteMetadata(locale)
    expect(metadata.openGraph).toEqual(siteOpenGraph[locale])
    expect(metadata.twitter).toEqual({ card: 'summary_large_image' })
    expect(metadata.title).toEqual({ default: 'Zenbu Japanese', template: '%s | Zenbu Japanese' })
  })

  test.each(
    locales
  )('a site page, in %s, keeps the site’s set under its own title, description, and URL', locale => {
    const page = pageFor('/about/', locale)
    expect(sitePageMetadata(page, locale).openGraph).toEqual({
      ...siteOpenGraph[locale],
      title: page.title,
      description: page.description,
      url: locale === 'en' ? '/about/' : '/ja/about/'
    })
  })

  test.each(locales)('a dictionary page, in %s, keeps the site’s set too', locale => {
    const metadata = dictionaryMetadata('/dictionary/browse/', locale, 'Browse', 'Every word.', {
      index: false
    })
    expect(metadata.openGraph).toEqual({
      ...siteOpenGraph[locale],
      title: 'Browse',
      description: 'Every word.',
      url: locale === 'en' ? '/dictionary/browse/' : '/ja/dictionary/browse/'
    })
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })
})
