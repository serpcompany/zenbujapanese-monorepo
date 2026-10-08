import { randomUUID } from 'node:crypto'
import { decodeJwt } from 'jose'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import {
  appleCodeFor,
  appleCodeWithoutAppleId,
  misconfiguredAppleCode
} from '../test/identity-provider'
import { logged } from '../test/logged'
import { appBundleIdentifier, publicUrl, websiteOrigin, websiteServicesId } from '../test/service'
import { fromTheWebsite, sessionToken, sha256, websiteSession } from '../test/sign-in'

const accounts = useAccountService({ appleKey: true })

afterEach(() => vi.useRealTimers())

const remove = (learner: Learner, body: Record<string, unknown> = { confirm: true }) =>
  accounts.running.service.call('/v1/me', { token: learner.token, body, method: 'DELETE' })

async function appleLearner(audience: string, appleUserId: string, onTheWebsite: boolean) {
  const { as, service } = accounts.running
  const nonce = await as.nonce()
  const token = await as.idToken(
    accounts.running.apple,
    audience,
    appleUserId,
    `${appleUserId}@example.com`,
    sha256(nonce)
  )
  const signedIn = await service.call('/v1/auth/sign-in/social', {
    ...(onTheWebsite ? fromTheWebsite() : {}),
    body: { provider: 'apple', idToken: { token, nonce } }
  })
  expect(signedIn.status).toBe(200)
  const issued = await service.call(
    '/v1/auth/token',
    onTheWebsite ? fromTheWebsite(websiteSession(signedIn)) : { token: sessionToken(signedIn) }
  )
  return { userId: '', session: '', token: String(issued.body?.token) }
}

const exchangesFrom = (start: number) => accounts.running.appleExchanges.slice(start)

describe('DELETE /v1/me', () => {
  test('deletes the account and all it synced, tells the email, and a later sign-in makes a new account', async () => {
    const learner = await accounts.learner('delete-me@example.com')
    await accounts.sync(learner.token, {
      mutations: [
        {
          id: randomUUID(),
          entity: 'list',
          operation: 'create',
          entityId: randomUUID(),
          fields: { name: 'Gone', position: 0 }
        },
        {
          id: randomUUID(),
          entity: 'knownWord',
          operation: 'mark',
          entityId: '0'.repeat(32),
          baseVersion: 0,
          fields: { headword: '見る', reading: 'みる' }
        },
        {
          id: randomUUID(),
          entity: 'watchedVideo',
          operation: 'watch',
          entityId: 'dQw4w9WgXcQ',
          baseVersion: 0,
          fields: { watchedAt: '2026-10-01T12:00:00Z', title: 'Gone too' }
        },
        {
          id: randomUUID(),
          entity: 'bookmarkedSentence',
          operation: 'add',
          entityId: randomUUID(),
          fields: {
            text: '誰かが言ったこと。',
            translation: 'What someone said.',
            language: 'ja',
            bookmarkedAt: '2026-10-01T12:00:00Z'
          }
        }
      ]
    })
    const before = accounts.running.service.mailbox.messages().length
    expect(await remove(learner)).toMatchObject({ status: 200, body: { status: 'deleted' } })

    expect((await accounts.me(learner.token)).status).toBe(401)
    expect((await accounts.sync(learner.token, {})).status).toBe(401)
    for (const table of [
      'users',
      'sessions',
      'user_identities',
      'known_words',
      'word_lists',
      'watched_videos',
      'translation_bookmarks',
      'sync_changes',
      'sync_mutations'
    ]) {
      const column = table === 'users' ? 'id' : 'user_id'
      const rows = await accounts.running.service.rows(
        `select count(*)::int as n from ${table} where ${column} = '${learner.userId}'`
      )
      expect(rows, table).toEqual([{ n: 0 }])
    }
    const notice = await accounts.running.as.lastMessageTo('delete-me@example.com', before)
    expect(notice.subject).toBe('Your Zenbu Japanese account was deleted')

    const again = await accounts.learner('delete-me@example.com')
    expect(again.userId).not.toBe(learner.userId)
    expect((await accounts.me(again.token)).body).toMatchObject({ version: 1 })
  })

  test('needs a sign-in from the last 10 minutes, and the learner to confirm', async () => {
    const learner = await accounts.learner('delete-stale@example.com')
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }]) {
      expect((await remove(learner, body)).status, JSON.stringify(body)).toBe(400)
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    expect(await remove(learner)).toMatchObject({
      status: 403,
      body: { error: { code: 'sign_in_again' } }
    })
    vi.useRealTimers()
    expect((await accounts.me(learner.token)).status).toBe(200)
  })

  test('lets Tomodachi delete the account it signed in to, without the profile scope', async () => {
    const tomodachi = await accounts.learner('delete-tomo@example.com', 'tomodachi')
    expect((await accounts.me(tomodachi.token)).status).toBe(403)
    expect(await remove(tomodachi)).toMatchObject({ status: 200, body: { status: 'deleted' } })
  })

  test("revokes the app's Apple access with a fresh authorization code before it deletes an Apple account, and never another account's", async () => {
    const learner = await appleLearner(appBundleIdentifier, 'apple-deleting', false)
    const exchanged = accounts.running.appleExchanges.length

    expect(await remove(learner)).toMatchObject({
      status: 400,
      body: { error: { code: 'apple_authorization_needed' } }
    })
    expect(await remove(learner, { confirm: true, appleAuthorizationCode: 'stale' })).toMatchObject(
      {
        status: 400,
        body: { error: { code: 'apple_authorization_invalid' } }
      }
    )
    expect((await accounts.me(learner.token)).status).toBe(200)
    expect(accounts.running.appleRevoked).toEqual([])

    expect(
      await remove(learner, { confirm: true, appleAuthorizationCode: appleCodeFor('someone-else') })
    ).toMatchObject({ status: 400, body: { error: { code: 'apple_account_mismatch' } } })
    expect(accounts.running.appleRevoked).toEqual(['refresh-for-apple-code:someone-else'])

    await appleLearner(appBundleIdentifier, 'apple-other-account', false)
    expect(
      await remove(learner, {
        confirm: true,
        appleAuthorizationCode: appleCodeFor('apple-other-account')
      })
    ).toMatchObject({ status: 400, body: { error: { code: 'apple_account_mismatch' } } })
    expect(accounts.running.appleRevoked).toEqual(['refresh-for-apple-code:someone-else'])

    const lines = logged()
    expect(
      await remove(learner, { confirm: true, appleAuthorizationCode: misconfiguredAppleCode })
    ).toMatchObject({ status: 503, body: { error: { code: 'apple_unavailable' } } })
    expect(lines()).toContain('"appleError":"invalid_client"')
    expect(
      await remove(learner, { confirm: true, appleAuthorizationCode: appleCodeWithoutAppleId })
    ).toMatchObject({ status: 503, body: { error: { code: 'apple_unavailable' } } })
    expect(lines()).toContain('named no refresh token or Apple ID')
    expect(accounts.running.appleRevoked).toEqual(['refresh-for-apple-code:someone-else'])
    expect((await accounts.me(learner.token)).status).toBe(200)

    expect(
      await remove(learner, {
        confirm: true,
        appleAuthorizationCode: appleCodeFor('apple-deleting')
      })
    ).toMatchObject({ status: 200 })
    expect(accounts.running.appleRevoked).toContain('refresh-for-apple-code:apple-deleting')
    expect(new Set(exchangesFrom(exchanged).map(each => JSON.stringify(each)))).toEqual(
      new Set([JSON.stringify({ clientId: appBundleIdentifier, redirectUri: null })])
    )
  })

  test("takes the website's Apple code with the return URL its popup named, on the website's origins only", async () => {
    const learner = await appleLearner(websiteServicesId, 'apple-web-deleting', true)
    expect(decodeJwt(learner.token)).toMatchObject({ azp: 'zenbu-web' })
    const code = appleCodeFor('apple-web-deleting')
    const popupReturn = `${websiteOrigin}/account/`

    expect(
      await remove(learner, {
        confirm: true,
        appleAuthorizationCode: code,
        appleRedirectUri: 'https://evil.example/account/'
      })
    ).toMatchObject({ status: 400, body: { error: { code: 'bad_request' } } })
    let exchanged = accounts.running.appleExchanges.length
    expect(
      await remove(learner, { confirm: true, appleAuthorizationCode: appleCodeFor('someone') })
    ).toMatchObject({ status: 400, body: { error: { code: 'apple_account_mismatch' } } })
    expect(exchangesFrom(exchanged)).toEqual([
      { clientId: websiteServicesId, redirectUri: `${publicUrl}/v1/auth/callback/apple` }
    ])
    expect((await accounts.me(learner.token)).status).toBe(200)

    exchanged = accounts.running.appleExchanges.length
    expect(
      await remove(learner, {
        confirm: true,
        appleAuthorizationCode: code,
        appleRedirectUri: popupReturn
      })
    ).toMatchObject({ status: 200, body: { status: 'deleted' } })
    expect(exchangesFrom(exchanged)).toEqual([
      { clientId: websiteServicesId, redirectUri: popupReturn }
    ])
    expect(accounts.running.appleRevoked).toContain('refresh-for-apple-code:apple-web-deleting')
  })
})
