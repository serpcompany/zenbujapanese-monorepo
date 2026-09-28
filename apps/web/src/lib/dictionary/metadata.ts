import type { Metadata } from 'next'

/** Title, description, and canonical URL for a dictionary page. */
export function dictionaryMetadata(
  path: string,
  title: string,
  description: string,
  options: { index?: boolean } = {}
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: encodeURI(path) },
    openGraph: { title, description, url: encodeURI(path) },
    ...(options.index === false ? { robots: { index: false, follow: true } } : {})
  }
}
