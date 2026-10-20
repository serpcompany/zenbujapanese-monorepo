import { randomUUID } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { standIns } from '../test/app'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'
import { aJpeg, photoIdOf, uploaded } from '../test/photos'
import type { Service } from '../test/service'
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

async function lapse({
  originalTransactionId,
  appAccountToken
}: Awaited<ReturnType<typeof subscribe>>) {
  await billing.appleWebhook(
    await appStore.notification({
      type: 'EXPIRED',
      subtype: 'VOLUNTARY',
      transaction: { originalTransactionId, appAccountToken, purchaseDate: Date.now() + 1000 },
      status: 2
    })
  )
}

const gatedBy = (path: string) =>
  cloudDataPaths.some(gate =>
    gate.endsWith('/*')
      ? path === gate.slice(0, -2) || path.startsWith(gate.slice(0, -1))
      : path === gate
  )

const nothingSent = new Uint8Array()

async function downloaded(service: Service, learner: Learner, photoId: string) {
  const answer = await service.sendPhoto(learner.token, photoId, nothingSent, 'GET')
  expect(answer.status).toBe(200)
  return new Uint8Array(await answer.arrayBuffer())
}

const photoService = () => billing.accounts.running.service

const storedFor = (learner: Learner) =>
  [...photoService().photoStorage.objects.keys()].filter(key =>
    key.startsWith(`${learner.userId}/`)
  )

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
    const bought = await subscribe(learner)
    expect((await billing.subscription(learner)).cloudAccess).toBe('subscribed')
    const synced = await billing.accounts.sync(learner.token, { mutations: [newList()] })
    expect(synced.status).toBe(200)
    await lapse(bought)
    expect((await billing.accounts.sync(learner.token, {})).status).toBe(402)
  })

  test('leaves sync free for an app the owner names, such as Tomodachi', async () => {
    const tomodachi = await billing.accounts.learner('cloud-tomodachi@example.com', 'tomodachi')
    expect((await billing.accounts.sync(tomodachi.token, {})).status).toBe(200)
  })

  test('refuses to upload or download a photo file with no subscription, keeping nothing', async () => {
    const learner = await billing.accounts.learner('cloud-photo-free-rider@example.com')
    const bytes = aJpeg()
    for (const [method, sent] of [
      ['PUT', bytes],
      ['GET', nothingSent]
    ] as const) {
      const answer = await photoService().sendPhoto(learner.token, photoIdOf(bytes), sent, method)
      expect(answer.status, method).toBe(402)
      expect(await answer.json(), method).toMatchObject({
        error: { code: 'subscription_required' }
      })
    }
    expect(
      await billing.rows(
        `select count(*)::int as n from photo_files where user_id = '${learner.userId}'`
      )
    ).toEqual([{ n: 0 }])
    expect(storedFor(learner)).toEqual([])
  })

  test('uploads and downloads photo files once the account subscribes, and refuses both when it lapses', async () => {
    const learner = await billing.accounts.learner('cloud-photo-subscriber@example.com')
    const bought = await subscribe(learner)
    const bytes = aJpeg()
    const photoId = await uploaded(billing.accounts, learner, bytes)
    expect(await downloaded(photoService(), learner, photoId)).toEqual(bytes)
    await lapse(bought)
    const download = await photoService().sendPhoto(learner.token, photoId, nothingSent, 'GET')
    expect(download.status).toBe(402)
    const another = aJpeg()
    expect(
      (await photoService().sendPhoto(learner.token, photoIdOf(another), another)).status
    ).toBe(402)
    expect(storedFor(learner)).toHaveLength(1)
  })

  test('deletes an account with no subscription, and its photo files, since deleting is free', async () => {
    const learner = await billing.accounts.learner('cloud-photo-leaver@example.com')
    const bought = await subscribe(learner)
    await uploaded(billing.accounts, learner)
    await lapse(bought)
    expect((await billing.deleteAccount(learner)).status).toBe(200)
    await vi.waitFor(() => expect(storedFor(learner)).toEqual([]))
  })

  test('lists 402 on every operation of every gated route in the contract', () => {
    const contract = photoService().app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'gate', version: '1' }
    })
    const gated = Object.entries(contract.paths ?? {}).filter(([path]) => gatedBy(path))
    expect(gated.map(([path]) => path).sort()).toEqual(['/v1/photos/{photoId}', '/v1/sync'])
    for (const [path, operations] of gated) {
      for (const [method, operation] of Object.entries(operations ?? {})) {
        expect('402' in (operation as { responses: object }).responses, `${method} ${path}`).toBe(
          true
        )
      }
    }
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
    expect(paths).toEqual(
      expect.arrayContaining(['/v1/sync', '/v1/photos/{photoId}', '/v1/photos/:photoId'])
    )
    expect(paths.filter(path => !gatedBy(path) && !freeOfTheGate.includes(path))).toEqual([])
    expect(freeOfTheGate.filter(gatedBy)).toEqual([])
  })
})

describe('cloud data, with ACCOUNT_API_CLOUD_ACCESS=free, the default', () => {
  const accounts = useAccountService()

  test('syncs, uploads, and downloads photo files with no subscription, as before the gate', async () => {
    const learner = await accounts.learner('cloud-free-default@example.com')
    expect((await accounts.sync(learner.token, { mutations: [newList()] })).status).toBe(200)
    const bytes = aJpeg()
    const photoId = await uploaded(accounts, learner, bytes)
    expect(await downloaded(accounts.running.service, learner, photoId)).toEqual(bytes)
  })
})
