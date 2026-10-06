import { createHash } from 'node:crypto'
import type { Cursors } from './cursor'
import { type Profile, type Rejection, type RejectionCode, rejection } from './profile'
import { updateProfile, usernameTaken } from './profile-update'
import type {
  AccountStore,
  EntityType,
  JournalEntry,
  LockedAccount,
  MutationRecord,
  RecordedMutation
} from './store'

export const syncLimits = { mutations: 50, changes: { standard: 100, most: 500 } } as const

export interface ClientMutation {
  id: string
  entity: string
  operation: string
  entityId?: string
  baseVersion?: number
  fields?: Record<string, unknown>
}

export interface SyncRequest {
  cursor?: string | null
  limit?: number
  mutations?: ClientMutation[]
}

export type MutationResult =
  | { id: string; status: 'applied'; version: number }
  | { id: string; status: 'conflict'; version: number; current: Profile }
  | { id: string; status: 'rejected'; error: Rejection }

export interface Change {
  entity: EntityType
  entityId: string
  operation: 'put'
  version: number
  data: Profile
}

export type SyncAnswer =
  | {
      status: 'synced'
      results: MutationResult[]
      changes: Change[]
      cursor: string
      hasMore: boolean
    }
  | { status: 'invalid_cursor' }
  | { status: 'no_account' }

type Outcome =
  | { status: 'applied'; version: number }
  | { status: 'conflict'; current: Profile }
  | { status: 'rejected'; rejection: Rejection }

interface Entity {
  operations: Record<string, (account: LockedAccount, mutation: ClientMutation) => Promise<Outcome>>
  current(store: AccountStore, userId: string, entityId: string): Promise<Change | null>
}

const unknownEntity = rejection('unknown_entity', 'This service syncs no entity of that type.')
const unknownOperation = rejection('unknown_operation', 'That entity has no such operation.')
const reused = rejection(
  'mutation_id_reused',
  'That mutation ID was already used for a different mutation. Give each mutation its own ID.'
)
const notTheAccount = rejection(
  'invalid_mutation',
  "A profile's entityId is the signed-in account's ID, or left out."
)
const noBaseVersion = rejection(
  'invalid_mutation',
  'Send baseVersion: the profile version the change was made to.'
)

const replayedMessages: Record<RejectionCode, string> = {
  invalid_fields: 'Its fields were invalid.',
  username_taken: usernameTaken.message,
  unknown_entity: unknownEntity.message,
  unknown_operation: unknownOperation.message,
  invalid_mutation: 'The mutation was malformed.',
  mutation_id_reused: reused.message
}

const entities: Record<EntityType, Entity> = {
  profile: {
    operations: {
      async update(account, mutation) {
        if (mutation.entityId !== undefined && mutation.entityId !== account.profile.id) {
          return { status: 'rejected', rejection: notTheAccount }
        }
        if (mutation.baseVersion === undefined)
          return { status: 'rejected', rejection: noBaseVersion }
        const update = await updateProfile(account, mutation.baseVersion, mutation.fields ?? {})
        if (update.status === 'conflict') return { status: 'conflict', current: update.profile }
        if (update.status === 'rejected') return { status: 'rejected', rejection: update.rejection }
        return { status: 'applied', version: update.profile.version }
      }
    },
    async current(store, userId) {
      const profile = await store.profile(userId)
      return (
        profile && {
          entity: 'profile',
          entityId: profile.id,
          operation: 'put',
          version: profile.version,
          data: profile
        }
      )
    }
  }
}

const entityOf = (type: string): Entity | null =>
  Object.hasOwn(entities, type) ? entities[type as EntityType] : null

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

async function outcomeOf(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const entity = entityOf(mutation.entity)
  if (!entity) return { status: 'rejected', rejection: unknownEntity }
  const operation = Object.hasOwn(entity.operations, mutation.operation)
    ? entity.operations[mutation.operation]
    : undefined
  if (!operation) return { status: 'rejected', rejection: unknownOperation }
  return operation(account, mutation)
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

function replayed(record: RecordedMutation, account: LockedAccount): Outcome {
  if (record.outcome === 'applied' && record.resultingServerVersion !== null) {
    return { status: 'applied', version: record.resultingServerVersion }
  }
  if (record.outcome === 'conflict') return { status: 'conflict', current: account.profile }
  const code = isRejectionCode(record.errorCode) ? record.errorCode : 'invalid_mutation'
  return { status: 'rejected', rejection: rejection(code, replayedMessages[code]) }
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

function applyMutation(store: AccountStore, userId: string, mutation: ClientMutation) {
  return store.withLockedAccount(userId, async account => {
    const sha256 = requestSha256(mutation)
    const recorded = await account.recordedMutation(mutation.id)
    if (recorded) {
      return resultOf(
        mutation.id,
        recorded.requestSha256 === sha256
          ? replayed(recorded, account)
          : { status: 'rejected', rejection: reused }
      )
    }
    const outcome = await outcomeOf(account, mutation)
    await account.recordMutation(recordOf(mutation, sha256, outcome))
    return resultOf(mutation.id, outcome)
  })
}

async function changesIn(
  store: AccountStore,
  userId: string,
  page: JournalEntry[]
): Promise<Change[] | null> {
  const seen = new Set<string>()
  const changes: Change[] = []
  for (const entry of page) {
    const key = `${entry.entityType}\u0000${entry.entityId}`
    const entity = entityOf(entry.entityType)
    if (seen.has(key) || !entity) continue
    seen.add(key)
    const change = await entity.current(store, userId, entry.entityId)
    if (!change) return null
    changes.push(change)
  }
  return changes
}

export function syncer(store: AccountStore, cursors: Cursors) {
  return async (userId: string, request: SyncRequest): Promise<SyncAnswer> => {
    if (!(await store.profile(userId))) return { status: 'no_account' }
    const after = request.cursor ? cursors.decode(userId, request.cursor) : 0
    if (after === null || after > (await store.journalHead())) return { status: 'invalid_cursor' }
    const results: MutationResult[] = []
    for (const mutation of request.mutations ?? []) {
      const result = await applyMutation(store, userId, mutation)
      if (!result) return { status: 'no_account' }
      results.push(result)
    }
    const limit = request.limit ?? syncLimits.changes.standard
    const entries = await store.changesAfter(userId, after, limit + 1)
    const page = entries.slice(0, limit)
    const changes = await changesIn(store, userId, page)
    if (!changes) return { status: 'no_account' }
    const last = page.at(-1)
    return {
      status: 'synced',
      results,
      changes,
      cursor: last
        ? cursors.encode(userId, last.sequence)
        : (request.cursor ?? cursors.encode(userId, after)),
      hasMore: entries.length > limit
    }
  }
}
