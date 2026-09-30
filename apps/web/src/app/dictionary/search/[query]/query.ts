import { permanentRedirect } from 'next/navigation'
import { decodeSegment, normalizeSearchQuery } from '@/lib/dictionary/urls'

/**
 * The query a search page's segment names (the results page, and its examples page). Next.js
 * passes a page an encoded segment but generateMetadata a decoded one. A query not in its normal
 * form redirects to `pathFor` its normal form, as does a literal dot (3.14), whose encoded form
 * (3%2E14) keeps the trailing slash; an empty one redirects to the search page.
 */
export async function searchQuery(
  params: Promise<{ query: string }>,
  decoded: boolean,
  pathFor: (query: string) => string
): Promise<string> {
  const segment = (await params).query
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeSearchQuery(raw)
  if (!query) permanentRedirect('/dictionary/search/')
  if (query !== raw || (!decoded && segment.includes('.'))) permanentRedirect(pathFor(query))
  return query
}
