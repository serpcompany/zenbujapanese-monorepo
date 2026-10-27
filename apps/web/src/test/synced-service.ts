import { vi } from 'vitest'
import { answer, apiUrl, type stubAccountService } from './account-page'
import type { SyncedStandIn } from './synced-stand-in'

export function withSynced(standIn: SyncedStandIn, stubbed: ReturnType<typeof stubAccountService>) {
  const theRest = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = init.body === undefined ? undefined : JSON.parse(String(init.body))
      const answered = standIn.answer(init.method ?? 'GET', new URL(url, apiUrl), body)
      return answered ? answer(answered.body, answered.status) : theRest(url, init)
    })
  )
  return stubbed
}
