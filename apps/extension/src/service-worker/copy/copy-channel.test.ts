import { describe, expect, it, vi } from 'vitest'
import { askAccount } from '../../shared/account'
import { askCopy, askKnown, type CopyAnswer, onKnownChanged } from '../../shared/account-copy'
import {
  extensionId,
  json,
  signedInAnswer,
  startAccountOn,
  user
} from '../../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../../test/copy-stand-in'
import { subscribed, word } from '../../test/copy-world'
import { startExtension } from '../../test/extension'
import { answerCopy, tellKnown } from './copy-channel'
import type { AccountCopy } from './copy-service'

const pages = `chrome-extension://${extensionId}`

const other = { id: 'user-2', email: 'other@example.com' }

const syncing = {
  'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
  'GET /v1/me/subscription': () => json(200, subscribed),
  'POST /v1/sync': asked => json(200, syncAnswer(appliedTo(asked.body as Sync)))
} satisfies Parameters<typeof startAccountOn>[1]

const signInByCode = (email: string) =>
  askAccount({ account: 'sign-in', with: { way: 'code', email, code: '123456' } })

function answering(copy: Partial<AccountCopy> = {}) {
  const reportFailure = vi.fn()
  const answer = vi.fn(async (): Promise<CopyAnswer> => ({ type: 'opened' }))
  const listener = answerCopy({ answer, ...copy } as AccountCopy, reportFailure, pages)
  const ask = (message: unknown, origin?: string) =>
    new Promise<{ keeps: boolean; answer: unknown }>(resolve => {
      const keeps = listener(message, { origin }, given => resolve({ keeps, answer: given }))
      if (!keeps) resolve({ keeps, answer: undefined })
    })
  return { ask, answer, reportFailure }
}

const asking = (copy: unknown) => ({ target: 'service-worker', copy })

describe("the copy's messages", () => {
  it("answers the extension's own pages, and only asks whether words are known from a website", async () => {
    const { ask, answer } = answering()
    await expect(ask(asking({ copy: 'read' }), pages)).resolves.toMatchObject({ keeps: true })
    for (const request of [{ copy: 'read' }, { copy: 'change', change: {} }, { copy: 'sync' }]) {
      await expect(ask(asking(request))).resolves.toEqual({ keeps: false, answer: undefined })
    }
    await expect(ask(asking({ copy: 'known', items: [word.item] }))).resolves.toMatchObject({
      keeps: true
    })
    await expect(ask(asking({ copy: 'known', items: [1] }))).resolves.toMatchObject({
      keeps: false
    })
    await expect(ask({ target: 'service-worker', settings: 'read' }, pages)).resolves.toMatchObject(
      { keeps: false }
    )
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('reports a copy that failed by its code, and answers that it failed', async () => {
    const { ask, reportFailure } = answering({
      answer: () => Promise.reject(new Error(`No room for ${user.email}`))
    })
    const { answer } = await ask(asking({ copy: 'read' }), pages)
    expect(answer).toMatchObject({ type: 'failed' })
    expect(reportFailure.mock.calls).toEqual([['account-copy']])
  })

  it('tells the pages and every open tab when words change, whichever cannot hear it', async () => {
    const sent: unknown[] = []
    const tell = tellKnown(
      {
        query: async () => [{ id: 1 }, {}, { id: 2 }],
        sendMessage: async (tabId, message) => {
          if (tabId === 1) throw new Error('No content script here.')
          sent.push([tabId, message])
        }
      },
      { sendMessage: () => Promise.reject(new Error('No page is open.')) }
    )
    tell({ target: 'known', known: { [word.item]: true } })
    await vi.waitFor(() =>
      expect(sent).toEqual([[2, { target: 'known', known: { [word.item]: true } }]])
    )
  })

  it('lets a content script ask whether a word is known and hear when it changes, through the service worker', async () => {
    const fake = startExtension({ tabs: [{ id: 4, url: 'https://www.youtube.com/watch?v=x' }] })
    startAccountOn(fake, {
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
      ...syncing
    })
    await signInByCode(user.email)
    const tab = fake.inTab(4)
    const heard: unknown[] = []
    onKnownChanged(known => heard.push(known), tab.onMessage)
    await expect(askKnown([word.item], tab)).resolves.toEqual({ [word.item]: false })
    await expect(askCopy({ copy: 'change', change: { change: 'mark', ...word } })).resolves.toEqual(
      { type: 'changed' }
    )
    await vi.waitFor(() => expect(heard).toContainEqual({ [word.item]: true }))
    await expect(askKnown([word.item], tab)).resolves.toEqual({ [word.item]: true })
    await expect(askCopy({ copy: 'read' }, tab)).resolves.toMatchObject({ type: 'failed' })
  })

  it("hands the copy to the account the website signs in, as the extension's own sign-in does, and syncs it", async () => {
    const fake = startExtension()
    const service = startAccountOn(fake, {
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-other', other),
      'POST /v1/auth/sign-in/extension-code': () => signedInAnswer('session-website'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      ...syncing
    })
    const syncs = () => service.asked.filter(asked => asked.route === 'POST /v1/sync')
    await signInByCode(other.email)
    await askCopy({ copy: 'change', change: { change: 'mark', ...word } })
    await vi.waitFor(() => expect(syncs().length).toBeGreaterThan(0))
    await askAccount({ account: 'sign-out' })
    const before = syncs().length
    await expect(
      fake
        .fromPage('https://zenbujapanese.com')
        .sendMessage({ type: 'sign-in', code: 'website-code' })
    ).resolves.toEqual({ signedIn: true })
    await vi.waitFor(async () =>
      expect(await askCopy({ copy: 'read' })).toMatchObject({
        copy: { owner: user.email, knownWords: [], unsynced: 0, sync: 'synced' }
      })
    )
    expect(syncs().slice(before)).toMatchObject([{ body: { cursor: null, mutations: [] } }])
  })
})
