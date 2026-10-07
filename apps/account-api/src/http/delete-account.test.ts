import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { appleCodeFor, misconfiguredAppleCode } from '../test/identity-provider'
import { logged } from '../test/logged'
import { appBundleIdentifier } from '../test/service'
import { sessionToken, sha256 } from '../test/sign-in'

const accounts = useAccountService({ appleKey: true })

afterEach(() => vi.useRealTimers())

const remove = (learner: Learner, body: Record<string, unknown> = { confirm: true }) =>
  accounts.running.service.call('/v1/me', { token: learner.token, body, method: 'DELETE' })

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

  test("revokes the app's Apple access with a fresh authorization code before it deletes an Apple account", async () => {
    const { as, service } = accounts.running
    const nonce = await as.nonce()
    const token = await as.idToken(
      accounts.running.apple,
      appBundleIdentifier,
      'apple-deleting',
      'apple-deleting@example.com',
      sha256(nonce)
    )
    const signedIn = await as.withIdToken('apple', token, nonce)
    const issued = await service.call('/v1/auth/token', { token: sessionToken(signedIn) })
    const learner = { userId: '', session: '', token: String(issued.body?.token) }

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

    const lines = logged()
    expect(
      await remove(learner, { confirm: true, appleAuthorizationCode: misconfiguredAppleCode })
    ).toMatchObject({ status: 503, body: { error: { code: 'apple_unavailable' } } })
    expect(lines()).toContain('"appleError":"invalid_client"')
    expect((await accounts.me(learner.token)).status).toBe(200)

    expect(
      await remove(learner, {
        confirm: true,
        appleAuthorizationCode: appleCodeFor('apple-deleting')
      })
    ).toMatchObject({ status: 200 })
    expect(accounts.running.appleRevoked).toContain('refresh-for-apple-code:apple-deleting')
  })
})
