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

export interface Answer<T> {
  data: T
  build: string
}

const edgeCacheSeconds = 600

export class DictionaryApiError extends Error {}

type Fetch = (input: Request) => Promise<Response>

async function cachedGet(fetcher: Fetch, url: string, token: string): Promise<Response> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  const tokenlessKey = new Request(url, { method: 'GET' })
  const hit = cache ? await cache.match(tokenlessKey) : undefined
  if (hit) return hit
  const response = await fetcher(
    new Request(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  )
  if (cache && (response.ok || response.status === 404)) {
    const copy = new Response(response.clone().body, response)
    copy.headers.set('Cache-Control', `public, max-age=${edgeCacheSeconds}`)
    await cache.put(tokenlessKey, copy)
  }
  return response
}

export type DictionaryApi = NonNullable<ReturnType<typeof dictionaryApi>>

export function dictionaryApi(
  env: DictionaryApiEnvironment,
  fetcher: Fetch = request => fetch(request)
) {
  const base = env.DICTIONARY_API_URL
  const token = env.DICTIONARY_API_TOKEN
  if (!base) return null
  if (!token)
    throw new DictionaryApiError('DICTIONARY_API_URL is set but DICTIONARY_API_TOKEN is not')

  async function get<T>(path: string, nullWhenUnavailable = false): Promise<Answer<T> | null> {
    const url = new URL(path, base).toString()
    const response = await cachedGet(fetcher, url, token as string)
    if (response.status === 404 || (nullWhenUnavailable && response.status === 503)) return null
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
    conjugationSitemap: () => get<ConjugationSitemapWord[]>('/v1/sitemaps/conjugations', true),
    retired: () => required<Record<string, number | null>>('/v1/retired'),
    health: async (): Promise<ServiceHealth> => {
      const response = await fetcher(
        new Request(new URL('/healthz', base).toString(), {
          headers: { Accept: 'application/json' }
        })
      )
      const json = response.headers.get('content-type')?.includes('application/json')
        ? ((await response.json()) as { build?: string })
        : null
      return {
        status: response.status,
        build: json?.build ?? null,
        mitigated: response.headers.get('cf-mitigated')
      }
    }
  }
}

export interface ServiceHealth {
  status: number
  build: string | null
  mitigated: string | null
}
