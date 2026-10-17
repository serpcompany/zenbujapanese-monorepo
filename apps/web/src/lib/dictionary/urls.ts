import { decodeSegment, parseWordSegment } from '@zenbu/dictionary-core/detail/links'
import { wordSlug } from '@zenbu/dictionary-core/detail/slug'
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'

export { decodeSegment, parseWordSegment, wordSlug }

export function wordPath(entry: { headword: string; reading: string; entSeq: number }): string {
  return `/dictionary/${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}/`
}

export function searchPath(query: string): string {
  return `/dictionary/search/${encodeURIComponent(query).replaceAll('.', '%2E')}/`
}

export function kanjiSearchPath(character: string): string {
  return searchPath(normalizeQuery(character))
}

export function hasSearchPath(query: string): boolean {
  return query !== '.' && query !== '..'
}
