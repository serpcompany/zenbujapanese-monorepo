import type { Mutation, MutationResult, SyncedChange } from '@zenbu/account-rules/account-copy'
import { fields } from '../../shared/messages'
import type { Settings } from '../../shared/settings'
import { type Draft, type Item, isEntity, itemKey, keyOf, type Queued, queuedKey } from './kept'
import { browserWrites, isKeptSetting, reconcile } from './synced-settings'

export type SyncAnswer = {
  results: MutationResult[]
  changes: SyncedChange[]
  cursor: string
  hasMore: boolean
}

export type Batch = { cursor: string | null; mutations: Mutation[] }

export type Applied = {
  known: Map<string, boolean>
  writes: Partial<Settings>
  more: boolean
}

const statuses: ReadonlySet<unknown> = new Set(['applied', 'conflict', 'rejected'])

function changeOf(value: unknown): SyncedChange | null {
  const change = fields(value)
  if (!change || typeof change.entity !== 'string' || typeof change.entityId !== 'string') {
    return null
  }
  if (typeof change.version !== 'number' || typeof change.operation !== 'string') return null
  if (change.data !== null && fields(change.data) === undefined) return null
  return change as unknown as SyncedChange
}

function resultOf(value: unknown): MutationResult | null {
  const result = fields(value)
  if (!result || typeof result.id !== 'string' || !statuses.has(result.status)) return null
  if (result.status === 'rejected') {
    return typeof fields(result.error)?.code === 'string' ? (result as MutationResult) : null
  }
  if (typeof result.version !== 'number') return null
  if (result.status === 'conflict' && changeOf(result.current) === null) return null
  return result as MutationResult
}

export function syncAnswerOf(value: Record<string, unknown>, sent: Mutation[]): SyncAnswer | null {
  const { results, changes, cursor, hasMore } = value
  if (!Array.isArray(results) || !Array.isArray(changes)) return null
  if (typeof cursor !== 'string' || typeof hasMore !== 'boolean') return null
  const read = results.map(resultOf)
  const pulled = changes.map(changeOf)
  if (read.some(result => result === null) || pulled.some(change => change === null)) return null
  const answered = new Set(read.map(result => result?.id))
  if (sent.some(mutation => !answered.has(mutation.id))) return null
  return {
    results: read as MutationResult[],
    changes: pulled as SyncedChange[],
    cursor,
    hasMore
  }
}

const isKept = (change: { entity: string; entityId: string }) =>
  isEntity(change.entity) && (change.entity !== 'setting' || isKeptSetting(change.entityId))

const itemOf = (change: SyncedChange): Item => ({
  entity: change.entity as Item['entity'],
  entityId: change.entityId,
  version: change.entity === 'setting' && change.data === null ? 0 : change.version,
  data: change.data
})

type Clock = { newId(): string }

class Applying {
  readonly known = new Map<string, boolean>()
  readonly toBrowser: Item[] = []

  constructor(
    readonly draft: Draft,
    readonly queue: Queued[],
    readonly clock: Clock
  ) {}

  queuedFor(key: string) {
    return this.queue.some(queued => queuedKey(queued) === key)
  }

  deferred(key: string) {
    return this.draft.meta?.deferred.find(item => itemKey(item) === key)
  }

  defer(item: Item) {
    const meta = this.draft.meta
    if (!meta) return
    meta.deferred = [...meta.deferred.filter(each => itemKey(each) !== itemKey(item)), item]
  }

  undefer(key: string) {
    const meta = this.draft.meta
    if (meta) meta.deferred = meta.deferred.filter(each => itemKey(each) !== key)
  }

  take(item: Item) {
    const key = itemKey(item)
    const was = this.draft.get(key)
    if (
      item.entity === 'knownWord' &&
      (was?.data?.known === true) !== (item.data?.known === true)
    ) {
      this.known.set(item.entityId, item.data?.known === true)
    }
    if (item.entity === 'setting') this.toBrowser.push(item)
    if (item.entity === 'list' && item.data === null) this.dropWords(item.entityId)
    this.draft.put(item)
  }

  listHere(item: Item) {
    const list = String(item.data?.listId ?? item.entityId.split('/')[0])
    return Boolean(this.draft.get(keyOf('list', list))?.data)
  }

  dropWords(list: string) {
    const meta = this.draft.meta
    const words = `listWord:${list}/`
    for (const item of this.draft.all()) {
      if (itemKey(item).startsWith(words)) this.draft.remove(itemKey(item))
    }
    if (meta) meta.held = meta.held.filter(item => !itemKey(item).startsWith(words))
  }

  undo(queued: Queued) {
    const key = queuedKey(queued)
    const kept = this.deferred(key) ?? queued.before
    this.undefer(key)
    if (kept && (kept.entity !== 'listWord' || this.listHere(kept))) this.take(kept)
    else {
      const was = this.draft.get(key)
      if (was?.entity === 'knownWord' && was.data?.known === true) {
        this.known.set(was.entityId, false)
      }
      this.draft.remove(key)
    }
  }

  push(mutation: Mutation) {
    this.queue.push({ mutation, sent: false, before: null })
  }
}

function rebase(run: Applying, key: string, version: number) {
  for (const later of run.queue.filter(each => queuedKey(each) === key && !each.sent)) {
    later.mutation = { ...later.mutation, baseVersion: version }
  }
  const item = run.draft.get(key)
  if (item) run.draft.put({ ...item, version })
}

const rebasedOnConflict = (mutation: Mutation) =>
  mutation.entity !== 'setting' &&
  !(mutation.entity === 'wordNote' && mutation.operation === 'write')

function applied(run: Applying, queued: Queued, version: number) {
  const key = queuedKey(queued)
  const item = run.draft.get(key)
  const { mutation } = queued
  if (run.queuedFor(key)) {
    rebase(run, key, version)
    return
  }
  const deferred = run.deferred(key)
  run.undefer(key)
  if (deferred && deferred.version >= version) {
    run.take(deferred)
    return
  }
  const data =
    mutation.entity === 'setting'
      ? { name: mutation.entityId, value: mutation.fields?.value }
      : (item?.data ?? null)
  run.draft.put({
    entity: mutation.entity as Item['entity'],
    entityId: mutation.entityId,
    version,
    data
  })
}

const noteData = (id: string, fields: Record<string, unknown>) => ({
  id,
  itemId: fields.item,
  text: fields.text,
  headword: fields.headword ?? null,
  reading: fields.reading ?? null
})

function keptNote(run: Applying, queued: Queued, current: Item) {
  const ours = queued.mutation.fields ?? {}
  const theirs = current.data
  if (!theirs || theirs.text === ours.text) {
    run.take(current)
    return
  }
  const mine = {
    item: theirs.itemId,
    text: ours.text,
    headword: theirs.headword ?? null,
    reading: theirs.reading ?? null
  }
  const movedOnly = theirs.text === queued.before?.data?.text
  const id = movedOnly ? current.entityId : run.clock.newId()
  const version = movedOnly ? current.version : 0
  if (!movedOnly) run.take(current)
  run.draft.put({ entity: 'wordNote', entityId: id, version, data: noteData(id, mine) })
  run.push({
    ...queued.mutation,
    id: run.clock.newId(),
    entityId: id,
    baseVersion: version,
    fields: mine
  })
}

function conflicted(run: Applying, queued: Queued, current: Item) {
  const key = queuedKey(queued)
  if (run.queuedFor(key)) {
    run.defer(current)
    if (rebasedOnConflict(queued.mutation)) rebase(run, key, current.version)
    return
  }
  run.undefer(key)
  const { mutation } = queued
  if (mutation.entity === 'wordNote' && mutation.operation === 'write') {
    keptNote(run, queued, current)
    return
  }
  if (mutation.entity === 'setting' && current.data === null) {
    run.draft.put(current)
    run.push({ ...mutation, id: run.clock.newId(), baseVersion: 0 })
    return
  }
  run.take(current)
}

const keptOnRejection = (queued: Queued, code: string) =>
  queued.mutation.entity === 'wordNote' ||
  (queued.mutation.entity === 'list' && code === 'already_exists')

function rejected(run: Applying, queued: Queued, code: string) {
  const key = queuedKey(queued)
  const meta = run.draft.meta
  if (run.queuedFor(key) || !meta) return
  if (queued.mutation.entity === 'setting') {
    meta.refused[queued.mutation.entityId] = JSON.stringify(queued.mutation.fields?.value)
    run.undefer(key)
    return
  }
  if (keptOnRejection(queued, code)) {
    const deferred = run.deferred(key)
    run.undefer(key)
    if (deferred) run.take(deferred)
    return
  }
  run.undo(queued)
}

function resultsOf(run: Applying, batch: Batch, answer: SyncAnswer) {
  for (const result of answer.results) {
    const queued = run.queue.find(each => each.sent && each.mutation.id === result.id)
    if (!queued || !batch.mutations.some(mutation => mutation.id === result.id)) continue
    run.queue.splice(run.queue.indexOf(queued), 1)
    if (result.status === 'applied') applied(run, queued, result.version)
    else if (result.status === 'conflict') {
      if (isKept(result.current)) conflicted(run, queued, itemOf(result.current))
    } else rejected(run, queued, result.error.code)
  }
}

function changesOf(run: Applying, answer: SyncAnswer) {
  const meta = run.draft.meta
  for (const change of answer.changes) {
    if (!meta || !isKept(change)) continue
    const item = itemOf(change)
    const key = itemKey(item)
    if (meta.fullRead && item.entity === 'wordNote') meta.fullRead.push(key)
    if (run.queuedFor(key)) run.defer(item)
    else if (item.entity === 'listWord' && item.data && !run.listHere(item)) {
      meta.held = [...meta.held.filter(each => itemKey(each) !== key), item]
    } else run.take(item)
  }
}

function pageEnd(run: Applying, answer: SyncAnswer) {
  const meta = run.draft.meta
  if (!meta) return
  meta.cursor = answer.cursor
  const waiting = meta.held
  meta.held = []
  for (const item of waiting) {
    if (run.listHere(item)) run.take(item)
    else meta.held.push(item)
  }
  if (answer.hasMore) return
  meta.held = []
  if (meta.fullRead) {
    const seen = new Set(meta.fullRead)
    for (const item of run.draft.all()) {
      const key = itemKey(item)
      if (item.entity === 'wordNote' && item.version > 0 && !seen.has(key) && !run.queuedFor(key)) {
        run.draft.remove(key)
      }
    }
    meta.fullRead = null
  }
}

export function applyAnswer(
  draft: Draft,
  batch: Batch,
  answer: SyncAnswer,
  browser: Settings,
  clock: Clock & { now(): number }
): Applied {
  const meta = draft.meta
  if (!meta) return { known: new Map(), writes: {}, more: false }
  const run = new Applying(draft, meta.queue, clock)
  if (meta.fullRead) {
    for (const mutation of batch.mutations) {
      if (mutation.entity === 'wordNote') meta.fullRead.push(keyOf('wordNote', mutation.entityId))
    }
  }
  resultsOf(run, batch, answer)
  changesOf(run, answer)
  pageEnd(run, answer)
  const writes = browserWrites(
    run.toBrowser.filter(item => !run.queuedFor(itemKey(item))),
    browser
  )
  reconcile(draft, { ...browser, ...writes }, clock.newId)
  const more = answer.hasMore || meta.queue.length > 0
  if (!more) meta.lastSyncedAt = clock.now()
  return { known: run.known, writes, more }
}
