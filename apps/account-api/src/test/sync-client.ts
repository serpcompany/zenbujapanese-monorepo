import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { useAccountService } from './accounts'

type Accounts = ReturnType<typeof useAccountService>

interface Entity {
  version: number
  data: Record<string, unknown> | null
}

interface Change extends Entity {
  entity: string
  entityId: string
}

interface Queued {
  id: string
  entity: string
  operation: string
  entityId: string
  baseVersion: number
  fields?: Record<string, unknown>
}

const listOf = (key: string) => key.slice('listWord:'.length).split('/')[0]

export class SyncClient {
  readonly local = new Map<string, Entity>()
  private queue: Queued[] = []
  private cursor: string | null = null

  constructor(
    private readonly accounts: Accounts,
    private readonly token: string
  ) {}

  private key = (entity: string, entityId: string) => `${entity}:${entityId}`

  dataOf(entity: string, entityId: string) {
    return this.local.get(this.key(entity, entityId))?.data ?? null
  }

  change(entity: string, operation: string, entityId: string, fields?: Record<string, unknown>) {
    const key = this.key(entity, entityId)
    const baseVersion = this.local.get(key)?.version ?? 0
    this.queue.push({ id: randomUUID(), entity, operation, entityId, baseVersion, fields })
    const removed = ['clear', 'delete', 'remove'].includes(operation)
    const data =
      entity === 'knownWord'
        ? { ...(this.dataOf(entity, entityId) ?? fields), known: operation === 'mark' }
        : removed
          ? null
          : { ...this.dataOf(entity, entityId), ...fields }
    this.local.set(key, { version: baseVersion, data })
    if (entity === 'list' && operation === 'delete') this.dropWordsOf(entityId)
  }

  private dropWordsOf(listId: string) {
    for (const key of [...this.local.keys()]) {
      if (key.startsWith('listWord:') && listOf(key) === listId) this.local.delete(key)
    }
  }

  private apply(change: Change, waiting: Change[]) {
    if (change.entity === 'profile') return
    const key = this.key(change.entity, change.entityId)
    if (change.entity === 'listWord' && !this.dataOf('list', listOf(key))) {
      waiting.push(change)
      return
    }
    this.local.set(key, { version: change.version, data: change.data })
    if (change.entity === 'list' && change.data === null) this.dropWordsOf(change.entityId)
  }

  async sync() {
    const waiting: Change[] = []
    for (;;) {
      const { queue } = this
      this.queue = []
      const answer = await this.accounts.sync(this.token, {
        cursor: this.cursor,
        mutations: queue.map(({ fields, ...mutation }) => ({
          ...mutation,
          ...(fields ? { fields } : {})
        }))
      })
      expect(answer.status, JSON.stringify(answer.body)).toBe(200)
      const body = answer.body as unknown as {
        results: {
          status: string
          version?: number
          current?: Change
          error?: { code: string }
        }[]
        changes: Change[]
        cursor: string
        hasMore: boolean
      }
      body.results.forEach((result, index) => {
        const sent = queue[index]
        if (!sent) return
        const key = this.key(sent.entity, sent.entityId)
        if (result.status === 'rejected') {
          expect(result.error?.code, JSON.stringify(result)).toBe('unknown_list')
          this.local.delete(key)
          return
        }
        const entity = this.local.get(key)
        if (result.current) this.apply(result.current, waiting)
        else if (entity && result.version !== undefined) entity.version = result.version
      })
      for (const change of body.changes) this.apply(change, waiting)
      this.cursor = body.cursor
      if (!body.hasMore) break
    }
    for (const change of waiting) {
      if (this.dataOf('list', change.entityId.split('/')[0] ?? '')) this.apply(change, [])
    }
  }

  state() {
    return new Map([...this.local].filter(([, entity]) => entity.data !== null))
  }
}
