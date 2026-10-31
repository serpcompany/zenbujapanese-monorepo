import { fields } from '../../shared/messages'
import { type Answered, type Api, type Call, networkFailure } from './api'
import type { AccountStore } from './store'

const refreshBeforeMs = 60_000

const accessTokenLifeMs = 15 * 60_000

const signedOut: Answered = { ok: false, status: 401, code: 'signed_out', retryAfter: null }

function expiryOf(token: string): number | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null
  try {
    const json = atob(payload.replaceAll('-', '+').replaceAll('_', '/'))
    const exp = fields(JSON.parse(json))?.exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

const endsSession = (answer: Answered) => !answer.ok && answer.status === 401

export function accessTokens(api: Api, store: AccountStore, now: () => number = Date.now) {
  async function newAccessToken(sessionToken: string): Promise<Answered | string> {
    const answer = await api({ method: 'GET', path: '/v1/auth/token', bearer: sessionToken })
    if (endsSession(answer)) {
      await store.forgetSession(sessionToken)
      return signedOut
    }
    if (!answer.ok) return answer
    const token = typeof answer.value.token === 'string' ? answer.value.token : null
    if (token === null) return networkFailure
    const expiresAt = expiryOf(token) ?? now() + accessTokenLifeMs
    return (await store.keepAccessToken(sessionToken, { token, expiresAt })) ? token : signedOut
  }

  async function keptAccessToken(sessionToken: string): Promise<string | null> {
    const kept = await store.accessToken(sessionToken)
    if (!kept || kept.expiresAt - refreshBeforeMs <= now()) return null
    return (await store.isCurrent(sessionToken)) ? kept.token : null
  }

  async function withAccess(sessionToken: string, call: Omit<Call, 'bearer'>): Promise<Answered> {
    const first = (await keptAccessToken(sessionToken)) ?? (await newAccessToken(sessionToken))
    if (typeof first !== 'string') return first
    const answer = await api({ ...call, bearer: first })
    if (answer.ok || answer.status !== 401) return answer
    await store.forgetAccessToken(sessionToken)
    const second = await newAccessToken(sessionToken)
    return typeof second === 'string' ? api({ ...call, bearer: second }) : second
  }

  async function checkSession(sessionToken: string): Promise<void> {
    if ((await keptAccessToken(sessionToken)) === null) await newAccessToken(sessionToken)
  }

  return { withAccess, newAccessToken, checkSession }
}

export type AccessTokens = ReturnType<typeof accessTokens>
