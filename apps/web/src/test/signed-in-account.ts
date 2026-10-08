import { vi } from 'vitest'
import type { AccountSettings } from '@/lib/account/settings'
import { idTokenFor, jwtFor } from './account-answers'
import {
  answer,
  apiUrl,
  fill,
  type ServiceCall,
  shows,
  stubAccountService,
  submit
} from './account-page'

export const email = 'kana@example.com'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const profile = {
  id: 'u1',
  name: 'Kana Fan',
  username: 'kana_fan',
  email,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
}
export const oldAccess = jwtFor({ sub: 'u1' }, 'old')
export const newAccess = jwtFor({ sub: 'u1' }, 'new')
export const emailWay = { id: 'i1', providerId: 'email', accountId: email }
export const appleWay = { id: 'i2', providerId: 'apple', accountId: '001.apple' }
export const googleWay = { id: 'i3', providerId: 'google', accountId: '109' }

export const settings = (apple = false, google = false): AccountSettings => ({
  apiUrl,
  appleServicesId: apple ? 'com.zenbujapanese.web' : null,
  google
})

export const sessionAnswer = (userId: string, token: string, minutes: number, of = email) =>
  answer({ user: { id: userId, email: of }, session: { token, createdAt: minutesAgo(minutes) } })

export function signedIn({
  signedInMinutesAgo = 1,
  ways = [emailWay],
  later = { userId: 'u1', minutesAgo: 0 },
  more = {}
}: {
  signedInMinutesAgo?: number
  ways?: object[]
  later?: { userId: string; minutesAgo: number; email?: string }
  more?: Parameters<typeof stubAccountService>[0]
} = {}) {
  return stubAccountService({
    'GET /v1/auth/get-session': [
      sessionAnswer('u1', 'old-bare', signedInMinutesAgo),
      sessionAnswer(later.userId, 'new-bare', later.minutesAgo, later.email)
    ],
    'GET /v1/auth/token': [answer({ token: oldAccess }), answer({ token: newAccess })],
    'GET /v1/me': answer(profile),
    'GET /v1/auth/list-accounts': answer(ways),
    'POST /v1/auth/email-otp/send-verification-otp': answer({ success: true }),
    'POST /v1/auth/sign-in/email-otp': answer({ token: 'new-bare', user: { id: 'u1' } }),
    'POST /v1/auth/sign-in/nonce': answer({ nonce: 'n1', expiresIn: 600 }),
    'POST /v1/auth/revoke-session': answer({ status: true }),
    'POST /v1/auth/sign-out': answer({ success: true }),
    'DELETE /v1/me': answer({ status: 'deleted' }),
    ...more
  })
}

export const someoneElse = { ...profile, id: 'u9', name: 'Someone', email: 'someone@example.com' }

export const thenSomeoneElse = {
  'GET /v1/auth/token': [
    answer({ token: jwtFor({ sub: 'u1' }) }),
    answer({ token: jwtFor({ sub: 'u9' }) })
  ],
  'GET /v1/me': (call: ServiceCall) =>
    answer(call.authorization === `Bearer ${jwtFor({ sub: 'u9' })}` ? someoneElse : profile)
}

export const callTo = (calls: ServiceCall[], route: string) =>
  calls.filter(call => call.route === route)

export async function confirmWithEmailCode(container: HTMLElement) {
  await shows(container, `We’ll email a code to ${email}`)
  await submit(container, 'Email me a code')
  await shows(container, 'We sent a 6-digit code')
  await fill(container, 'Code', '123456')
  await submit(container, 'Confirm')
}

export function appleAnswering(firstSub: string) {
  const init = vi.fn()
  const apple = { sub: firstSub, init }
  vi.stubGlobal('AppleID', {
    auth: {
      init,
      signIn: async () => ({
        authorization: {
          code: `apple-code-for-${apple.sub}`,
          id_token: idTokenFor(apple.sub),
          state: init.mock.lastCall?.[0]?.state
        }
      })
    }
  })
  return apple
}
