// Retired word URLs (ADR 0007): an `ent_seq` a previous release published and this one doesn't
// returns 410 Gone, or redirects (308) to the entry that replaces it. Next.js pages can't answer
// 410, so the Worker (worker.ts) answers these before the app; everything else goes on to it.
// Relative imports only: worker.ts bundles this outside Next.js.

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

// Retired entries by database, read once per isolate: a release retires a few hundred at most.
const retiredByDatabase = new WeakMap<D1Database, Promise<Map<number, number | null>>>()

/**
 * The dictionary database's `retired_ids`. A database that can't answer (no import yet, or an
 * outage) retires nothing here, and the app then answers the request itself: it 404s, or fails
 * the request when the database fails.
 */
export function d1RetiredLookup(db: D1Database): RetiredLookup {
  return {
    async retired(entSeq) {
      let all = retiredByDatabase.get(db)
      if (!all) {
        all = db
          .prepare('SELECT ent_seq, replacement_ent_seq FROM retired_ids')
          .all<{ ent_seq: number; replacement_ent_seq: number | null }>()
          .then(
            ({ results }) => new Map(results.map(row => [row.ent_seq, row.replacement_ent_seq]))
          )
        all.catch(() => retiredByDatabase.delete(db))
        retiredByDatabase.set(db, all)
      }
      const retired = await all.catch(() => new Map<number, number | null>())
      if (!retired.has(entSeq)) return null
      const replacement = retired.get(entSeq) ?? null
      if (replacement === null) return { replacement: null }
      const row = await db
        .prepare('SELECT slug FROM words WHERE ent_seq = ?')
        .bind(replacement)
        .first<{ slug: string }>()
      // A replacement the release doesn't hold can't be redirected to, so the word is gone.
      return { replacement: row ? { entSeq: replacement, slug: row.slug } : null }
    }
  }
}

/** The Worker answers retired words wherever a dictionary database is bound. */
export function retiredWordsLookup(env: { DICTIONARY_DB?: D1Database }): RetiredLookup | null {
  return env.DICTIONARY_DB ? d1RetiredLookup(env.DICTIONARY_DB) : null
}
