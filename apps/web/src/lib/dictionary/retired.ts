import { type DictionaryApi, type DictionaryApiEnvironment, dictionaryApi } from './api'
import { parseWordSegment } from './urls'

interface RetiredWord {
  replacement: { entSeq: number; slug: string } | null
}

export interface RetiredLookup {
  retired(entSeq: number): Promise<RetiredWord | null>
}

function wordEntSeq(pathname: string): number | null {
  const match = pathname.match(/^\/dictionary\/([^/]+)\/$/)
  return match ? (parseWordSegment(match[1])?.entSeq ?? null) : null
}

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

const retiredByEnvironment = new WeakMap<object, Promise<Map<number, number | null>>>()

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
      return { replacement: word ? { entSeq: replacement, slug: word.data.slug } : null }
    }
  }
}

export function retiredWordsLookup(env: DictionaryApiEnvironment): RetiredLookup | null {
  const api = dictionaryApi(env)
  return api ? apiRetiredLookup(api, env) : null
}
