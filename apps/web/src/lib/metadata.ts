import type { Metadata } from 'next'
import { pageFor, type SitePath } from './pages'
import { site } from './site'

export const siteOpenGraph = { siteName: site.name, type: 'website', locale: 'en_US' } as const

export const siteIcons = {
  icon: [
    { url: '/favicon.ico', sizes: 'any' },
    { url: '/zenbu-icon-flat-vector.svg', type: 'image/svg+xml' },
    { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
  ],
  apple: { url: '/apple-touch-icon.png', sizes: '180x180' }
} satisfies Metadata['icons']

export const siteManifest = '/site.webmanifest'

export function pageMetadata(path: Exclude<SitePath, '/'>): Metadata {
  const page = pageFor(path)
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: { ...siteOpenGraph, title: page.title, description: page.description, url: path }
  }
}
