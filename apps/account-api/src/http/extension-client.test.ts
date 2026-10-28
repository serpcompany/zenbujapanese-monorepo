import { decodeJwt } from 'jose'
import { describe, expect, test } from 'vitest'
import { useAccountService } from '../test/accounts'
import { appleCodeFor } from '../test/identity-provider'
import { publicUrl, websiteOrigin, websiteServicesId } from '../test/service'
import { sessionToken, sha256, websiteCookie } from '../test/sign-in'

const accounts = useAccountService({ appleKey: true })

const extensionId = 'kaalpflpefadijdemimciikalgpgjmok'
const unlistedId = 'abcdefghijklmnopabcdefghijklmnop'
const returnRoute = '/v1/auth/apple/extension'

const fromExtension = (id: string, session?: string) => ({
  client: 'zenbu-extension',
  token: session,
  headers: { origin: `chrome-extension://${id}`, 'sec-fetch-site': 'none' }
})

const extensionScopes = [
  'account:delete',
  'known:read',
  'known:write',
  'lists:read',
  'lists:write',
  'notes:read',
  'notes:write',
  'watch:read',
  'watch:write',
  'settings:read',
  'settings:write',
  'subscription'
]

const cookieOf = (session: string) => `${websiteCookie}=${encodeURIComponent(session)}`

const allowedOrigin = (answer: { headers: Headers }) =>
  answer.headers.get('access-control-allow-origin')

async function codeFor(email: string, id = extensionId) {
  const { service } = accounts.running
  const before = service.mailbox.messages().length
  const sent = await service.call('/v1/auth/email-otp/send-verification-otp', {
    ...fromExtension(id),
    body: { email, type: 'sign-in' }
  })
  if (sent.status !== 200) return { sent, code: '' }
  const text = (await accounts.running.as.lastMessageTo(email, before)).text
  return { sent, code: /\d{6}/.exec(text)?.[0] ?? '' }
}

const postedByApple = (fields: Record<string, string>, origin = 'https://appleid.apple.com') =>
  accounts.running.service.call(returnRoute, {
    client: null,
    body: new URLSearchParams(fields).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin }
  })

describe('the browser extension, zenbu-extension', () => {
  test('sends a code, signs in to a bearer session, and signs out, from its own origin', async () => {
    const { service } = accounts.running
    const email = 'extension@example.com'
    const { sent, code } = await codeFor(email)
    expect(sent).toMatchObject({ status: 200, body: { success: true } })
    expect(allowedOrigin(sent)).toBeNull()

    const signedIn = await service.call('/v1/auth/sign-in/email-otp', {
      ...fromExtension(extensionId),
      body: { email, otp: code }
    })
    expect(signedIn.status).toBe(200)
    expect(allowedOrigin(signedIn)).toBeNull()
    const session = sessionToken(signedIn)
    expect(session).not.toBe('')
    expect(signedIn.headers.getSetCookie()).toEqual([])
    expect(signedIn.headers.get('set-cookie')).toBeNull()

    const issued = await service.call('/v1/auth/token', fromExtension(extensionId, session))
    expect(issued.status).toBe(200)
    const claims = decodeJwt(String(issued.body?.token))
    expect(claims.azp).toBe('zenbu-extension')
    expect(String(claims.scope).split(' ').sort()).toEqual([...extensionScopes].sort())

    const signedOut = await service.call('/v1/auth/sign-out', {
      ...fromExtension(extensionId, session),
      body: {}
    })
    expect(signedOut).toMatchObject({ status: 200, body: { success: true } })
    expect(allowedOrigin(signedOut)).toBeNull()
    expect((await service.call('/v1/auth/token', { token: session })).status).toBe(401)
  })

  test("refuses an extension it doesn't list, as any origin it doesn't trust", async () => {
    const { service } = accounts.running
    const { sent } = await codeFor('unlisted-extension@example.com', unlistedId)
    expect(sent).toMatchObject({ status: 403, body: { error: { code: 'invalid_origin' } } })
    expect(allowedOrigin(sent)).toBeNull()

    const learner = await accounts.learner('unlisted-sign-out@example.com', 'zenbu-extension')
    const signOut = (id: string) =>
      service.call('/v1/auth/sign-out', {
        ...fromExtension(id, learner.session),
        headers: { ...fromExtension(id).headers, cookie: cookieOf(learner.session) },
        body: {}
      })
    const refused = await signOut(unlistedId)
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'invalid_origin' } } })
    expect(allowedOrigin(refused)).toBeNull()
    expect((await service.call('/v1/auth/token', { token: learner.session })).status).toBe(200)
    expect(await signOut(extensionId)).toMatchObject({ status: 200, body: { success: true } })
    expect((await service.call('/v1/auth/token', { token: learner.session })).status).toBe(401)
  })

  test('keeps its session out of the browser: an answer to an extension sets no cookie', async () => {
    const { service } = accounts.running
    const email = 'extension-cookie@example.com'
    for (const id of [extensionId, unlistedId]) {
      const signedIn = await service.call('/v1/auth/sign-in/email-otp', {
        ...fromExtension(id),
        body: { email, otp: await accounts.running.as.emailCode(email) }
      })
      expect(signedIn.status, id).toBe(200)
      expect(signedIn.headers.get('set-cookie'), id).toBeNull()
    }
    const asTheApp = await accounts.running.as.withCode(email)
    expect(asTheApp.headers.get('set-cookie')).not.toBeNull()
  })

  test("never takes a listed extension's sign-in as the website's: it must name its app", async () => {
    const { service } = accounts.running
    const email = 'extension-unnamed@example.com'
    const { code } = await codeFor(email)
    const unnamed = await service.call('/v1/auth/sign-in/email-otp', {
      ...fromExtension(extensionId),
      client: null,
      body: { email, otp: code }
    })
    expect(unnamed).toMatchObject({ status: 400, body: { error: { code: 'unknown_client' } } })
    expect(sessionToken(unnamed)).toBe('')
  })
})

describe(`POST ${returnRoute}`, () => {
  const apple = { id_token: 'header.payload.signature', code: 'apple-code', state: extensionId }

  test("sends Apple's form on to the extension it names, in the fragment, and keeps nothing", async () => {
    const user = JSON.stringify({ name: { firstName: 'Ken', lastName: 'Sato' }, email: 'k@x.jp' })
    const answer = await postedByApple({ ...apple, user })
    expect(answer.status).toBe(303)
    expect(answer.headers.getSetCookie()).toEqual([])
    expect(answer.headers.get('cache-control')).toBe('no-store')
    const sentOn = new URL(String(answer.headers.get('location')))
    expect(`${sentOn.origin}${sentOn.pathname}`).toBe(
      `https://${extensionId}.chromiumapp.org/apple`
    )
    expect(Object.fromEntries(new URLSearchParams(sentOn.hash.slice(1)))).toEqual({
      ...apple,
      user
    })
  })

  test("takes a state with the extension's own value after its ID, and Apple's error", async () => {
    const state = `${extensionId}.Zk3-f_9q`
    const answer = await postedByApple({ state, error: 'user_cancelled_authorize' })
    expect(answer.status).toBe(303)
    const sentOn = new URL(String(answer.headers.get('location')))
    expect(sentOn.host).toBe(`${extensionId}.chromiumapp.org`)
    expect(Object.fromEntries(new URLSearchParams(sentOn.hash.slice(1)))).toEqual({
      state,
      error: 'user_cancelled_authorize'
    })
  })

  test("answers 400 and sends nothing on for an extension it doesn't list, or a form that isn't Apple's", async () => {
    for (const state of [unlistedId, `${unlistedId}.${extensionId}`, `x${extensionId}`, '']) {
      const answer = await postedByApple({ ...apple, state })
      expect(answer.status, state).toBe(400)
      expect(answer.headers.get('location'), state).toBeNull()
    }
    expect(await postedByApple({ ...apple, state: unlistedId })).toMatchObject({
      body: { error: { code: 'unknown_extension' } }
    })
    const { state: _, ...stateless } = apple
    expect(await postedByApple(stateless)).toMatchObject({
      status: 400,
      body: { error: { code: 'bad_request' } }
    })
    const asJson = await accounts.running.service.call(returnRoute, { client: null, body: apple })
    expect(asJson).toMatchObject({ status: 415, body: { error: { code: 'bad_request' } } })
    expect(asJson.headers.get('location')).toBeNull()
  })

  test('sends nothing on for a field over its bound, or a form over 64 KB', async () => {
    const long = await postedByApple({ ...apple, id_token: 'x'.repeat(16_385) })
    expect(long).toMatchObject({ status: 400, body: { error: { code: 'bad_request' } } })
    expect(long.headers.get('location')).toBeNull()
    const large = await postedByApple({ ...apple, padding: 'x'.repeat(70 * 1024) })
    expect(large).toMatchObject({ status: 413, body: { error: { code: 'too_large' } } })
    expect(large.headers.get('location')).toBeNull()
  })

  test("runs no origin check: Apple's post from its own origin, or a page's, is sent on alike", async () => {
    for (const origin of ['https://appleid.apple.com', 'https://evil.example', websiteOrigin]) {
      const answer = await postedByApple(apple, origin)
      expect(answer.status, origin).toBe(303)
      expect(answer.headers.get('location'), origin).toMatch(
        new RegExp(`^https://${extensionId}\\.chromiumapp\\.org/apple#`)
      )
    }
  })
})

describe('deleting an Apple account from the extension', () => {
  test("revokes with the website's Services ID and the return route as redirect_uri", async () => {
    const { service, as } = accounts.running
    const appleUserId = 'apple-extension-deleting'
    const nonce = await service.call('/v1/auth/sign-in/nonce', {
      ...fromExtension(extensionId),
      body: {}
    })
    expect(nonce.status).toBe(200)
    const presented = String(nonce.body?.nonce)
    const token = await as.idToken(
      accounts.running.apple,
      websiteServicesId,
      appleUserId,
      `${appleUserId}@example.com`,
      sha256(presented)
    )
    const signedIn = await service.call('/v1/auth/sign-in/social', {
      ...fromExtension(extensionId),
      body: { provider: 'apple', idToken: { token, nonce: presented } }
    })
    expect(signedIn.status).toBe(200)
    const issued = await service.call(
      '/v1/auth/token',
      fromExtension(extensionId, sessionToken(signedIn))
    )
    const accessToken = String(issued.body?.token)
    expect(decodeJwt(accessToken)).toMatchObject({ azp: 'zenbu-extension' })

    const remove = (body: Record<string, unknown>) =>
      service.call('/v1/me', { ...fromExtension(extensionId, accessToken), method: 'DELETE', body })
    expect(await remove({ confirm: true })).toMatchObject({
      status: 400,
      body: { error: { code: 'apple_authorization_needed' } }
    })
    const exchanged = accounts.running.appleExchanges.length
    expect(
      await remove({
        confirm: true,
        appleAuthorizationCode: appleCodeFor(appleUserId),
        appleRedirectUri: `${websiteOrigin}/account/`
      })
    ).toMatchObject({ status: 200, body: { status: 'deleted' } })
    expect(accounts.running.appleExchanges.slice(exchanged)).toEqual([
      { clientId: websiteServicesId, redirectUri: `${publicUrl}${returnRoute}` }
    ])
    expect(accounts.running.appleRevoked).toContain(`refresh-for-${appleCodeFor(appleUserId)}`)
  })
})
