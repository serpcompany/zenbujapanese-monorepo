import type { Metadata } from 'next'
import { pageFor, type SitePath } from './pages'
import { site } from './site'

export const siteOpenGraph = { siteName: site.name, type: 'website', locale: 'en_US' } as const

export function pageMetadata(path: SitePath): Metadata {
  const page = pageFor(path)
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: { title: page.title, description: page.description, url: path }
  }
}
