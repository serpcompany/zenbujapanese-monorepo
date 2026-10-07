import { jwtClaims } from './answers'
import type { AccountApi, Result } from './client'

const renewBeforeMs = 60_000
const assumedLifetimeMs = 10 * 60_000

const expiryOf = (exp: unknown, now: number) =>
  typeof exp === 'number' ? exp * 1000 : now + assumedLifetimeMs

const isUnauthorized = (result: Result<unknown>) =>
  !result.ok && result.failure.kind === 'refused' && result.failure.status === 401

const anotherAccount: Result<never> = {
  ok: false,
  failure: {
    kind: 'refused',
    status: 401,
    code: 'another_account',
    message: '',
    retryAfter: null,
    current: null
  }
}

export function accessTokens(api: Pick<AccountApi, 'accessToken'>, now = () => Date.now()) {
  let current: { token: string; renewAt: number } | null = null
  let issuing = 0
  let account: string | null = null

  async function issue(): Promise<Result<string>> {
    const issue = ++issuing
    current = null
    const issued = await api.accessToken()
    if (!issued.ok) return issued
    const claims = jwtClaims(issued.value)
    if (account !== null && claims?.sub !== account) return anotherAccount
    if (issue === issuing) {
      current = { token: issued.value, renewAt: expiryOf(claims?.exp, now()) - renewBeforeMs }
    }
    return issued
  }

  return {
    async use<T>(call: (token: string) => Promise<Result<T>>): Promise<Result<T>> {
      const held = current && current.renewAt > now() ? current.token : null
      const token: Result<string> = held ? { ok: true, value: held } : await issue()
      if (!token.ok) return token
      const answer = await call(token.value)
      if (!isUnauthorized(answer)) return answer
      const renewed = await issue()
      return renewed.ok ? call(renewed.value) : renewed
    },
    forget() {
      current = null
      issuing += 1
    },
    belongTo(userId: string) {
      account = userId
    }
  }
}

export type AccessTokens = ReturnType<typeof accessTokens>
