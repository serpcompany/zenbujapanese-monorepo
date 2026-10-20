import { createHash } from 'node:crypto'
import { bookmarks } from './bookmarks'
import type { Scope } from './clients'
import type { Cursors, Position } from './cursor'
import {
  type Change,
  type ClientMutation,
  type Entity,
  type Outcome,
  rejected,
  type SyncContext
} from './entities'
import { knownWords } from './known-words'
import { photos, photoWords } from './photos'
import { type Rejection, type RejectionCode, rejection } from './profile'
import { profilePhotos } from './profile-photo'
import { profiles } from './profile-sync'
import { usernameTaken } from './profile-update'
import { recentSearches } from './recent-searches'
import { settings } from './settings'
import type {
  AccountStore,
  EntityReader,
  EntityType,
  JournalEntry,
  LockedAccount,
  MutationRecord,
  RecordedMutation
} from './store'
import { watchHistory } from './watch-history'
import { listWords, wordLists } from './word-lists'
import { wordNotes } from './word-notes'

export const syncLimits = {
  mutations: 50,
  changes: { standard: 100, most: 500 },
  resultsKeptDays: 30
} as const

export interface SyncRequest {
  cursor?: string | null
  limit?: number
  mutations?: ClientMutation[]
}

export type MutationResult =
  | { id: string; status: 'applied'; version: number }
  | { id: string; status: 'conflict'; version: number; current: Change }
  | { id: string; status: 'rejected'; error: Rejection }

export type SyncAnswer =
  | {
      status: 'synced'
      results: MutationResult[]
      changes: Change[]
      cursor: string
      hasMore: boolean
      searchKey?: string
    }
  | { status: 'invalid_cursor' }
  | { status: 'no_account' }

export const syncedEntities: Readonly<Record<EntityType, Entity>> = {
  profile: profiles,
  knownWord: knownWords,
  list: wordLists,
  listWord: listWords,
  watchedVideo: watchHistory,
  bookmarkedSentence: bookmarks,
  wordNote: wordNotes,
  photo: photos,
  photoWord: photoWords,
  profilePhoto: profilePhotos,
  setting: settings,
  recentSearch: recentSearches
}

const unknownEntity = rejection('unknown_entity', 'This service syncs no entity of that type.')
const unknownOperation = rejection('unknown_operation', 'That entity has no such operation.')
const reused = rejection(
  'mutation_id_reused',
  'That mutation ID was already used for a different mutation. Give each mutation its own ID.'
)

const replayedMessages: Record<RejectionCode, string> = {
  invalid_fields: 'Its fields were invalid.',
  username_taken: usernameTaken.message,
  unknown_entity: unknownEntity.message,
  unknown_operation: unknownOperation.message,
  invalid_mutation: 'The mutation was malformed.',
  mutation_id_reused: reused.message,
  already_exists: 'An entity with that ID already exists, or did.',
  unknown_list: 'That list is not in this account, or was deleted.',
  too_many_lists: 'The account had too many lists.',
  list_full: 'The list was full.',
  too_many_bookmarks: 'The account had too many bookmarked sentences.',
  too_many_notes: 'The account had too many notes.',
  unknown_photo: 'That photo is not in this account, or was removed.',
  photo_not_uploaded: 'The account had no file for that photo.',
  photo_full: 'The photo was on too many words.',
  unknown_setting: 'This service syncs no setting of that name.',
  not_allowed: 'This app may not make that change.'
}

const notAllowed = rejection(
  'not_allowed',
  "This app's access to the account doesn't let it make that change."
)

const entityOf = (type: string): Entity | null =>
  Object.hasOwn(syncedEntities, type) ? syncedEntities[type as EntityType] : null

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const object = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map(key => [key, canonical(object[key])])
  )
}

function requestSha256(mutation: ClientMutation): string {
  const { entity, operation, entityId, baseVersion, fields } = mutation
  const request = [entity, operation, entityId ?? null, baseVersion ?? null, fields ?? null]
  return createHash('sha256')
    .update(JSON.stringify(canonical(request)))
    .digest('hex')
}

async function outcomeOf(
  account: LockedAccount,
  mutation: ClientMutation,
  context: SyncContext
): Promise<Outcome> {
  const entity = entityOf(mutation.entity)
  if (!entity) return rejected(unknownEntity)
  const operation = Object.hasOwn(entity.operations, mutation.operation)
    ? entity.operations[mutation.operation]
    : undefined
  if (!operation) return rejected(unknownOperation)
  if (!operation.needs.some(scope => context.granted.has(scope))) return rejected(notAllowed)
  return operation.apply(account, mutation, context)
}

function resultOf(id: string, outcome: Outcome): MutationResult {
  if (outcome.status === 'applied') return { id, ...outcome }
  if (outcome.status === 'conflict') {
    return { id, status: 'conflict', version: outcome.current.version, current: outcome.current }
  }
  return { id, status: 'rejected', error: outcome.rejection }
}

const isRejectionCode = (code: string | null): code is RejectionCode =>
  code !== null && Object.hasOwn(replayedMessages, code)

async function replayed(record: RecordedMutation, account: LockedAccount): Promise<Outcome> {
  if (record.outcome === 'applied' && record.resultingServerVersion !== null) {
    return { status: 'applied', version: record.resultingServerVersion }
  }
  const current =
    record.outcome === 'conflict'
      ? await entityOf(record.entityType)?.current(account, record.entityId ?? account.profile.id)
      : null
  if (current) return { status: 'conflict', current }
  const code = isRejectionCode(record.errorCode) ? record.errorCode : 'invalid_mutation'
  return rejected(rejection(code, replayedMessages[code]))
}

function recordOf(mutation: ClientMutation, sha256: string, outcome: Outcome): MutationRecord {
  return {
    clientMutationId: mutation.id,
    entityType: mutation.entity,
    entityId: mutation.entityId ?? null,
    operation: mutation.operation,
    requestSha256: sha256,
    outcome: outcome.status,
    resultingServerVersion:
      outcome.status === 'applied'
        ? outcome.version
        : outcome.status === 'conflict'
          ? outcome.current.version
          : null,
    errorCode: outcome.status === 'rejected' ? outcome.rejection.code : null
  }
}

function applyMutation(
  store: AccountStore,
  userId: string,
  mutation: ClientMutation,
  context: SyncContext
) {
  return store.withLockedAccount(userId, async account => {
    const sha256 = requestSha256(mutation)
    const recorded = await account.recordedMutation(mutation.id)
    if (recorded) {
      return resultOf(
        mutation.id,
        recorded.requestSha256 === sha256 ? await replayed(recorded, account) : rejected(reused)
      )
    }
    const outcome = await outcomeOf(account, mutation, context)
    await account.recordMutation(recordOf(mutation, sha256, outcome))
    await account.forgetMutationsOlderThan(syncLimits.resultsKeptDays)
    return resultOf(mutation.id, outcome)
  })
}

const childEntities = new Set<Change['entity']>(['listWord', 'photoWord'])
const parentsFirst = (change: Change) => (childEntities.has(change.entity) ? 1 : 0)

async function changesIn(
  reader: EntityReader,
  page: JournalEntry[],
  granted: ReadonlySet<Scope>
): Promise<Change[] | null> {
  const seen = new Set<string>()
  const changes: Change[] = []
  for (const entry of page) {
    const key = `${entry.entityType}\u0000${entry.entityId}`
    const entity = entityOf(entry.entityType)
    if (seen.has(key) || !entity || !granted.has(entity.reads)) continue
    seen.add(key)
    const change = await entity.current(reader, entry.entityId)
    if (!change) return null
    changes.push(change)
  }
  return changes.sort((one, other) => parentsFirst(one) - parentsFirst(other))
}

const floorFor = async (store: AccountStore, userId: string, from: Position | undefined) =>
  from ? Math.max(from.floor, from.sequence) : store.accountJournalHead(userId)

export function syncer(
  store: AccountStore,
  cursors: Cursors,
  searchKeys: (userId: string) => string,
  afterChanges: () => void
) {
  return async function sync(
    userId: string,
    request: SyncRequest,
    granted: ReadonlySet<Scope>
  ): Promise<SyncAnswer> {
    if (!(await store.profile(userId))) return { status: 'no_account' }
    const from = request.cursor ? cursors.decode(userId, request.cursor) : undefined
    if (from === null) return { status: 'invalid_cursor' }
    if (from && from.sequence > (await store.journalHead())) return { status: 'invalid_cursor' }
    if (from && (await store.forgottenThrough(userId)) > from.floor) {
      return { status: 'invalid_cursor' }
    }
    const after = from?.sequence ?? 0
    const results: MutationResult[] = []
    const context = { granted, searchKey: searchKeys(userId) }
    for (const mutation of request.mutations ?? []) {
      const result = await applyMutation(store, userId, mutation, context)
      if (!result) return { status: 'no_account' }
      results.push(result)
    }
    if (results.some(result => result.status === 'applied')) afterChanges()
    const floor = await floorFor(store, userId, from)
    const limit = request.limit ?? syncLimits.changes.standard
    const entries = await store.changesAfter(userId, after, limit + 1)
    const page = entries.slice(0, limit)
    const changes = await changesIn(store.reader(userId), page, granted)
    if (!changes) return { status: 'no_account' }
    const last = page.at(-1)
    const same = !last && floor === from?.floor ? request.cursor : null
    return {
      status: 'synced',
      results,
      changes,
      cursor: same || cursors.encode(userId, { sequence: last?.sequence ?? after, floor }),
      hasMore: entries.length > limit,
      ...(granted.has('searches:read') ? { searchKey: context.searchKey } : {})
    }
  }
}
