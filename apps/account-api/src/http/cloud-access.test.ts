import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { standIns } from '../test/app'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'
import { createApp } from './app'
import { cloudDataPaths } from './subscription'

const appStore = standInAppStore()
const billing = useBillingService({
  appStore,
  cloud: {
    needsSubscription: true,
    freeForAccountsMadeBefore: null,
    freeUntil: null,
    freeClients: ['tomodachi']
  }
})

const newList = () => ({
  id: randomUUID(),
  entity: 'list',
  operation: 'create',
  entityId: randomUUID(),
  fields: { name: 'Paid for', position: 0 }
})

async function subscribe(learner: Learner, originalTransactionId = randomUUID()) {
  const appAccountToken = (await billing.subscription(learner)).appAccountToken
  const signed = await appStore.transaction({ originalTransactionId, appAccountToken })
  const posted = await billing.call('/v1/me/subscription/apple', {
    token: learner.token,
    body: { signedTransaction: signed }
  })
  expect(posted.status).toBe(200)
  return { originalTransactionId, appAccountToken }
}

describe('cloud data, with ACCOUNT_API_CLOUD_ACCESS=subscription', () => {
  test('refuses to sync an account with no subscription, applying nothing, while the free routes answer', async () => {
    const learner = await billing.accounts.learner('cloud-free-rider@example.com')
    const refused = await billing.accounts.sync(learner.token, { mutations: [newList()] })
    expect(refused).toMatchObject({
      status: 402,
      body: { error: { code: 'subscription_required' } }
    })
    expect(
      await billing.rows(
        `select count(*)::int as n from word_lists where user_id = '${learner.userId}'`
      )
    ).toEqual([{ n: 0 }])
    expect((await billing.subscription(learner)).cloudAccess).toBe('subscription_required')
    expect((await billing.accounts.me(learner.token)).status).toBe(200)
    expect(
      (await billing.accounts.changeMe(learner.token, { baseVersion: 1, name: 'Still free' }))
        .status
    ).toBe(200)
  })

  test('syncs once the account subscribes, and refuses again when the subscription lapses', async () => {
    const learner = await billing.accounts.learner('cloud-subscriber@example.com')
    const { originalTransactionId, appAccountToken } = await subscribe(learner)
    expect((await billing.subscription(learner)).cloudAccess).toBe('subscribed')
    const synced = await billing.accounts.sync(learner.token, { mutations: [newList()] })
    expect(synced.status).toBe(200)
    await billing.appleWebhook(
      await appStore.notification({
        type: 'EXPIRED',
        subtype: 'VOLUNTARY',
        transaction: { originalTransactionId, appAccountToken, purchaseDate: Date.now() + 1000 },
        status: 2
      })
    )
    expect((await billing.accounts.sync(learner.token, {})).status).toBe(402)
  })

  test('leaves sync free for an app the owner names, such as Tomodachi', async () => {
    const tomodachi = await billing.accounts.learner('cloud-tomodachi@example.com', 'tomodachi')
    expect((await billing.accounts.sync(tomodachi.token, {})).status).toBe(200)
  })

  test.each(cloudDataPaths)('gates %s, and the contract says so', async path => {
    const learner = await billing.accounts.learner(
      `cloud-gate-${path.replaceAll('/', '-')}@example.com`
    )
    expect((await billing.call(path, { token: learner.token, body: {} })).status).toBe(402)
    const contract = billing.accounts.running.service.app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'gate', version: '1' }
    })
    expect(
      Object.values(contract.paths?.[path] ?? {}).every(
        each => '402' in (each as { responses: object }).responses
      )
    ).toBe(true)
  })

  test('answers 401 for a deleted account, as sync does', async () => {
    const learner = await billing.accounts.learner('cloud-deleted@example.com')
    await billing.rows(`delete from users where id = '${learner.userId}'`)
    expect((await billing.accounts.sync(learner.token, {})).status).toBe(401)
  })

  test('covers every route that holds cloud data: each is gated, or one kept free on purpose', () => {
    const freeOfTheGate = [
      '/v1/health',
      '/v1/me',
      '/v1/me/subscription',
      '/v1/me/subscription/apple',
      '/v1/me/subscription/checkout',
      '/v1/me/subscription/plans',
      '/v1/me/subscription/portal',
      '/v1/webhooks/apple',
      '/v1/webhooks/stripe'
    ]
    const app = createApp(standIns)
    const document = app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'gate', version: '1' }
    })
    const routed = app.routes
      .filter(route => route.method !== 'ALL' && !route.path.includes('*'))
      .map(route => route.path)
    const paths = [...new Set([...Object.keys(document.paths ?? {}), ...routed])].filter(
      path => path.startsWith('/v1/') && !path.startsWith('/v1/auth/')
    )
    expect(paths).toContain('/v1/sync')
    const gated: readonly string[] = cloudDataPaths
    expect(paths.filter(path => !gated.includes(path) && !freeOfTheGate.includes(path))).toEqual([])
    expect(freeOfTheGate.filter(path => gated.includes(path))).toEqual([])
  })
})
