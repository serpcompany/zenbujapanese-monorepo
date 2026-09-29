// Retired word URLs (ADR 0007): an `ent_seq` a previous release published and this one doesn't
// returns 410 Gone, or redirects (308) to the entry that replaces it. Next.js pages can't answer
// 410, so the Worker (worker.ts) answers these before the app; everything else goes on to it.
// Relative imports only: worker.ts bundles this outside Next.js.

import { type DictionaryApi, type DictionaryApiEnvironment, dictionaryApi } from './api'
import { parseWordSegment } from './urls'

export interface RetiredWord {
  /** The entry that replaces it, with its page's slug; null when nothing does. */
  replacement: { entSeq: number; slug: string } | null
}

export interface RetiredLookup {
  retired(entSeq: number): Promise<RetiredWord | null>
}

/** A word path, `/dictionary/<segment>/`, or null for any other path. */
function wordEntSeq(pathname: string): number | null {
  const match = pathname.match(/^\/dictionary\/([^/]+)\/$/)
  return match ? (parseWordSegment(match[1])?.entSeq ?? null) : null
}

/** The response for a retired word's URL, or null to let the app answer. */
export async function retiredWordResponse(
  url: URL,
  lookup: RetiredLookup
): Promise<Response | null> {
  const entSeq = wordEntSeq(url.pathname)
  if (entSeq === null) return null
  const retired = await lookup.retired(entSeq)
  if (!retired) return null
  if (retired.replacement) {
    const { entSeq: replacement, slug } = retired.replacement
    return Response.redirect(new URL(encodeURI(`/dictionary/${slug}-${replacement}/`), url), 308)
  }
  return new Response('This word is no longer in the dictionary.\n', {
    status: 410,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' }
  })
}

// Retired entries, read from the dictionary service once per isolate (keyed by the Worker's
// environment, which an isolate keeps): a release retires a few hundred at most. None until the
// artifact records retired entries (#463).
const retiredByEnvironment = new WeakMap<object, Promise<Map<number, number | null>>>()

/**
 * The service's retired entries (./api.ts), remembered under `key`. A service that can't answer
 * retires nothing here, and the app then answers the request itself: it 404s, or fails the
 * request when the service fails.
 */
export function apiRetiredLookup(api: DictionaryApi, key: object = api): RetiredLookup {
  return {
    async retired(entSeq) {
      let all = retiredByEnvironment.get(key)
      if (!all) {
        all = api
          .retired()
          .then(
            ({ data }) =>
              new Map(Object.entries(data).map(([number, value]) => [Number(number), value]))
          )
        all.catch(() => retiredByEnvironment.delete(key))
        retiredByEnvironment.set(key, all)
      }
      const retired = await all.catch(() => new Map<number, number | null>())
      if (!retired.has(entSeq)) return null
      const replacement = retired.get(entSeq) ?? null
      if (replacement === null) return { replacement: null }
      const word = await api.word(replacement)
      // A replacement the release doesn't hold can't be redirected to, so the word is gone.
      return { replacement: word ? { entSeq: replacement, slug: word.data.slug } : null }
    }
  }
}

/** The Worker answers retired words wherever the site has a dictionary service. */
export function retiredWordsLookup(env: DictionaryApiEnvironment): RetiredLookup | null {
  const api = dictionaryApi(env)
  return api ? apiRetiredLookup(api, env) : null
}
