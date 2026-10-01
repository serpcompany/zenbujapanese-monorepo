import type { Metadata } from 'next'
import { pageFor, type sitePages } from './pages'

export function pageMetadata(path: (typeof sitePages)[number]['path']): Metadata {
  const page = pageFor(path)
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: { title: page.title, description: page.description, url: path }
  }
}
