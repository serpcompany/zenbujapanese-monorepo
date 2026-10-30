import { fields } from '../../shared/messages'
import { type Answered, type Api, type Call, networkFailure } from './api'
import type { AccountStore } from './store'

const refreshBeforeMs = 60_000

const accessTokenLifeMs = 15 * 60_000

export const signedOut: Answered = { ok: false, status: 401, code: 'signed_out', retryAfter: null }

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

const endsSession = (answer: Answered) =>
  !answer.ok && (answer.status === 401 || answer.code === 'sign_in_again')

export function accessTokens(api: Api, store: AccountStore, now: () => number = Date.now) {
  async function newAccessToken(): Promise<Answered | string> {
    const sessionToken = await store.sessionToken()
    if (sessionToken === null) return signedOut
    const answer = await api({ method: 'GET', path: '/v1/auth/token', bearer: sessionToken })
    if (endsSession(answer)) {
      await store.forget()
      return signedOut
    }
    if (!answer.ok) return answer
    const token = typeof answer.value.token === 'string' ? answer.value.token : null
    if (token === null) return networkFailure
    await store.keepAccessToken({
      token,
      expiresAt: expiryOf(token) ?? now() + accessTokenLifeMs
    })
    return token
  }

  async function accessToken(): Promise<Answered | string> {
    const kept = await store.accessToken()
    if (kept && kept.expiresAt - refreshBeforeMs > now()) return kept.token
    return newAccessToken()
  }

  async function withAccess(call: Omit<Call, 'bearer'>): Promise<Answered> {
    const first = await accessToken()
    if (typeof first !== 'string') return first
    const answer = await api({ ...call, bearer: first })
    if (answer.ok || answer.status !== 401) return answer
    await store.forgetAccessToken()
    const second = await newAccessToken()
    return typeof second === 'string' ? api({ ...call, bearer: second }) : second
  }

  return { withAccess, newAccessToken }
}

export type AccessTokens = ReturnType<typeof accessTokens>
