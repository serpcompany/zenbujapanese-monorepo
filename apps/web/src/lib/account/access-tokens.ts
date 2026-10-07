import type { AccountApi, Result } from './client'

const renewBeforeMs = 60_000
const assumedLifetimeMs = 10 * 60_000

function expiryOf(token: string, now: number): number {
  try {
    const payload = token.split('.')[1] ?? ''
    const json = atob(payload.replaceAll('-', '+').replaceAll('_', '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : now + assumedLifetimeMs
  } catch {
    return now + assumedLifetimeMs
  }
}

const isUnauthorized = (result: Result<unknown>) =>
  !result.ok && result.failure.kind === 'refused' && result.failure.status === 401

export function accessTokens(api: Pick<AccountApi, 'accessToken'>, now = () => Date.now()) {
  let current: { token: string; renewAt: number } | null = null

  async function issue(): Promise<Result<string>> {
    current = null
    const issued = await api.accessToken()
    if (issued.ok) {
      current = { token: issued.value, renewAt: expiryOf(issued.value, now()) - renewBeforeMs }
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
    }
  }
}

export type AccessTokens = ReturnType<typeof accessTokens>
