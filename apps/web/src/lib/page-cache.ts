import { accountPages } from './account/pages'
import { edgeCache } from './edge-cache'
import { pathLocale } from './i18n/paths'

export const pageCacheHeader = 'X-Page-Cache'
export const pageFreshSeconds = 600
export const pageStaleSeconds = 7 * 24 * 60 * 60

const storedAtHeader = 'X-Page-Cache-Stored-At'
const servedCacheControlHeader = 'X-Page-Cache-Control'
const versionParameter = '__page-cache-version'

const routerRequestHeaders = [
  'rsc',
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'next-router-state-tree',
  'next-url'
]

const accountPaths: ReadonlySet<string> = new Set(
  Object.values(accountPages).map(page => page.path)
)

type PageCacheState = 'HIT' | 'STALE' | 'MISS'

export function isCachedPageRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET' || !url.pathname.endsWith('/')) return false
  if (url.searchParams.has('_rsc')) return false
  if (accountPaths.has(pathLocale(url.pathname).path)) return false
  return !routerRequestHeaders.some(header => request.headers.has(header))
}

function isCachedPageResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get('content-type') ?? '').startsWith('text/html') &&
    !response.headers.has('set-cookie')
  )
}

const failedRender = /id="__next_error__"|data-dgst="(?!BAILOUT_TO_CLIENT_SIDE_RENDERING")/

export function isWholePage(html: string): boolean {
  return !failedRender.test(html)
}

function cacheKey(url: URL, version: string): Request {
  const key = new URL(url)
  key.searchParams.set(versionParameter, version)
  return new Request(key.toString(), { method: 'GET' })
}

function stored(response: Response, now: number): Response {
  const copy = new Response(response.body, response)
  copy.headers.set(servedCacheControlHeader, response.headers.get('cache-control') ?? '')
  copy.headers.set('Cache-Control', `public, max-age=${pageFreshSeconds + pageStaleSeconds}`)
  copy.headers.set(storedAtHeader, String(now))
  return copy
}

function marked(response: Response, state: PageCacheState): Response {
  const copy = new Response(response.body, response)
  copy.headers.set(pageCacheHeader, state)
  return copy
}

function served(kept: Response, state: PageCacheState): Response {
  const copy = marked(kept, state)
  const cacheControl = kept.headers.get(servedCacheControlHeader)
  if (cacheControl) copy.headers.set('Cache-Control', cacheControl)
  else copy.headers.delete('Cache-Control')
  copy.headers.delete(servedCacheControlHeader)
  copy.headers.delete(storedAtHeader)
  return copy
}

function storedAge(response: Response, now: number): number {
  const storedAt = Number(response.headers.get(storedAtHeader))
  return Number.isFinite(storedAt) ? (now - storedAt) / 1000 : Number.POSITIVE_INFINITY
}

export interface PageCacheContext {
  version: string
  waitUntil(promise: Promise<unknown>): void
  now?: () => number
}

export async function cachedPage(
  request: Request,
  url: URL,
  context: PageCacheContext,
  render: () => Promise<Response>
): Promise<Response> {
  const cache = edgeCache()
  if (!cache || !isCachedPageRequest(request, url)) return render()
  const now = context.now ?? Date.now
  const key = cacheKey(url, context.version)
  const keep = async (response: Response) => {
    const html = await response.text()
    if (!isWholePage(html)) return
    await cache.put(key, stored(new Response(html, response), now()))
  }
  const hit = await cache.match(key).catch(() => undefined)
  if (hit) {
    if (storedAge(hit, now()) <= pageFreshSeconds) return served(hit, 'HIT')
    context.waitUntil(
      render()
        .then(response => (isCachedPageResponse(response) ? keep(response) : undefined))
        .catch(() => undefined)
    )
    return served(hit, 'STALE')
  }
  const response = await render()
  if (!isCachedPageResponse(response)) return response
  context.waitUntil(keep(response.clone()).catch(() => undefined))
  return marked(response, 'MISS')
}
