import { describe, expect, it, vi } from 'vitest'
import { json, refusal, subscription } from '../../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../../test/copy-stand-in'
import {
  answeringSync,
  type CopyWorld,
  copyWorld,
  gated,
  otherWord,
  word
} from '../../test/copy-world'

const failingFirst = (times: number, failure: () => Response | Promise<Response>) => {
  let calls = 0
  return answeringSync(body => {
    calls += 1
    return calls <= times ? failure() : json(200, syncAnswer(appliedTo(body)))
  })
}

async function markedIn(world: CopyWorld) {
  await world.signIn()
  await world.change({ change: 'mark', ...word })
  await world.stopped()
}

async function sentOnlyOnSyncNow(world: CopyWorld, waited = 0) {
  await world.change({ change: 'clear', item: word.item })
  world.later(waited)
  await world.ask({ copy: 'opened' })
  expect(world.syncs()).toHaveLength(1)
  await world.settled()
  await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
}

describe("the copy's sync when the account service fails", () => {
  it('waits twice as long after each failure, at most five minutes, then tries again', async () => {
    const world = copyWorld(failingFirst(10, () => refusal(503, 'unavailable')))
    await markedIn(world)
    await expect(world.read()).resolves.toMatchObject({ sync: 'waiting', unsynced: 1 })
    for (let tries = 1; tries < 10; tries += 1) {
      const waited = world.waits.at(-1)?.wait ?? 0
      world.later(waited)
      world.waits.at(-1)?.run()
      await vi.waitFor(() => expect(world.waits).toHaveLength(tries + 1))
    }
    expect(world.waits.map(each => each.wait)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000
    ])
    world.later(300_000)
    world.waits.at(-1)?.run()
    await vi.waitFor(() => expect(world.syncs()).toHaveLength(11))
    await vi.waitFor(async () => expect((await world.read()).sync).toBe('synced'))
    await expect(world.read()).resolves.toMatchObject({ unsynced: 0 })
  })

  it('sends nothing during a wait, except when asked to sync now', async () => {
    const world = copyWorld(failingFirst(1, () => refusal(503, 'unavailable')))
    await markedIn(world)
    await sentOnlyOnSyncNow(world)
  })

  it('waits for the retry, sending nothing more at once, after a change made while a failing sync was on its way', async () => {
    const { gate, open } = gated()
    const world = copyWorld(
      answeringSync(async () => {
        await gate
        return refusal(503, 'unavailable')
      })
    )
    await world.markedAndSending()
    await world.change({ change: 'mark', ...otherWord })
    open()
    await world.stopped()
    expect(world.syncs()).toHaveLength(1)
    expect(world.waits).toHaveLength(1)
    await expect(world.read()).resolves.toMatchObject({ sync: 'waiting', unsynced: 2 })
  })

  it.each([
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['answers with a page that is not JSON', () => new Response('<html>', { status: 200 })]
  ])('says it is offline, and keeps the changes, when the service %s', async (_, failure) => {
    const world = copyWorld(failingFirst(1, failure))
    await markedIn(world)
    await expect(world.read()).resolves.toMatchObject({ sync: 'offline', unsynced: 1 })
    expect(world.waits).toHaveLength(1)
  })

  it('waits as long as the service asks when it has had too many requests', async () => {
    const world = copyWorld(
      failingFirst(1, () => refusal(429, 'rate_limited', { 'retry-after': '30' }))
    )
    await markedIn(world)
    expect(world.waits.map(each => each.wait)).toEqual([30_000])
    await world.settled()
    expect(world.syncs()).toHaveLength(1)
    world.later(30_000)
    await world.settled()
    await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
  })

  it('keeps the longer wait when the service asks for one while a retry is waiting', async () => {
    let calls = 0
    const world = copyWorld(
      answeringSync(body => {
        calls += 1
        if (calls === 1) return refusal(503, 'unavailable')
        if (calls === 2) return refusal(429, 'rate_limited', { 'retry-after': '120' })
        return json(200, syncAnswer(appliedTo(body)))
      })
    )
    await markedIn(world)
    await world.settled()
    expect(world.waits.map(each => each.wait)).toEqual([2_000, 120_000])
    world.later(2_000)
    world.waits[0]?.run()
    await world.stopped()
    expect(world.syncs()).toHaveLength(2)
    world.later(118_000)
    world.waits[1]?.run()
    await vi.waitFor(() => expect(world.syncs()).toHaveLength(3))
    await world.stopped()
    await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
  })

  it('keeps the changes and stops, reading the subscription again, when the account has no access', async () => {
    const world = copyWorld(failingFirst(1, () => refusal(402, 'subscription_required')))
    await markedIn(world)
    expect(world.routes().at(-1)).toBe('GET /v1/me/subscription')
    await expect(world.read()).resolves.toMatchObject({
      sync: 'subscription-required',
      unsynced: 1
    })
    await sentOnlyOnSyncNow(world, 3_600_000)
  })

  it('sends nothing while the account needs a subscription for cloud access', async () => {
    const world = copyWorld(
      undefined,
      {},
      {
        'GET /v1/me/subscription': () => json(200, subscription)
      }
    )
    await world.signIn()
    await world.store.keepSubscription('session-user-1', subscription)
    await world.change({ change: 'mark', ...word })
    await world.settled()
    expect(world.syncs()).toEqual([])
    await expect(world.read()).resolves.toMatchObject({
      sync: 'subscription-required',
      unsynced: 1
    })
  })

  it.each([
    ['Sync Now', { copy: 'sync' }],
    ['a page opening', { copy: 'opened' }]
  ] as const)('reads the subscription again on %s, and syncs once the account has subscribed elsewhere', async (_, asked) => {
    const world = copyWorld()
    await world.signIn()
    await world.store.keepSubscription('session-user-1', subscription)
    await world.change({ change: 'mark', ...word })
    await world.settled()
    await world.ask(asked)
    await vi.waitFor(() => expect(world.sent()).toHaveLength(1))
    await world.stopped()
    await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
  })

  it('asks for a new access token once when one is refused, and syncs with it', async () => {
    const world = copyWorld(failingFirst(1, () => refusal(401, 'unauthorized')))
    await markedIn(world)
    expect(world.routes()).toEqual([
      'GET /v1/auth/token',
      'POST /v1/sync',
      'GET /v1/auth/token',
      'POST /v1/sync'
    ])
    await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
  })

  it('stops as signed out, keeping the copy and its changes, when the session has ended', async () => {
    const world = copyWorld(
      undefined,
      {},
      {
        'GET /v1/auth/token': () => refusal(401, 'unauthorized')
      }
    )
    await markedIn(world)
    await expect(world.read()).resolves.toMatchObject({
      sync: 'signed-out',
      knownWords: [word],
      unsynced: 1
    })
    expect(world.syncs()).toEqual([])
  })

  it.each([
    ['an answer it cannot read', () => json(200, { results: 'none' }), 'waiting'],
    ['a refusal it does not expect', () => refusal(403, 'not_allowed'), 'failed']
  ])('reports %s by its code alone', async (_, failure, state) => {
    const world = copyWorld(failingFirst(1, failure))
    await markedIn(world)
    expect(world.failures).toEqual(['account-sync'])
    await expect(world.read()).resolves.toMatchObject({ sync: state, unsynced: 1 })
  })

  it('reports a second read of everything that the service will not start', async () => {
    const world = copyWorld(failingFirst(1, () => refusal(410, 'invalid_cursor')))
    await markedIn(world)
    expect(world.failures).toEqual(['account-sync-reread'])
    await expect(world.read()).resolves.toMatchObject({ sync: 'waiting' })
  })

  it('reports, waits, and reads from the start again after the wait, when the service refuses each cursor it gave', async () => {
    const world = copyWorld(
      answeringSync(body =>
        body.cursor === null
          ? json(200, syncAnswer(appliedTo(body), [], 'cursor-1', true))
          : refusal(410, 'invalid_cursor')
      )
    )
    await markedIn(world)
    expect(world.syncs().map(asked => (asked.body as { cursor: unknown }).cursor)).toEqual([
      null,
      'cursor-1'
    ])
    expect(world.failures).toEqual(['account-sync-reread'])
    expect(world.waits.map(each => each.wait)).toEqual([2_000])
    await expect(world.read()).resolves.toMatchObject({ sync: 'waiting' })
    world.later(2_000)
    world.waits[0]?.run()
    await vi.waitFor(() => expect(world.waits).toHaveLength(2))
    expect(world.syncs().map(asked => (asked.body as { cursor: unknown }).cursor)).toEqual([
      null,
      'cursor-1',
      null,
      'cursor-1'
    ])
  })

  it('keeps the copy it had when it cannot save a change', async () => {
    const world = copyWorld()
    await markedIn(world)
    world.storage.failSaves()
    await expect(world.change({ change: 'clear', item: word.item })).rejects.toThrow()
    world.storage.failSaves(false)
    await expect(world.read()).resolves.toMatchObject({ knownWords: [word], unsynced: 0 })
  })
})

const words = (count: number) =>
  Array.from({ length: count }, (_, at) => ({
    ...word,
    item: `${String(at).padStart(2, '0')}${word.item.slice(2)}`
  }))

async function queuedWhileSignedOut(world: CopyWorld, marked: (typeof word)[]) {
  await world.signIn()
  await world.settled()
  await world.signOut()
  for (const each of marked) await world.change({ change: 'mark', ...each })
  await world.signIn()
  await world.settled()
}

function refusingWhen(refuses: (body: Sync) => Response | null) {
  const up: string[] = []
  const sync = answeringSync(body => {
    const refused = refuses(body)
    if (refused) return refused
    up.push(...body.mutations.map(mutation => mutation.entityId))
    return json(200, syncAnswer(appliedTo(body)))
  })
  return { sync, up }
}

describe("the copy's sync when the service refuses a whole request", () => {
  it('sends the other changes, and keeps out of later requests the one it refuses alone, reported once', async () => {
    const marked = words(5)
    const refused = marked[3]?.item
    const service = refusingWhen(body =>
      body.mutations.some(mutation => mutation.entityId === refused)
        ? refusal(400, 'bad_request')
        : null
    )
    const world = copyWorld(service.sync)
    await queuedWhileSignedOut(world, marked)
    expect(world.failures).toEqual(['account-sync 400'])
    expect(service.up.toSorted()).toEqual(
      marked.map(each => each.item).filter(item => item !== refused)
    )
    await expect(world.read()).resolves.toMatchObject({ sync: 'failed', unsynced: 1 })
    const asked = world.syncs().length
    await world.change({ change: 'mark', ...otherWord })
    await world.settled()
    expect(world.syncs().length).toBeGreaterThan(asked)
    expect(
      world
        .sent()
        .slice(-1)
        .map(mutation => mutation.entityId)
    ).toEqual([otherWord.item])
    expect(service.up.at(-1)).toBe(otherWord.item)
    expect(world.failures).toEqual(['account-sync 400'])
    await expect(world.read()).resolves.toMatchObject({ unsynced: 1 })
  })

  it('sends fewer at a time when the body is too large, until every change is up', async () => {
    const marked = words(5)
    const service = refusingWhen(body =>
      body.mutations.length > 2 ? refusal(413, 'too_large') : null
    )
    const world = copyWorld(service.sync)
    await queuedWhileSignedOut(world, marked)
    expect(world.failures).toEqual([])
    expect(service.up.toSorted()).toEqual(marked.map(each => each.item))
    await expect(world.read()).resolves.toMatchObject({ sync: 'synced', unsynced: 0 })
  })
})
