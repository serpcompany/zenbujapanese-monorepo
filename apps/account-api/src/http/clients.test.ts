import { randomUUID } from 'node:crypto'
import { decodeJwt } from 'jose'
import { describe, expect, test } from 'vitest'
import { useAccountService } from '../test/accounts'
import { fromTheWebsite, sessionToken, sha256, websiteSession } from '../test/sign-in'

const accounts = useAccountService()

const word = (n: number) => n.toString(16).padStart(32, '0')
const text = { headword: '見る', reading: 'みる' }

type Result = { status: string; error?: { code: string } }

async function send(token: string, ...mutations: Record<string, unknown>[]) {
  const answer = await accounts.sync(token, {
    mutations: mutations.map(mutation => ({ id: randomUUID(), ...mutation }))
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return answer.body as unknown as { results: Result[]; changes: { entity: string }[] }
}

describe("each app's access to an account", () => {
  test('a Tomodachi token names the app and only its scopes', async () => {
    const tomodachi = await accounts.learner('tomo-token@example.com', 'tomodachi')
    expect(decodeJwt(tomodachi.token)).toMatchObject({
      azp: 'tomodachi',
      scope: 'account:delete lists:read known:read known:mark dictionary:read'
    })
  })

  test('Tomodachi reads lists and known words, marks a word Known, and does nothing else', async () => {
    const zenbu = await accounts.learner('tomo-scopes@example.com')
    const list = randomUUID()
    await send(
      zenbu.token,
      {
        entity: 'list',
        operation: 'create',
        entityId: list,
        fields: { name: 'Food', position: 0 }
      },
      { entity: 'listWord', operation: 'add', entityId: `${list}/${word(1)}`, fields: text },
      { entity: 'knownWord', operation: 'mark', entityId: word(2), baseVersion: 0, fields: text }
    )
    const tomodachi = await accounts.learner('tomo-scopes@example.com', 'tomodachi')
    expect(tomodachi.userId).toBe(zenbu.userId)

    const read = await send(tomodachi.token)
    expect(new Set(read.changes.map(change => change.entity))).toEqual(
      new Set(['list', 'listWord', 'knownWord'])
    )
    const answer = await send(
      tomodachi.token,
      { entity: 'knownWord', operation: 'mark', entityId: word(3), baseVersion: 0, fields: text },
      { entity: 'knownWord', operation: 'clear', entityId: word(2), baseVersion: 1 },
      {
        entity: 'list',
        operation: 'create',
        entityId: randomUUID(),
        fields: { name: 'X', position: 1 }
      },
      { entity: 'listWord', operation: 'add', entityId: `${list}/${word(4)}`, fields: text },
      { entity: 'profile', operation: 'update', baseVersion: 1, fields: { name: 'Tomo' } }
    )
    expect(answer.results.map(result => result.error?.code ?? result.status)).toEqual([
      'applied',
      'not_allowed',
      'not_allowed',
      'not_allowed',
      'not_allowed'
    ])
    for (const refused of [
      await accounts.me(tomodachi.token),
      await accounts.changeMe(tomodachi.token, { baseVersion: 1, name: 'Tomo' })
    ]) {
      expect(refused).toMatchObject({
        status: 403,
        body: { error: { code: 'insufficient_scope' } }
      })
      expect(refused.headers.get('www-authenticate')).toContain('scope="profile"')
    }
    expect((await accounts.me(zenbu.token)).body).toMatchObject({ name: '' })
  })

  test('only the iOS app reads and changes watch history: the website and Tomodachi never see it', async () => {
    const email = 'watch-scopes@example.com'
    const zenbu = await accounts.learner(email)
    const watched = {
      entity: 'watchedVideo',
      operation: 'watch',
      entityId: 'dQw4w9WgXcQ',
      baseVersion: 0,
      fields: { watchedAt: '2026-10-01T12:00:00Z' }
    }
    expect((await send(zenbu.token, watched)).results).toMatchObject([{ status: 'applied' }])
    expect(decodeJwt(zenbu.token).scope).toContain('watch:read watch:write')
    for (const client of ['tomodachi', 'zenbu-web']) {
      const other = await accounts.learner(email, client)
      expect(other.userId).toBe(zenbu.userId)
      expect(String(decodeJwt(other.token).scope)).not.toContain('watch:')
      const answer = await send(
        other.token,
        { ...watched, baseVersion: 1 },
        {
          entity: 'watchedVideo',
          operation: 'remove',
          entityId: 'dQw4w9WgXcQ'
        }
      )
      expect(
        answer.results.map(result => result.error?.code),
        client
      ).toEqual(['not_allowed', 'not_allowed'])
      expect(
        answer.changes.map(change => change.entity),
        client
      ).not.toContain('watchedVideo')
    }
  })

  test('a sign-in names its app, or comes from the website', async () => {
    const { as } = accounts.running
    for (const client of [null, 'not-an-app']) {
      expect(await as.withCode(`no-app-${client}@example.com`, { client })).toMatchObject({
        status: 400,
        body: { error: { code: 'unknown_client' } }
      })
    }
    const web = await as.withCode('web-app@example.com', fromTheWebsite())
    expect(web.status).toBe(200)
    const issued = await accounts.running.service.call(
      '/v1/auth/token',
      fromTheWebsite(websiteSession(web))
    )
    expect(decodeJwt(String(issued.body?.token))).toMatchObject({ azp: 'zenbu-web' })
  })

  test("an Apple token made for one app can't sign in as another", async () => {
    const { as, service } = accounts.running
    const signIn = async (client: string) => {
      const nonce = await as.nonce()
      const token = await as.idToken(
        accounts.running.apple,
        'com.zenbujapanese.tomodachi',
        'apple-tomo',
        'apple-tomo@example.com',
        sha256(nonce)
      )
      return service.call('/v1/auth/sign-in/social', {
        client,
        body: { provider: 'apple', idToken: { token, nonce } }
      })
    }
    expect(await signIn('zenbu-ios')).toMatchObject({
      status: 403,
      body: { error: { code: 'client_mismatch' } }
    })
    const tomodachi = await signIn('tomodachi')
    expect(tomodachi.status).toBe(200)
    const issued = await service.call('/v1/auth/token', { token: sessionToken(tomodachi) })
    expect(decodeJwt(String(issued.body?.token))).toMatchObject({ azp: 'tomodachi' })
  })

  test("a Tomodachi session can't manage how the account signs in or where, nor read who it is", async () => {
    const { service, as } = accounts.running
    const signedIn = await as.withCode('tomo-manage@example.com', { client: 'tomodachi' })
    const session = sessionToken(signedIn)
    const refused = [
      ['/v1/auth/list-accounts', undefined],
      ['/v1/auth/list-sessions', undefined],
      ['/v1/auth/get-session', undefined],
      ['/v1/auth/unlink-account', { accountId: 'any' }],
      ['/v1/auth/link-social', { provider: 'google', idToken: { token: 'x', nonce: 'y' } }],
      ['/v1/auth/revoke-session', { token: 'any' }],
      ['/v1/auth/revoke-sessions', {}],
      ['/v1/auth/revoke-other-sessions', {}]
    ] as const
    for (const [path, body] of refused) {
      expect(await service.call(path, { token: session, body }), path).toMatchObject({
        status: 403,
        body: { error: { code: 'insufficient_scope' } }
      })
    }
    expect(
      await as.withCode('tomo-manage-2@example.com', { session, client: 'tomodachi' })
    ).toMatchObject({
      status: 403,
      body: { error: { code: 'insufficient_scope' } }
    })
    expect((await service.call('/v1/auth/token', { token: session })).status).toBe(200)
    expect((await service.call('/v1/auth/sign-out', { token: session, body: {} })).status).toBe(200)
  })

  test('a session with no listed app gets no access token, and the app signs in again', async () => {
    const { service, as } = accounts.running
    const session = sessionToken(await as.withCode('no-app-session@example.com'))
    await service.rows(
      `update sessions set client_id = null where token = '${session.split('.')[0]}'`
    )
    expect(await service.call('/v1/auth/token', { token: session })).toMatchObject({
      status: 401,
      body: { error: { code: 'sign_in_again' } }
    })
  })

  test('sends at most five codes to one email in ten minutes, from any address', async () => {
    const { service } = accounts.running
    const send = () =>
      service.call('/v1/auth/email-otp/send-verification-otp', {
        body: { email: 'Flooded@Example.com', type: 'sign-in' }
      })
    for (let sent = 0; sent < 5; sent++) expect((await send()).status).toBe(200)
    expect(await send()).toMatchObject({
      status: 429,
      body: { error: { code: 'too_many_requests' } }
    })
  })
})
