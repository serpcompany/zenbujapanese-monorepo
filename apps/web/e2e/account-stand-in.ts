import type { Page, Route } from '@playwright/test'

type Answers = Record<string, unknown>

export async function standInForTheAccountService(page: Page, answers: Answers) {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request()
    const origin = (await request.headerValue('origin')) ?? '*'
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type, x-zenbu-client',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE'
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const key = `${request.method()} ${new URL(request.url()).pathname}`
    if (!(key in answers)) return route.abort()
    return route.fulfill({ status: 200, headers: cors, json: answers[key] })
  })
}

export const signedOutService: Answers = { 'GET /v1/auth/get-session': null }

export const email = 'kana@example.com'

const profile = {
  id: 'u1',
  name: 'Kana Fan',
  username: null,
  email,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
}

const accessTokenFor = (sub: string) =>
  `head.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`

export const signedInService: Answers = {
  'GET /v1/auth/get-session': {
    user: { id: profile.id, email },
    session: { token: 'bare', createdAt: new Date().toISOString() }
  },
  'GET /v1/auth/token': { token: accessTokenFor(profile.id) },
  'GET /v1/me': profile,
  'GET /v1/auth/list-accounts': [{ id: 'i1', providerId: 'email', accountId: email }]
}

export async function seemSignedIn(page: Page, initials: string) {
  await page.addInitScript(shown => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    window.localStorage.setItem('zenbu-initials', shown)
  }, initials)
}
