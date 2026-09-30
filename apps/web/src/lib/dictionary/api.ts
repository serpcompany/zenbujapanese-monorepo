// The dictionary service (apps/dictionary-api, ADR 0009), which the website reads every word,
// kanji, search, and example from. It takes its URL and token from the Worker's environment
// (DICTIONARY_API_URL, and the DICTIONARY_API_TOKEN secret). No Next.js imports: worker.ts bundles
// it outside Next.js for retired word URLs (./retired.ts).

import type { ConjugationSitemapWord } from '@zenbu/dictionary-core/artifact/conjugation-sitemap'
import type {
  ConjugationWordResponse,
  ExamplesResponse,
  FormExamplesResponse,
  KanjiResponse,
  SearchExamplesResponse,
  SearchResponse,
  WordResponse,
  WordSitemap
} from '@zenbu/dictionary-core/artifact/dictionary'

export interface DictionaryApiEnvironment {
  DICTIONARY_API_URL?: string
  DICTIONARY_API_TOKEN?: string
}

/** A service answer, with the build of the data and code that answered it. */
export interface Answer<T> {
  data: T
  build: string
}

/**
 * How long the Worker's edge cache keeps an answer. A page therefore shows a new build of the
 * dictionary within this long of its deploy.
 */
const cacheSeconds = 600

export class DictionaryApiError extends Error {}

type Fetch = (input: Request) => Promise<Response>

/**
 * GET `url` from the service, through the Worker's edge cache (the Cache API) when there is one:
 * outside a Worker (`pnpm dev`) each request reaches the service.
 */
async function cachedGet(fetcher: Fetch, url: string, token: string): Promise<Response> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  // The key carries no token: the cache is the Worker's own, not a shared HTTP cache.
  const key = new Request(url, { method: 'GET' })
  const hit = cache ? await cache.match(key) : undefined
  if (hit) return hit
  const response = await fetcher(
    new Request(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  )
  if (cache && (response.ok || response.status === 404)) {
    const copy = new Response(response.clone().body, response)
    copy.headers.set('Cache-Control', `public, max-age=${cacheSeconds}`)
    await cache.put(key, copy)
  }
  return response
}

export type DictionaryApi = NonNullable<ReturnType<typeof dictionaryApi>>

/** The service, or null when the environment names none (local development on fixtures). */
export function dictionaryApi(
  env: DictionaryApiEnvironment,
  fetcher: Fetch = request => fetch(request)
) {
  const base = env.DICTIONARY_API_URL
  const token = env.DICTIONARY_API_TOKEN
  if (!base) return null
  if (!token)
    throw new DictionaryApiError('DICTIONARY_API_URL is set but DICTIONARY_API_TOKEN is not')

  /**
   * An answer, or null for what the service doesn't hold (404), or for `unavailable` (503) where
   * the caller expects it; any other failure throws.
   */
  async function get<T>(path: string, unavailable = false): Promise<Answer<T> | null> {
    const url = new URL(path, base).toString()
    const response = await cachedGet(fetcher, url, token as string)
    if (response.status === 404 || (unavailable && response.status === 503)) return null
    if (!response.ok) {
      throw new DictionaryApiError(`The dictionary service answered ${response.status} for ${path}`)
    }
    return {
      data: (await response.json()) as T,
      build: response.headers.get('x-dictionary-build') ?? ''
    }
  }
  async function required<T>(path: string): Promise<Answer<T>> {
    const answer = await get<T>(path)
    if (!answer) throw new DictionaryApiError(`The dictionary service has no ${path}`)
    return answer
  }
  const segment = encodeURIComponent

  return {
    search: (query: string) => required<SearchResponse>(`/v1/search/${segment(query)}`),
    searchExamples: (query: string, from = 0) =>
      get<SearchExamplesResponse>(`/v1/search/${segment(query)}/examples?from=${from}`),
    word: (entSeq: number) => get<WordResponse>(`/v1/words/${entSeq}`),
    wordExamples: (entSeq: number, from: number) =>
      get<ExamplesResponse>(`/v1/words/${entSeq}/examples?from=${from}`),
    conjugationWord: (entSeq: number) =>
      get<ConjugationWordResponse>(`/v1/words/${entSeq}/conjugations`),
    formExamples: (form: string, from: number, limit: number) =>
      required<FormExamplesResponse>(
        `/v1/conjugations/${segment(form)}/examples?from=${from}&limit=${limit}`
      ),
    kanji: (character: string) => get<KanjiResponse>(`/v1/kanji/${segment(character)}`),
    wordSitemaps: () => required<WordSitemap[]>('/v1/sitemaps/words'),
    sitemapWords: (number: number, after: number, limit: number) =>
      get<{ entSeq: number; slug: string }[]>(
        `/v1/sitemaps/words/${number}?after=${after}&limit=${limit}`
      ),
    indexableKanji: () => required<string[]>('/v1/sitemaps/kanji'),
    /** Null while the service is still working it out, in the minutes after it starts. */
    conjugationSitemap: () => get<ConjugationSitemapWord[]>('/v1/sitemaps/conjugations', true),
    retired: () => required<Record<string, number | null>>('/v1/retired')
  }
}
