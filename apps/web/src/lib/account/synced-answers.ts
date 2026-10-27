import type { KindPage, MutationResult, SyncedChange } from '@zenbu/account-rules/account-copy'
import { isFields } from './answers'

const operations = new Set(['put', 'delete'])

const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

function changeOf(value: unknown): SyncedChange | null {
  if (!isFields(value)) return null
  const { entity, entityId, operation, version, data } = value
  if (typeof entity !== 'string' || typeof entityId !== 'string') return null
  if (typeof operation !== 'string' || !operations.has(operation) || !isVersion(version)) {
    return null
  }
  const held = isFields(data) ? data : null
  if ((operation === 'put') !== (held !== null) || (held === null && data !== null)) return null
  return { entity, entityId, operation, version, data: held }
}

export function kindPageOf(value: unknown): KindPage | null {
  if (!isFields(value) || !Array.isArray(value.changes)) return null
  const { cursor, hasMore } = value
  if (typeof cursor !== 'string' || typeof hasMore !== 'boolean') return null
  const changes = value.changes.map(changeOf)
  if (changes.some(change => change === null)) return null
  return { changes: changes as SyncedChange[], cursor, hasMore }
}

function resultOf(value: unknown): MutationResult | null {
  if (!isFields(value) || typeof value.id !== 'string') return null
  const { id, status } = value
  if (status === 'applied' && isVersion(value.version)) {
    return { id, status, version: value.version }
  }
  const current = changeOf(value.current)
  if (status === 'conflict' && isVersion(value.version) && current) {
    return { id, status, version: value.version, current }
  }
  const error = isFields(value.error) ? value.error : null
  if (status === 'rejected' && typeof error?.code === 'string') {
    const message = typeof error.message === 'string' ? error.message : ''
    return { id, status, error: { code: error.code, message } }
  }
  return null
}

export function mutationResultsOf(value: unknown): MutationResult[] | null {
  if (!isFields(value) || !Array.isArray(value.results)) return null
  const results = value.results.map(resultOf)
  return results.some(result => result === null) ? null : (results as MutationResult[])
}

const searchKeyPattern = /^[0-9a-f]{64}$/

export function searchKeyOf(value: unknown): string | null {
  if (!isFields(value) || typeof value.searchKey !== 'string') return null
  return searchKeyPattern.test(value.searchKey) ? value.searchKey : null
}
