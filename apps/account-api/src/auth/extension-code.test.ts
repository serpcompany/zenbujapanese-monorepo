import { decodeJwt } from 'jose'
import { describe, expect, test } from 'vitest'
import { clientById } from '../domain/clients'
import type { Service } from '../test/service'
import {
  fromTheWebsite,
  sessionToken,
  setCookie,
  sha256,
  useSignInService,
  websiteCookie,
  websiteSession
} from '../test/sign-in'

const running = useSignInService()

const fromExtension = (session?: string) => ({
  client: 'zenbu-extension',
  token: session,
  headers: { origin: 'chrome-extension://kaalpflpefadijdemimciikalgpgjmok' }
})

async function onTheWebsite(email: string) {
  const { as } = running
  return websiteSession(await as.withCode(email, fromTheWebsite()))
}

async function codeFor(session: string, from?: string) {
  const answer = await running.service.call('/v1/auth/extension-code', {
    ...fromTheWebsite(session),
    body: {},
    from
  })
  expect(answer.status).toBe(200)
  return String(answer.body?.code)
}

type Call = Parameters<Service['call']>[1]

const redeem = (code: string, as: Call = fromExtension()) =>
  running.service.call('/v1/auth/sign-in/extension-code', { ...as, body: { code } })

describe("the website's code for the extension", () => {
  test('signs the extension in once, to its own session, as signed in when the website was', async () => {
    const { service } = running
    const website = await onTheWebsite('handoff@example.com')
    const issued = await service.call('/v1/auth/extension-code', {
      ...fromTheWebsite(website),
      body: {}
    })
    expect(issued).toMatchObject({ status: 200, body: { expiresIn: 300 } })
    expect(issued.headers.get('set-auth-token')).toBeNull()
    expect(setCookie(issued.headers, websiteCookie)).toBeNull()
    const code = String(issued.body?.code)
    expect(code).toMatch(/^[\w-]{43}$/)
    const stored = await service.rows(
      "select identifier, value from verifications where identifier like 'extension-code:%'"
    )
    expect(stored).toEqual([
      { identifier: `extension-code:${sha256(code)}`, value: expect.any(String) }
    ])
    expect(JSON.stringify(stored)).not.toContain(code)

    const signedIn = await redeem(code)
    expect(signedIn).toMatchObject({
      status: 200,
      body: { user: { email: 'handoff@example.com' } }
    })
    expect(signedIn.headers.getSetCookie()).toEqual([])
    const session = sessionToken(signedIn)
    expect(session).toMatch(/\./)
    const issuedToken = await service.call('/v1/auth/token', fromExtension(session))
    const claims = decodeJwt(String(issuedToken.body?.token))
    const websiteSignedIn = await service.call('/v1/auth/get-session', fromTheWebsite(website))
    const websiteCreated = Date.parse(
      String((websiteSignedIn.body?.session as { createdAt?: string })?.createdAt)
    )
    expect(claims).toMatchObject({
      azp: 'zenbu-extension',
      scope: clientById('zenbu-extension')?.scopes.join(' '),
      auth_time: Math.floor(websiteCreated / 1000)
    })

    expect(await redeem(code)).toMatchObject({
      status: 401,
      body: { error: { code: 'invalid_code' } }
    })
  })

  test('signs in only one of two redeems of one code at once', async () => {
    const code = await codeFor(await onTheWebsite('twice@example.com'))
    const answers = await Promise.all([redeem(code), redeem(code)])
    expect(answers.map(answer => answer.status).sort()).toEqual([200, 401])
    expect(answers.find(answer => answer.status === 401)).toMatchObject({
      body: { error: { code: 'invalid_code' } }
    })
  })

  test('refuses a code once the website session that asked for it has ended', async () => {
    const { service } = running
    const signedOut = await onTheWebsite('ended@example.com')
    const fromSignedOut = await codeFor(signedOut)
    const signOut = await service.call('/v1/auth/sign-out', {
      ...fromTheWebsite(signedOut),
      body: {}
    })
    expect(signOut.status).toBe(200)
    expect(await redeem(fromSignedOut)).toMatchObject({
      status: 401,
      body: { error: { code: 'invalid_code' } }
    })

    const lapsed = await onTheWebsite('lapsed@example.com')
    const fromLapsed = await codeFor(lapsed)
    await service.rows(
      `update sessions set expires_at = now() - interval '1 second' where token = '${decodeURIComponent(lapsed).split('.')[0]}'`
    )
    expect(await redeem(fromLapsed)).toMatchObject({
      status: 401,
      body: { error: { code: 'invalid_code' } }
    })
  })

  test('refuses a code over 5 minutes old, and spends it', async () => {
    const { service } = running
    const code = await codeFor(await onTheWebsite('late@example.com'))
    await service.rows(
      `update verifications set expires_at = now() - interval '1 second' where identifier = 'extension-code:${sha256(code)}'`
    )
    expect(await redeem(code)).toMatchObject({
      status: 401,
      body: { error: { code: 'code_expired' } }
    })
    expect(await redeem(code)).toMatchObject({
      status: 401,
      body: { error: { code: 'invalid_code' } }
    })
  })

  test("refuses another app's use, and spends the code", async () => {
    const website = await onTheWebsite('other-app@example.com')
    const forTheApp = await codeFor(website)
    expect(await redeem(forTheApp, { client: 'zenbu-ios' })).toMatchObject({
      status: 403,
      body: { error: { code: 'client_mismatch' } }
    })
    expect(await redeem(forTheApp)).toMatchObject({ status: 401 })

    const forTheWebsite = await codeFor(website)
    const onThePage = await redeem(forTheWebsite, fromTheWebsite())
    expect(onThePage).toMatchObject({ status: 403, body: { error: { code: 'client_mismatch' } } })
    expect(setCookie(onThePage.headers, websiteCookie)).toBeNull()
  })

  test('refuses an unnamed app before spending the code', async () => {
    const code = await codeFor(await onTheWebsite('unnamed@example.com'))
    expect(await redeem(code, { client: null })).toMatchObject({
      status: 400,
      body: { error: { code: 'unknown_client' } }
    })
    expect((await redeem(code)).status).toBe(200)
  })

  test("comes only from the website's session, on the website", async () => {
    const { service, as } = running
    const codes = () =>
      service.rows(
        "select count(*)::int as n from verifications where identifier like 'extension-code:%'"
      )
    const before = await codes()
    const ask = (options: Call) => service.call('/v1/auth/extension-code', { ...options, body: {} })
    expect(await ask(fromTheWebsite())).toMatchObject({
      status: 401,
      body: { error: { code: 'unauthorized' } }
    })
    const app = sessionToken(await as.withCode('app-only@example.com'))
    expect(await ask({ token: app })).toMatchObject({
      status: 403,
      body: { error: { code: 'website_only' } }
    })
    const website = await onTheWebsite('app-only@example.com')
    const extension = sessionToken(await redeem(await codeFor(website)))
    expect(await ask(fromExtension(extension))).toMatchObject({
      status: 403,
      body: { error: { code: 'website_only' } }
    })
    const elsewhere = await ask({
      client: null,
      headers: { origin: 'https://elsewhere.example', cookie: `${websiteCookie}=${website}` }
    })
    expect(elsewhere).toMatchObject({ status: 403, body: { error: { code: 'invalid_origin' } } })
    const extensionWithCookie = await ask({
      ...fromExtension(),
      headers: { ...fromExtension().headers, cookie: `${websiteCookie}=${website}` }
    })
    expect(extensionWithCookie).toMatchObject({
      status: 403,
      body: { error: { code: 'invalid_origin' } }
    })
    expect(await codes()).toEqual(before)
  })

  test('hands out 20 codes a minute to one address', async () => {
    const website = await onTheWebsite('busy@example.com')
    for (let asked = 0; asked < 20; asked++) await codeFor(website, '10.250.0.9')
    const limited = await running.service.call('/v1/auth/extension-code', {
      ...fromTheWebsite(website),
      body: {},
      from: '10.250.0.9'
    })
    expect(limited).toMatchObject({ status: 429, body: { error: { code: 'too_many_requests' } } })
  })

  test('leaves each signed in when the other signs out', async () => {
    const { service } = running
    const website = await onTheWebsite('apart@example.com')
    const extension = sessionToken(await redeem(await codeFor(website)))
    const signOut = (as: Call) => service.call('/v1/auth/sign-out', { ...as, body: {} })
    expect((await signOut(fromExtension(extension))).status).toBe(200)
    expect(await service.call('/v1/auth/get-session', fromTheWebsite(website))).toMatchObject({
      status: 200,
      body: { user: { email: 'apart@example.com' } }
    })
    const again = sessionToken(await redeem(await codeFor(website)))
    expect((await signOut(fromTheWebsite(website))).status).toBe(200)
    expect((await service.call('/v1/auth/token', fromExtension(again))).status).toBe(200)
  })
})
