import type { Page, Route } from '@playwright/test'

export type Answers = Record<string, unknown>

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

export async function seemSignedIn(page: Page, initials: string) {
  await page.addInitScript(shown => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    window.localStorage.setItem('zenbu-initials', shown)
  }, initials)
}
