import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import { exampleLimit } from '@zenbu/dictionary-core/examples/retrieval'
import type { PageExample } from './data'
import { decodeSegment, normalizeSearchQuery } from './urls'

// What the routes that load examples into a page share (src/app/dictionary/examples, its forms/,
// src/app/dictionary/search/[query]/examples.json, src/app/dictionary/conjugations): the position
// a request asks for, the JSON they answer with, and their 404. Search engines skip them all; the
// pages the examples load into are what they index.

/**
 * Where a request for more examples starts: a multiple of `examplesPerPage` below the app's limit
 * of 100, defaulting to the second page. Null for anything else.
 */
export function morePosition(value: string | null): number | null {
  const from = Number(value ?? examplesPerPage)
  return Number.isInteger(from) && from >= 0 && from < exampleLimit && from % examplesPerPage === 0
    ? from
    : null
}

/**
 * The text a route's path names in `pattern`'s first group, decoded once from the path as sent,
 * and only when it's already in the app's normal form (normalizeSearchQuery), as the pages that
 * load a search's examples always ask. Null for anything else.
 */
export function pathText(pathname: string, pattern: RegExp): string | null {
  const text = pathSpelling(pathname, pattern)
  return text !== null && normalizeSearchQuery(text) === text ? text : null
}

/**
 * The spelling a route's path names in `pattern`'s first group, decoded once from the path as
 * sent, as written: a conjugated form's, which its screen searches as normalized but matches as
 * written (a full-width `Ｈ`). Null when the path doesn't match or names nothing.
 */
export function pathSpelling(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname)
  if (!match) return null
  const text = decodeSegment(match[1])
  return text || null
}

/**
 * Examples, as a page loads them. `cacheSeconds` is how long browsers and the edge may keep them:
 * a URL that names its build never changes.
 */
export function examplesResponse(examples: PageExample[], cacheSeconds = 86_400): Response {
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
