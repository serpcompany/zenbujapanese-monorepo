import { errorFields, log } from './log'

const appBundleId = 'com.zenbujapanese.app'
export const appStoreLookupUrl = `https://itunes.apple.com/lookup?bundleId=${appBundleId}`

const lookupCacheSeconds = 24 * 60 * 60
const lookupTimeoutMilliseconds = 3_000

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

function edgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default
}

async function lookupAnswer(fetcher: Fetch): Promise<unknown> {
  const key = new Request(appStoreLookupUrl, { method: 'GET' })
  const cache = edgeCache()
  const kept = await cache?.match(key)
  if (kept) return kept.json()
  const response = await fetcher(
    new Request(appStoreLookupUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(lookupTimeoutMilliseconds)
    })
  )
  if (!response.ok)
    throw new AppStoreLookupError(`The App Store lookup answered ${response.status}`)
  const text = await response.text()
  const answer: unknown = JSON.parse(text)
  await cache?.put(
    key,
    new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${lookupCacheSeconds}`
      }
    })
  )
  return answer
}

export async function appStoreRelease(
  fetcher: Fetch = request => fetch(request)
): Promise<AppStoreRelease | null> {
  try {
    return readAppStoreLookup(await lookupAnswer(fetcher))
  } catch (error) {
    log('warn', 'app_store_lookup_failed', errorFields(error))
    return null
  }
}
