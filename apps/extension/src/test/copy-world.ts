import { expect, vi } from 'vitest'
import { readSubscription } from '../service-worker/account/account-service'
import type { User } from '../service-worker/account/store'
import { accountCopy } from '../service-worker/copy/copy-service'
import type { CopyChange, CopyRequest, CopyView, KnownChanged } from '../shared/account-copy'
import { accountWorld, json, jwtWith, subscription, user } from './account-stand-in'
import { appliedTo, copyStorage, type Sync, settingsStore, syncAnswer } from './copy-stand-in'

type Route = Parameters<typeof accountWorld>[0][string]

type Asked = Parameters<Route>[0]

export const word = {
  item: '0123456789abcdef0123456789abcdef',
  headword: '食べる',
  reading: 'たべる'
}

export const otherWord = {
  item: 'fedcba9876543210fedcba9876543210',
  headword: '飲む',
  reading: 'のむ'
}

export const favorites = '2177c773-9e88-410f-9348-6cefaebe0a93'

export const noLists = [{ id: favorites, name: 'Favorites', position: 0, createdAt: '', words: [] }]

export const subscribed = { ...subscription, active: true, cloudAccess: 'subscribed' as const }

const start = Date.parse('2026-10-30T09:00:00Z')

type SyncRoute = (body: Sync, asked: Asked) => Response | Promise<Response>

export const answeringSync = (route: SyncRoute = body => json(200, syncAnswer(appliedTo(body)))) =>
  ((asked: Asked) => route(asked.body as Sync, asked)) satisfies Route

export function gated() {
  let open: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  return { gate, open }
}

export function copyWorld(
  sync: Route = answeringSync(),
  browser: Record<string, unknown> = {},
  routes: Record<string, Route> = {}
) {
  let now = start
  let ids = 0
  const waits: { run: () => void; wait: number }[] = []
  const world = accountWorld(
    {
      'GET /v1/auth/token': () => json(200, { token: jwtWith(now / 1000 + 900) }),
      'GET /v1/me/subscription': () => json(200, subscribed),
      'POST /v1/sync': sync,
      ...routes
    },
    undefined,
    () => now
  )
  const storage = copyStorage()
  const settings = settingsStore(browser)
  const told: KnownChanged[] = []
  const failures: string[] = []
  const copy = accountCopy({
    storage: storage.storage,
    store: world.store,
    tokens: world.tokens,
    readSubscription: () => readSubscription(world.store, world.tokens),
    settings: settings.store,
    tell: changed => told.push(changed),
    reportFailure: (code, status) =>
      failures.push(status === undefined ? code : `${code} ${status}`),
    later: (run, wait) => waits.push({ run, wait }),
    now: () => now,
    random: () => 1,
    newId: () => {
      ids += 1
      return `00000000-0000-4000-8000-${String(ids).padStart(12, '0')}`
    }
  })
  const read = async (): Promise<CopyView> => {
    const answer = await copy.answer({ copy: 'read' })
    if (answer.type !== 'copy') throw new Error(`The copy answered ${answer.type}.`)
    return answer.copy
  }
  const signIn = async (who: User = user, session = `session-${who.id}`) => {
    await world.store.keepSignIn(session, who)
    await world.store.keepSubscription(session, subscribed)
    await copy.signedIn(who)
  }
  const signOut = async () => world.store.forgetSession(await world.store.sessionToken())
  const ask = (request: CopyRequest) => copy.answer(request)
  const change = (asked: CopyChange) => copy.answer({ copy: 'change', change: asked })
  const syncs = () => world.asked.filter(asked => asked.route === 'POST /v1/sync')
  const sent = () => syncs().flatMap(asked => (asked.body as Sync).mutations)
  const settled = () => copy.answer({ copy: 'sync' })
  const markedAndSending = async () => {
    await signIn()
    await change({ change: 'mark', ...word })
    await vi.waitFor(() => expect(syncs()).toHaveLength(1))
  }
  const stopped = () =>
    vi.waitFor(async () => {
      const { sync } = await read()
      if (sync === 'not-synced' || sync === 'syncing') throw new Error(`Still ${sync}.`)
    })
  return {
    ...world,
    copy,
    storage,
    settings,
    told,
    failures,
    waits,
    read,
    signIn,
    signOut,
    ask,
    change,
    syncs,
    sent,
    settled,
    markedAndSending,
    stopped,
    later: (ms: number) => {
      now += ms
    }
  }
}

export type CopyWorld = ReturnType<typeof copyWorld>

export async function heldCopy(sync: Route = answeringSync(), routes: Record<string, Route> = {}) {
  let held = true
  const world = copyWorld(
    asked => {
      if (!held) return sync(asked)
      held = false
      return json(503, {})
    },
    {},
    routes
  )
  await world.signIn()
  await world.settled()
  return world
}

export async function pulledCopy(sync: Route = answeringSync()) {
  const world = copyWorld(sync)
  await world.signIn()
  await world.settled()
  return world
}
