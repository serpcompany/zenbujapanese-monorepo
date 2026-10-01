import type { Metadata } from 'next'

export function dictionaryMetadata(
  encodedPath: string,
  title: string,
  description: string,
  options: { index?: boolean } = {}
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: encodedPath },
    openGraph: { title, description, url: encodedPath },
    ...(options.index === false ? { robots: { index: false, follow: true } } : {})
  }
}
