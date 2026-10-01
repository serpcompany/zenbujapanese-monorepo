import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import { exampleLimit } from '@zenbu/dictionary-core/examples/retrieval'
import type { PageExample } from './data'
import { decodeSegment, normalizeSearchQuery } from './urls'

export function morePosition(value: string | null): number | null {
  const from = Number(value ?? examplesPerPage)
  return Number.isInteger(from) && from >= 0 && from < exampleLimit && from % examplesPerPage === 0
    ? from
    : null
}

export function pathText(pathname: string, pattern: RegExp): string | null {
  const text = pathSpelling(pathname, pattern)
  return text !== null && normalizeSearchQuery(text) === text ? text : null
}

export function pathSpelling(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname)
  if (!match) return null
  const text = decodeSegment(match[1])
  return text || null
}

const buildPinnedCacheSeconds = 86_400

export function examplesResponse(
  examples: PageExample[],
  cacheSeconds = buildPinnedCacheSeconds
): Response {
  return Response.json(
    { examples },
    {
      headers: {
        'Cache-Control': `public, max-age=${cacheSeconds}`,
        'X-Robots-Tag': 'noindex'
      }
    }
  )
}

export function examplesNotFound(): Response {
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'X-Robots-Tag': 'noindex' } }
  )
}
