import { SyncedAreaView } from '@/components/account/synced/synced-area'
import type { SyncedArea } from '@/lib/account/synced'
import { getDictionary } from '@/lib/i18n/dictionary'
import { answer, render, rerender, stubAccountService } from './account-page'
import { profile, sessionAnswer, settings, signedIn } from './signed-in-account'
import { withSynced } from './synced-service'
import { SyncedStandIn } from './synced-stand-in'

export const word = (n: number) => n.toString(16).padStart(32, '0')
export const food = '2177c773-9e88-410f-9348-6cefaebe0a93'
export const verbs = '6f1c0e7a-3b5d-4c2e-9a8f-1d2e3f4a5b6c'
export const miru = { headword: '見る', reading: 'みる' }
export const taberu = { headword: '食べる', reading: 'たべる' }

export const list = (id: string, name: string, position: number) => ({
  id,
  name,
  position,
  createdAt: '2026-10-01T00:00:00.000Z'
})

export const onList = (listId: string, itemId: string, text: object, addedAt: string) => ({
  listId,
  itemId,
  ...text,
  addedAt
})

const areaView = (area: SyncedArea, listId: string | null, dailyLists: boolean) => (
  <SyncedAreaView
    area={area}
    locale="en"
    text={getDictionary('en').account}
    settings={settings()}
    listId={listId}
    dailyLists={dailyLists}
  />
)

export const renderArea = (area: SyncedArea, listId: string | null = null, dailyLists = false) =>
  render(areaView(area, listId, dailyLists))

export const moveTo = (area: SyncedArea, listId: string | null, dailyLists = false) =>
  rerender(areaView(area, listId, dailyLists))

export function openArea(
  area: SyncedArea,
  standIn: SyncedStandIn = new SyncedStandIn(),
  {
    listId = null,
    dailyLists = false,
    more = {}
  }: { listId?: string | null; dailyLists?: boolean; more?: Record<string, Response> } = {}
) {
  const service = withSynced(standIn, signedIn({ more }))
  return { page: renderArea(area, listId, dailyLists), standIn, service }
}

export const subscriptionAnswering = (cloudAccess: string) =>
  stubAccountService({
    'GET /v1/auth/get-session': sessionAnswer('u1', 'bare', 1),
    'GET /v1/auth/token': answer({ token: 'h.eyJzdWIiOiJ1MSJ9.s' }),
    'GET /v1/me': answer(profile),
    'GET /v1/auth/list-accounts': answer([]),
    'GET /v1/me/subscription': answer({
      status: 'none',
      running: [],
      canSubscribe: true,
      cloudAccess,
      offers: { appStore: ['monthly'], website: [] }
    })
  })
