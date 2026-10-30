import { describe, expect, it, vi } from 'vitest'
import { askAccount, isAccountEnvelope, onAccountChanged } from '../../shared/account'
import {
  extensionId,
  json,
  standInIdentity,
  standInService,
  storageArea,
  subscription,
  user
} from '../../test/account-stand-in'
import { answerAccount, startAccount } from './channel'
import { accountStore } from './store'

function started(routes: Parameters<typeof standInService>[0] = {}) {
  const listeners: Parameters<Parameters<typeof startAccount>[0]['onMessage']['addListener']>[0][] =
    []
  const startups: (() => void)[] = []
  const local = storageArea()
  const session = storageArea()
  const setAccessLevel = vi.fn(async () => undefined)
  const reportFailure = vi.fn()
  const service = standInService(routes)
  startAccount({
    storage: { local: { ...local.area, setAccessLevel }, session: session.area },
    identity: standInIdentity().identity,
    extensionId,
    onMessage: { addListener: listener => listeners.push(listener) },
    onStartup: { addListener: listener => startups.push(listener) },
    send: service.send,
    reportFailure
  })
  const ask = (message: unknown, sender = { origin: `chrome-extension://${extensionId}` }) =>
    new Promise<{ keeps: boolean; answer: unknown }>(resolve => {
      const keeps = listeners[0]?.(message, sender, answer => resolve({ keeps, answer })) ?? false
      if (!keeps) resolve({ keeps, answer: undefined })
    })
  return { ask, startups, local, session, setAccessLevel, reportFailure, service }
}

describe('startAccount', () => {
  it("closes the extension's local storage to content scripts before anything is kept there", () => {
    const { setAccessLevel } = started()
    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' })
  })

  it("answers a page's account ask, and leaves every other message to the other listeners", async () => {
    const { ask } = started()
    await expect(ask({ target: 'service-worker', account: { account: 'read' } })).resolves.toEqual({
      keeps: true,
      answer: { type: 'account', account: { signedIn: false } }
    })
    await expect(ask({ target: 'service-worker', settings: 'read' })).resolves.toEqual({
      keeps: false,
      answer: undefined
    })
  })

  it("answers a content script only a read: signing in, out, or deleting is the extension's own pages'", async () => {
    const { ask, service } = started()
    const page = { origin: 'https://www.youtube.com', tab: { id: 7 } }
    await expect(
      ask({ target: 'service-worker', account: { account: 'read' } }, page)
    ).resolves.toEqual({
      keeps: true,
      answer: { type: 'access', signedIn: false, cloudAccess: null }
    })
    for (const account of [
      { account: 'sign-out' },
      { account: 'send-code', email: user.email },
      { account: 'sign-in', with: { way: 'google' } },
      { account: 'delete', with: { way: 'apple' } },
      { account: 'opened' },
      { account: 'went-to-subscribe' }
    ]) {
      await expect(ask({ target: 'service-worker', account }, page)).resolves.toEqual({
        keeps: false,
        answer: undefined
      })
    }
    expect(service.routes()).toEqual([])
  })

  it("answers a content script's read of a signed-in account with whether it is signed in and its cloud access, and nothing else", async () => {
    const { ask, local, session } = started()
    const store = accountStore({ local: local.area, session: session.area })
    await store.keepSignIn('session-1', user)
    await store.keepSubscription('session-1', { ...subscription, cloudAccess: 'subscribed' })
    const read = { target: 'service-worker', account: { account: 'read' } }
    const fromPage = await ask(read, { origin: 'https://www.youtube.com' })
    expect(fromPage.answer).toEqual({ type: 'access', signedIn: true, cloudAccess: 'subscribed' })
    expect(JSON.stringify(fromPage.answer)).not.toContain(user.email)
    await expect(ask(read)).resolves.toMatchObject({
      answer: { account: { signedIn: true, email: user.email, subscription: { status: 'none' } } }
    })
  })

  it('reads the subscription when the browser starts, for a learner who is signed in', async () => {
    const { startups, local, session, service } = started({
      'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
      'GET /v1/me/subscription': () =>
        json(200, { status: 'none', cloudAccess: 'subscription_required' })
    })
    await accountStore({ local: local.area, session: session.area }).keepSignIn('session-1', user)
    startups[0]?.()
    await vi.waitFor(() =>
      expect(service.routes()).toEqual(['GET /v1/auth/token', 'GET /v1/me/subscription'])
    )
  })

  it('reports a failed ask by its code alone, and answers it with a failure', async () => {
    const reportFailure = vi.fn()
    const listener = answerAccount(
      {
        answer: () => Promise.reject(new Error(user.email)),
        readSubscription: async () => false
      },
      reportFailure,
      `chrome-extension://${extensionId}`
    )
    const answer = await new Promise(resolve =>
      listener(
        { target: 'service-worker', account: { account: 'read' } },
        { origin: `chrome-extension://${extensionId}` },
        resolve
      )
    )
    expect(answer).toMatchObject({ type: 'failed' })
    expect(reportFailure).toHaveBeenCalledWith('account-answer')
    expect(JSON.stringify(reportFailure.mock.calls)).not.toContain(user.email)
  })

  it('reports storage it could not close by its code', async () => {
    const reportFailure = vi.fn()
    startAccount({
      storage: {
        local: { ...storageArea().area, setAccessLevel: () => Promise.reject(new Error('no')) },
        session: storageArea().area
      },
      identity: standInIdentity().identity,
      extensionId,
      onMessage: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      reportFailure
    })
    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledWith('account-storage'))
  })
})

describe('account messages', () => {
  it('knows an account ask by its target and request', () => {
    expect(isAccountEnvelope({ target: 'service-worker', account: { account: 'sign-out' } })).toBe(
      true
    )
    expect(isAccountEnvelope({ target: 'offscreen', account: { account: 'sign-out' } })).toBe(false)
    expect(isAccountEnvelope({ target: 'service-worker', account: 'sign-out' })).toBe(false)
  })

  it('turns a service worker that cannot answer into a failure', async () => {
    const gone = { sendMessage: () => Promise.reject(new Error('Receiving end does not exist.')) }
    const empty = { sendMessage: async () => undefined }
    await expect(askAccount({ account: 'read' }, gone)).resolves.toMatchObject({ type: 'failed' })
    await expect(askAccount({ account: 'read' }, empty)).resolves.toMatchObject({ type: 'failed' })
  })

  it('tells a page when the account changes, not when another key does, and stops when asked', () => {
    const heard: ((changes: Record<string, unknown>) => void)[] = []
    const events = {
      addListener: (listener: (changes: Record<string, unknown>) => void) => heard.push(listener),
      removeListener: vi.fn()
    }
    const listener = vi.fn()
    const stop = onAccountChanged(listener, events)
    heard[0]?.({ 'sites.off': {} })
    heard[0]?.({ account: {} })
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    expect(events.removeListener).toHaveBeenCalledWith(heard[0])
  })
})
