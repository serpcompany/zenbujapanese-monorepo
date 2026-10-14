import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { permanentRedirect } from 'next/navigation'
import { decodeSegment } from '@/lib/dictionary/urls'

export async function searchQuery(
  params: Promise<{ query: string }>,
  decoded: boolean,
  pathFor: (query: string) => string
): Promise<string> {
  const segment = (await params).query
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeQuery(raw)
  if (!query) permanentRedirect('/dictionary/search/')
  if (query !== raw || (!decoded && segment.includes('.'))) permanentRedirect(pathFor(query))
  return query
}
