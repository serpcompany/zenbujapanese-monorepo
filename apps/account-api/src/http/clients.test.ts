import { randomUUID } from 'node:crypto'
import { decodeJwt } from 'jose'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useAccountService } from '../test/accounts'
import { oneOfEachKept } from '../test/kept'
import { aJpeg } from '../test/photos'
import { fromTheWebsite, sessionToken, sha256, websiteSession } from '../test/sign-in'

const accounts = useAccountService()

afterEach(() => vi.useRealTimers())

const word = (n: number) => n.toString(16).padStart(32, '0')
const text = { headword: '見る', reading: 'みる' }

const send = (token: string, ...mutations: Record<string, unknown>[]) =>
  accounts.mutate(token, ...mutations)

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
        entity: 'knownWord',
        operation: 'set',
        entityId: word(2),
        baseVersion: 1,
        fields: { state: 'learning', ...text }
      },
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

  test('the iOS app and the extension change watch history, only the iOS app Translate bookmarks: the website reads them, and Tomodachi never sees them', async () => {
    const email = 'app-only-scopes@example.com'
    const zenbu = await accounts.learner(email)
    const bookmark = randomUUID()
    const appOnly = [
      {
        entity: 'watchedVideo',
        operation: 'watch',
        entityId: 'dQw4w9WgXcQ',
        baseVersion: 0,
        fields: { watchedAt: '2026-10-01T12:00:00Z' }
      },
      {
        entity: 'bookmarkedSentence',
        operation: 'add',
        entityId: bookmark,
        fields: {
          text: 'はい。',
          translation: 'Yes.',
          language: 'ja',
          bookmarkedAt: '2026-10-01T12:00:00Z'
        }
      }
    ]
    expect((await send(zenbu.token, ...appOnly)).results).toMatchObject([
      { status: 'applied' },
      { status: 'applied' }
    ])
    expect(decodeJwt(zenbu.token).scope).toContain(
      'watch:read watch:write translations:read translations:write'
    )
    for (const client of ['tomodachi', 'zenbu-web', 'zenbu-extension']) {
      const other = await accounts.learner(email, client)
      expect(other.userId).toBe(zenbu.userId)
      const scope = String(decodeJwt(other.token).scope)
      const watches = client === 'zenbu-extension'
      expect(scope, client).not.toMatch(/translations:write/)
      expect(/watch:write/.test(scope), client).toBe(watches)
      expect(/watch:read/.test(scope), client).toBe(client !== 'tomodachi')
      expect(/translations:read/.test(scope), client).toBe(client === 'zenbu-web')
      const answer = await send(
        other.token,
        ...appOnly,
        { entity: 'watchedVideo', operation: 'remove', entityId: 'dQw4w9WgXcQ' },
        { entity: 'bookmarkedSentence', operation: 'remove', entityId: bookmark, baseVersion: 1 }
      )
      const watch = watches ? 'applied' : 'not_allowed'
      expect(
        answer.results.map(result => result.error?.code ?? result.status),
        client
      ).toEqual([watch, 'not_allowed', watch, 'not_allowed'])
      const entities = answer.changes.map(change => change.entity)
      expect(entities.includes('watchedVideo'), client).toBe(client !== 'tomodachi')
      expect(entities.includes('bookmarkedSentence'), client).toBe(client === 'zenbu-web')
    }
  })

  test('the website reads notes, photos, settings, and recent searches, and changes all but photos; Tomodachi gets none of them, nor the profile photo', async () => {
    const email = 'kept-scopes@example.com'
    const zenbu = await accounts.learner(email)
    const { photoId, appOnly: kept, profilePhoto } = await oneOfEachKept(accounts, zenbu)
    expect((await send(zenbu.token, ...kept, profilePhoto)).results).toMatchObject(
      [...kept, profilePhoto].map(() => ({ status: 'applied' }))
    )
    expect(decodeJwt(zenbu.token).scope).toContain(
      'notes:read notes:write photos:read photos:write settings:read settings:write searches:read searches:write'
    )
    const keptEntities = ['wordNote', 'photo', 'photoWord', 'setting', 'recentSearch']
    const [note, photo, photoWord, setting, search] = kept
    const photoChanges = [
      { ...photo, operation: 'add' },
      { ...photoWord, operation: 'remove', baseVersion: 1, fields: undefined }
    ]
    const tomodachi = await accounts.learner(email, 'tomodachi')
    expect(String(decodeJwt(tomodachi.token).scope)).not.toMatch(
      /notes:|photos:|settings:|searches:/
    )
    const refused = await send(tomodachi.token, ...kept)
    expect(refused.results.map(result => result.error?.code)).toEqual(kept.map(() => 'not_allowed'))
    const unseen = refused.changes.map(change => change.entity)
    for (const entity of [...keptEntities, 'profilePhoto']) expect(unseen).not.toContain(entity)

    const web = await accounts.learner(email, 'zenbu-web')
    expect(decodeJwt(web.token).scope).toContain(
      'notes:read notes:write photos:read settings:read settings:write searches:read searches:write'
    )
    expect(String(decodeJwt(web.token).scope)).not.toContain('photos:write')
    const answer = await send(
      web.token,
      {
        ...note,
        fields: { item: '0'.repeat(32), text: 'Changed on the website.' },
        baseVersion: 1
      },
      { ...setting, fields: { value: false }, baseVersion: 1 },
      { ...search, operation: 'remove', fields: undefined },
      ...photoChanges
    )
    expect(answer.results.map(result => result.error?.code ?? result.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'not_allowed',
      'not_allowed'
    ])
    const seen = answer.changes.map(change => change.entity)
    for (const entity of [...keptEntities, 'profilePhoto']) expect(seen).toContain(entity)
    for (const [client, token, uploads, downloads] of [
      ['tomodachi', tomodachi.token, 403, 403],
      ['zenbu-web', web.token, 400, 200]
    ] as const) {
      const upload = await accounts.running.service.sendPhoto(token, photoId, aJpeg())
      expect(upload.status, client).toBe(uploads)
      const download = await accounts.running.service.sendPhoto(
        token,
        photoId,
        new Uint8Array(),
        'GET'
      )
      expect(download.status, client).toBe(downloads)
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
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let sent = 0; sent < 5; sent++) expect((await send()).status).toBe(200)
    const refused = await send()
    expect(refused).toMatchObject({ status: 429, body: { error: { code: 'too_many_requests' } } })
    expect(refused.headers.get('retry-after')).toBe('600')
    expect(refused.headers.get('x-retry-after')).toBe('600')
  })
})
