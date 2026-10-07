import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { cursorKey, cursors } from '../domain/cursor'
import { testSecret } from './service'
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
}

export function useAccountService(options: { appleKey?: boolean } = {}) {
  const running = useSignInService({ providers: true, ...options })
  const call = (path: string, options: Parameters<typeof running.service.call>[1]) =>
    running.service.call(path, options)
  const sync = (token: string, body: Record<string, unknown> = {}) =>
    call('/v1/sync', { token, body })

  return {
    running,
    cursors: cursors(cursorKey(testSecret)),
    async learner(email: string, client = 'zenbu-ios'): Promise<Learner> {
      const signedIn = await running.as.withCode(email, { client })
      const session = sessionToken(signedIn)
      const issued = await call('/v1/auth/token', { token: session })
      return { userId: userIdOf(signedIn), session, token: String(issued.body?.token) }
    },
    me: (token: string) => call('/v1/me', { token }),
    changeMe: (token: string, body: Record<string, unknown>) =>
      call('/v1/me', { token, body, method: 'PATCH' }),
    sync,
    async mutate(token: string, ...mutations: Record<string, unknown>[]): Promise<SyncedAnswer> {
      const answer = await sync(token, {
        mutations: mutations.map(mutation => ({ id: randomUUID(), ...mutation }))
      })
      expect(answer.status, JSON.stringify(answer.body)).toBe(200)
      return answer.body as unknown as SyncedAnswer
    }
  }
}
