import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { cursorKey, cursors } from '../domain/cursor'
import { type BillingStandIns, testSecret } from './service'
import { sessionToken, userIdOf, useSignInService } from './sign-in'

export interface Learner {
  userId: string
  session: string
  token: string
}

interface SyncedChange {
  entity: string
  entityId: string
  operation: string
  version: number
  data: Record<string, unknown> | null
}

interface SyncedResult {
  id: string
  status: string
  version?: number
  current?: SyncedChange
  error?: { code: string }
}

export interface SyncedAnswer {
  results: SyncedResult[]
  changes: SyncedChange[]
  cursor: string
  hasMore: boolean
  searchKey?: string
}

export interface KindAnswer {
  changes: SyncedChange[]
  cursor: string
  hasMore: boolean
}

export function useAccountService(options: { appleKey?: boolean; billing?: BillingStandIns } = {}) {
  const running = useSignInService({ providers: true, ...options })
  const call = (path: string, options: Parameters<typeof running.service.call>[1]) =>
    running.service.call(path, options)
  const sync = (token: string, body: Record<string, unknown> = {}) =>
    call('/v1/sync', { token, body })
  const mutate = async (
    token: string,
    ...mutations: Record<string, unknown>[]
  ): Promise<SyncedAnswer> => {
    const answer = await sync(token, {
      mutations: mutations.map(mutation => ({ id: randomUUID(), ...mutation }))
    })
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    return answer.body as unknown as SyncedAnswer
  }

  const readKind = (token: string, entity: string, query: Record<string, string> = {}) =>
    call(`/v1/sync/${entity}?${new URLSearchParams(query)}`, { token })
  const everyOfKind = async (
    token: string,
    entity: string,
    query: Record<string, string> = {}
  ): Promise<SyncedChange[]> => {
    const read: SyncedChange[] = []
    let cursor: string | undefined
    for (;;) {
      const answer = await readKind(token, entity, { ...query, ...(cursor ? { cursor } : {}) })
      expect(answer.status, JSON.stringify(answer.body)).toBe(200)
      const page = answer.body as unknown as KindAnswer
      read.push(...page.changes)
      cursor = page.cursor
      if (!page.hasMore) return read
    }
  }

  return {
    running,
    cursors: cursors(cursorKey(testSecret)),
    readKind,
    everyOfKind,
    async learner(email: string, client = 'zenbu-ios', language?: string): Promise<Learner> {
      const signedIn = await running.as.withCode(email, { client, language })
      const session = sessionToken(signedIn)
      const issued = await call('/v1/auth/token', { token: session })
      return { userId: userIdOf(signedIn), session, token: String(issued.body?.token) }
    },
    me: (token: string) => call('/v1/me', { token }),
    changeMe: (token: string, body: Record<string, unknown>) =>
      call('/v1/me', { token, body, method: 'PATCH' }),
    sync,
    mutate,
    results: async (learner: Learner, ...mutations: Record<string, unknown>[]) =>
      (await mutate(learner.token, ...mutations)).results,
    changesOf: async (learner: Learner, entity: string) =>
      (await mutate(learner.token)).changes.filter(change => change.entity === entity)
  }
}

export const appliedAt = (...versions: number[]) =>
  versions.map(version => ({ status: 'applied', version }))

export const outcomesOf = (results: SyncedResult[]) =>
  results.map(result => result.error?.code ?? result.status)

export const deleted = (entity: string, entityId: string, version: number) => ({
  entity,
  entityId,
  operation: 'delete',
  version,
  data: null
})
