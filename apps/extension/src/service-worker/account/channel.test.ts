import { describe, expect, it, vi } from 'vitest'
import { askAccount, isAccountEnvelope, onAccountChanged } from '../../shared/account'
import {
  extensionId,
  json,
  standInIdentity,
  standInService,
  storageArea,
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
  const ask = (message: unknown) =>
    new Promise<{ keeps: boolean; answer: unknown }>(resolve => {
      const keeps = listeners[0]?.(message, {}, answer => resolve({ keeps, answer })) ?? false
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
        readSubscription: async () => undefined
      },
      reportFailure
    )
    const answer = await new Promise(resolve =>
      listener({ target: 'service-worker', account: { account: 'read' } }, {}, resolve)
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
