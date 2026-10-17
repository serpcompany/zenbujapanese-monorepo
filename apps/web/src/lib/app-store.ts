import { iosAppBundleId } from './app-links'
import { edgeCache } from './edge-cache'
import { errorFields, log } from './log'

export const appStoreLookupUrl = `https://itunes.apple.com/lookup?bundleId=${iosAppBundleId}`

const lookupCacheSeconds = 24 * 60 * 60
const failureCacheSeconds = 5 * 60
const lookupTimeoutMilliseconds = 3_000
const nothingFound = 'null'

export interface AppStoreRelease {
  version: string
  minimumOsVersion: string
}

type Fetch = (request: Request) => Promise<Response>

class AppStoreLookupError extends Error {}

const filledString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

export function readAppStoreLookup(answer: unknown): AppStoreRelease | null {
  const results = (answer as { results?: unknown } | null)?.results
  const app = (Array.isArray(results) ? results[0] : null) as Record<string, unknown> | null
  const version = app?.version
  const minimumOsVersion = app?.minimumOsVersion
  return filledString(version) && filledString(minimumOsVersion)
    ? { version, minimumOsVersion }
    : null
}

async function askApple(fetcher: Fetch): Promise<string> {
  const response = await fetcher(
    new Request(appStoreLookupUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(lookupTimeoutMilliseconds)
    })
  )
  if (!response.ok)
    throw new AppStoreLookupError(`The App Store lookup answered ${response.status}`)
  return response.text()
}

const kept = (body: string, seconds: number) =>
  new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}` }
  })

export async function appStoreRelease(
  fetcher: Fetch = request => fetch(request)
): Promise<AppStoreRelease | null> {
  const key = new Request(appStoreLookupUrl, { method: 'GET' })
  const cache = edgeCache()
  try {
    const hit = await cache?.match(key)
    if (hit) return readAppStoreLookup(await hit.json())
    const text = await askApple(fetcher)
    const answer: unknown = JSON.parse(text)
    await cache?.put(key, kept(text, lookupCacheSeconds))
    return readAppStoreLookup(answer)
  } catch (error) {
    log('warn', 'app_store_lookup_failed', errorFields(error))
    await cache?.put(key, kept(nothingFound, failureCacheSeconds)).catch(() => undefined)
    return null
  }
}
