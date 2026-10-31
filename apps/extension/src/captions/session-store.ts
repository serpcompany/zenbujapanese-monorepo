import type { SiteVideo } from '../video/watch-page'
import type { RateLimit } from './backoff'
import type { CaptionsState } from './messages'

export type SessionStorage = {
  get(key?: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

export type TabCaptions = SiteVideo & { asked: boolean; captions: CaptionsState | null }

const rateLimitKey = 'captions.rateLimit'

const tabPrefix = 'captions.tab.'

const tabKey = (tabId: number) => `${tabPrefix}${tabId}`

async function read<T>(storage: SessionStorage, key: string): Promise<T | undefined> {
  const items = await storage.get(key)
  return items[key] as T | undefined
}

export function captionsStore(storage: SessionStorage) {
  return {
    tab: (tabId: number) => read<TabCaptions>(storage, tabKey(tabId)),
    setTab: (tabId: number, captions: TabCaptions) => storage.set({ [tabKey(tabId)]: captions }),
    forgetTab: (tabId: number) => storage.remove(tabKey(tabId)),
    tabIds: async () =>
      Object.keys(await storage.get())
        .filter(key => key.startsWith(tabPrefix))
        .map(key => Number(key.slice(tabPrefix.length))),
    rateLimit: () => read<RateLimit>(storage, rateLimitKey),
    setRateLimit: (limit: RateLimit | undefined) =>
      limit ? storage.set({ [rateLimitKey]: limit }) : storage.remove(rateLimitKey)
  }
}
