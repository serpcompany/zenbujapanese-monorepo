import type { Mutation } from '@zenbu/account-rules/account-copy'
import type { SyncState } from '../../shared/account-copy'
import { readSettings, type SettingsStore } from '../../shared/settings'
import type { Answered } from '../account/api'
import type { AccountStore } from '../account/store'
import type { AccessTokens } from '../account/tokens'
import { applyAnswer, type Batch, syncAnswerOf } from './answer'
import type { Draft, KeptCopy } from './kept'
import { queuedKey } from './kept'
import { reconcile } from './synced-settings'

export type Reason = 'change' | 'settings' | 'retry' | 'startup' | 'opened' | 'sync-now' | 'access'

export type CopyFailure = 'account-sync' | 'account-sync-reread' | 'account-copy'

export type SyncParts = {
  copy: KeptCopy
  store: AccountStore
  tokens: AccessTokens
  readSubscription(): Promise<boolean>
  settings: SettingsStore
  tell(known: Record<string, boolean>): void
  reportFailure(code: CopyFailure): void
  later(run: () => void, wait: number): void
  now(): number
  random(): number
  newId(): string
}

const mutationsAtOnce = 50
const bytesAtOnce = 48 * 1024
const pageSize = 500
const pagesAtOnce = 200
const staleAfter = 15 * 60_000
const firstWait = 2_000
const longestWait = 5 * 60_000

const sizeOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

function batchOf(draft: Draft): Batch | null {
  const meta = draft.meta
  if (!meta) return null
  const sent = meta.queue.filter(queued => queued.sent)
  const inBatch = new Set(sent.map(queuedKey))
  const mutations: Mutation[] = sent.map(queued => queued.mutation)
  let bytes = sizeOf(mutations)
  for (const queued of meta.queue) {
    if (queued.sent || inBatch.has(queuedKey(queued))) continue
    if (mutations.length >= mutationsAtOnce) break
    const size = sizeOf(queued.mutation) + 1
    if (mutations.length > 0 && bytes + size > bytesAtOnce) break
    queued.sent = true
    inBatch.add(queuedKey(queued))
    mutations.push(queued.mutation)
    bytes += size
  }
  return { cursor: meta.cursor, mutations }
}

const fresh = (lastSyncedAt: number | null, now: number) =>
  lastSyncedAt !== null && now - lastSyncedAt <= staleAfter

type Step = 'more' | 'done' | 'stopped'

export function accountSync(parts: SyncParts) {
  const { copy, store, tokens } = parts
  let state: SyncState = 'not-synced'
  let running: Promise<void> | null = null
  let again = false
  let paywalled = false
  let rateLimitedUntil = 0
  let backedOffUntil = 0
  let failures = 0
  let retryAt = 0
  let rereadInRun = false

  function retryIn(wait: number) {
    const at = parts.now() + wait
    if (at <= retryAt) return
    retryAt = at
    parts.later(() => {
      if (retryAt !== at) return
      retryAt = 0
      void chance('retry')
    }, wait)
  }

  function backOff(offline: boolean): Step {
    failures += 1
    const wait = Math.min(firstWait * 2 ** (failures - 1), longestWait) * (0.5 + parts.random() / 2)
    backedOffUntil = parts.now() + wait
    state = offline ? 'offline' : 'waiting'
    retryIn(wait)
    return 'stopped'
  }

  async function failed(answer: Extract<Answered, { ok: false }>, batch: Batch): Promise<Step> {
    if (answer.status === 401) {
      if ((await store.sessionToken()) === null) {
        state = 'signed-out'
        return 'stopped'
      }
      return backOff(false)
    }
    if (answer.status === 402) {
      paywalled = true
      state = 'subscription-required'
      await parts.readSubscription()
      return 'stopped'
    }
    if (answer.status === 410) {
      const readingInFull = await copy.edit(draft => {
        if (!draft.meta) return false
        const reading = draft.meta.fullRead !== null
        Object.assign(draft.meta, { cursor: null, fullRead: [], deferred: [], held: [] })
        return reading
      })
      if (batch.cursor !== null && !readingInFull && !rereadInRun) {
        rereadInRun = true
        return 'more'
      }
      parts.reportFailure('account-sync-reread')
      return backOff(false)
    }
    if (answer.status === 429) {
      const wait = (answer.retryAfter ?? 60) * 1000
      rateLimitedUntil = parts.now() + wait
      state = 'waiting'
      retryIn(wait)
      return 'stopped'
    }
    if (answer.status === 0 || answer.status >= 500) return backOff(answer.status === 0)
    parts.reportFailure('account-sync')
    state = 'failed'
    return 'stopped'
  }

  async function step(): Promise<Step> {
    const sessionToken = await store.sessionToken()
    const kept = await store.keptAccount()
    if (sessionToken === null || kept === null) {
      state = 'signed-out'
      return 'stopped'
    }
    if (kept.subscription?.cloudAccess === 'subscription_required') {
      state = 'subscription-required'
      return 'stopped'
    }
    const browser = await readSettings(parts.settings)
    const batch = await copy.edit(draft => {
      if (draft.meta?.userId !== kept.user.id) return null
      reconcile(draft, browser, parts.newId)
      return batchOf(draft)
    })
    if (batch === null) {
      state = 'not-synced'
      return 'stopped'
    }
    state = 'syncing'
    const answer = await tokens.withAccess(sessionToken, {
      method: 'POST',
      path: '/v1/sync',
      body: { cursor: batch.cursor, limit: pageSize, mutations: batch.mutations }
    })
    if (!answer.ok) return failed(answer, batch)
    const synced = syncAnswerOf(answer.value, batch.mutations)
    if (synced === null) {
      parts.reportFailure('account-sync')
      return backOff(false)
    }
    const latest = await readSettings(parts.settings)
    const applied = await copy.edit(async draft => {
      if (!(await store.isCurrent(sessionToken)) || draft.meta?.userId !== kept.user.id) {
        return null
      }
      const outcome = applyAnswer(draft, batch, synced, latest, parts)
      if (Object.keys(outcome.writes).length > 0) await parts.settings.set(outcome.writes)
      return outcome
    })
    if (applied === null) return 'more'
    failures = 0
    if (applied.known.size > 0) parts.tell(Object.fromEntries(applied.known))
    return applied.more ? 'more' : 'done'
  }

  async function runAll() {
    rereadInRun = false
    do {
      again = false
      let stepped: Step = 'more'
      for (let page = 0; page < pagesAtOnce && stepped === 'more'; page += 1) {
        stepped = await step()
      }
      if (stepped === 'stopped') return
      state = stepped === 'done' ? 'synced' : 'not-synced'
    } while (again)
  }

  function start(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = runAll()
      .catch(() => {
        state = 'failed'
        parts.reportFailure('account-copy')
      })
      .finally(() => {
        running = null
      })
    return running
  }

  async function due(reason: Reason, now: number): Promise<boolean> {
    if (now < rateLimitedUntil) return false
    if (reason === 'sync-now' || reason === 'access') {
      paywalled = false
      return true
    }
    if (paywalled || now < backedOffUntil) return false
    if (reason !== 'startup' && reason !== 'opened') return true
    const meta = await copy.look(draft => draft.meta)
    return meta !== null && (meta.queue.length > 0 || !fresh(meta.lastSyncedAt, now))
  }

  const needsSubscription = async () =>
    (await store.keptAccount())?.subscription?.cloudAccess === 'subscription_required'

  async function subscribedSince(reason: Reason): Promise<void> {
    if (reason !== 'sync-now' && reason !== 'opened') return
    if (!paywalled && !(await needsSubscription())) return
    await parts.readSubscription()
    if (!(await needsSubscription())) paywalled = false
  }

  async function chance(reason: Reason): Promise<void> {
    const now = parts.now()
    await subscribedSince(reason)
    if (await due(reason, now)) await start()
    else if (running) await running
  }

  return { chance, state: () => state }
}
