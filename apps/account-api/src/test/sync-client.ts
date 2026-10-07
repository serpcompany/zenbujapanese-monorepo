import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { useAccountService } from './accounts'

type Accounts = ReturnType<typeof useAccountService>

interface Entity {
  version: number
  data: Record<string, unknown> | null
}

interface Change {
  entity: string
  entityId: string
  version: number
  data: Record<string, unknown> | null
}

interface Queued {
  id: string
  entity: string
  operation: string
  entityId: string
  fields?: Record<string, unknown>
}

export class SyncClient {
  readonly local = new Map<string, Entity>()
  private queue: Queued[] = []
  private cursor: string | null = null

  constructor(
    private readonly accounts: Accounts,
    private readonly token: string
  ) {}

  private key = (entity: string, entityId: string) => `${entity}:${entityId}`

  versionOf(entity: string, entityId: string) {
    return this.local.get(this.key(entity, entityId))?.version ?? 0
  }

  dataOf(entity: string, entityId: string) {
    return this.local.get(this.key(entity, entityId))?.data ?? null
  }

  change(entity: string, operation: string, entityId: string, fields?: Record<string, unknown>) {
    this.queue.push({ id: randomUUID(), entity, operation, entityId, fields })
  }

  private apply(change: Change) {
    if (change.entity === 'profile') return
    this.local.set(this.key(change.entity, change.entityId), {
      version: change.version,
      data: change.data
    })
  }

  async sync() {
    for (;;) {
      const mutations = this.queue.map(({ id, entity, operation, entityId, fields }) => ({
        id,
        entity,
        operation,
        entityId,
        baseVersion: this.versionOf(entity, entityId),
        ...(fields ? { fields } : {})
      }))
      const answer = await this.accounts.sync(this.token, { cursor: this.cursor, mutations })
      expect(answer.status, JSON.stringify(answer.body)).toBe(200)
      const body = answer.body as unknown as {
        results: { status: string; current?: Change }[]
        changes: Change[]
        cursor: string
        hasMore: boolean
      }
      this.queue = []
      for (const result of body.results) {
        expect(result.status).not.toBe('rejected')
        if (result.current) this.apply(result.current)
      }
      for (const change of body.changes) this.apply(change)
      this.cursor = body.cursor
      if (!body.hasMore) return
    }
  }

  state() {
    return new Map([...this.local].filter(([, entity]) => entity.data !== null))
  }
}
