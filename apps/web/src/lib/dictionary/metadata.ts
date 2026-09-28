import type { Metadata } from 'next'

/** Title, description, and canonical URL for a dictionary page. `path` is already percent-encoded. */
export function dictionaryMetadata(
  path: string,
  title: string,
  description: string,
  options: { index?: boolean } = {}
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    ...(options.index === false ? { robots: { index: false, follow: true } } : {})
  }
}
