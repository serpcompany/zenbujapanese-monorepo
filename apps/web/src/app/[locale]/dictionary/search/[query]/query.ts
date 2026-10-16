import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { permanentRedirect } from 'next/navigation'
import { decodeSegment, searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'

export function searchQuery(segment: string, decoded: boolean, locale: Locale): string {
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeQuery(raw)
  if (!query) permanentRedirect(localizedPath('/dictionary/search/', locale))
  if (query !== raw || (!decoded && segment.includes('.'))) {
    permanentRedirect(localizedPath(searchPath(query), locale))
  }
  return query
}
