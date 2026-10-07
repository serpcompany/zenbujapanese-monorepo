import {
  answeredContract,
  type DictionaryContract,
  dictionaryContract,
  dictionaryContractHeader
} from '@zenbu/dictionary-core/artifact/contract'
import type { BrowseAnswer, BrowsePath } from '@zenbu/dictionary-core/browse/service-paths'
import { log } from '../log'

export interface DictionaryApiEnvironment {
  DICTIONARY_API_URL?: string
  DICTIONARY_API_TOKEN?: string
}

export interface Answer<T> {
  data: T
  build: string
}

const edgeCacheSeconds = 600

class DictionaryApiError extends Error {}

type Fetch = (input: Request) => Promise<Response>

function answeredBy(response: Response): number {
  return answeredContract(response.headers.get(dictionaryContractHeader))
}

async function cachedGet(fetcher: Fetch, url: string, token: string): Promise<Response> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  const key = new URL(url)
  key.searchParams.set('contract', String(dictionaryContract))
  const tokenlessKey = new Request(key.toString(), { method: 'GET' })
  const hit = cache ? await cache.match(tokenlessKey) : undefined
  if (hit) return hit
  const response = await fetcher(
    new Request(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  )
  const cacheable = response.ok || response.status === 404
  if (cache && cacheable && answeredBy(response) === dictionaryContract) {
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
    const contract = answeredBy(response)
    if (contract !== dictionaryContract) {
      log('warn', 'dictionary_contract_mismatch', {
        path,
        service: contract,
        site: dictionaryContract
      })
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
    search: (query: string) =>
      required<DictionaryContract['search']>(`/v1/search/${segment(query)}`),
    searchExamples: (query: string, from = 0) =>
      get<DictionaryContract['searchExamples']>(
        `/v1/search/${segment(query)}/examples?from=${from}`
      ),
    word: (entSeq: number) => get<DictionaryContract['word']>(`/v1/words/${entSeq}`),
    wordExamples: (entSeq: number, from: number) =>
      get<DictionaryContract['wordExamples']>(`/v1/words/${entSeq}/examples?from=${from}`),
    formExamples: (form: string, from: number, limit: number) =>
      required<DictionaryContract['formExamples']>(
        `/v1/conjugations/${segment(form)}/examples?from=${from}&limit=${limit}`
      ),
    kanji: (character: string) =>
      get<DictionaryContract['kanji']>(`/v1/kanji/${segment(character)}`),
    wordSitemaps: () => required<DictionaryContract['wordSitemaps']>('/v1/sitemaps/words'),
    sitemapWords: (number: number, after: number, limit: number) =>
      get<DictionaryContract['sitemapWords']>(
        `/v1/sitemaps/words/${number}?after=${after}&limit=${limit}`
      ),
    retired: () => required<DictionaryContract['retired']>('/v1/retired'),
    browse: <Name extends BrowseAnswer>(path: BrowsePath<Name>) =>
      get<DictionaryContract[Name]>(path.path),
    health: async (): Promise<ServiceHealth> => {
      const response = await fetcher(
        new Request(new URL('/healthz', base).toString(), {
          headers: { Accept: 'application/json' }
        })
      )
      const json = response.headers.get('content-type')?.includes('application/json')
        ? ((await response.json()) as { build?: string; contract?: number })
        : null
      return {
        status: response.status,
        build: json?.build ?? null,
        contract: json?.build ? answeredContract(json.contract) : null,
        mitigated: response.headers.get('cf-mitigated')
      }
    }
  }
}

export interface ServiceHealth {
  status: number
  build: string | null
  contract: number | null
  mitigated: string | null
}
