import { describe, expect, it, vi } from 'vitest'
import { accountKey } from '../../shared/account'
import {
  accountWorld,
  json,
  refusal,
  signedInAnswer,
  signedInWorld,
  subscription,
  user
} from '../../test/account-stand-in'
import type { WebsiteReply } from './account-service'
import { accessTokenKey, sessionTokenKey } from './token-keys'
import { answerWebsite, isTheWebsite } from './website-sign-in'

const production = ['https://zenbujapanese.com']

const testBuild = ['https://zenbujapanese.com', 'http://localhost', 'http://127.0.0.1']

const handedOver = { type: 'sign-in', code: 'website-code' }

const redeem = 'POST /v1/auth/sign-in/extension-code'

function listening(reply: Promise<WebsiteReply> = Promise.resolve({ signedIn: true })) {
  const signInFromWebsite = vi.fn(() => reply)
  const reportFailure = vi.fn()
  const listener = answerWebsite({ signInFromWebsite }, production, reportFailure)
  const send = (message: unknown, origin?: string) =>
    new Promise<{ keeps: boolean; reply: unknown }>(resolve => {
      const keeps = listener(message, { origin }, answered => resolve({ keeps, reply: answered }))
      if (!keeps) resolve({ keeps, reply: undefined })
    })
  return { send, signInFromWebsite, reportFailure }
}

describe('isTheWebsite', () => {
  it("takes only the build's own website, by its exact origin", () => {
    expect(isTheWebsite('https://zenbujapanese.com', production)).toBe(true)
    for (const origin of [
      undefined,
      '',
      'https://staging.zenbujapanese.com',
      'https://zenbujapanese.com.example.com',
      'https://zenbujapanese.com/',
      'https://zenbujapanese.com:8443',
      'http://zenbujapanese.com',
      'https://www.youtube.com',
      'http://localhost:3000',
      'chrome-extension://kaalpflpefadijdemimciikalgpgjmok'
    ]) {
      expect(isTheWebsite(origin, production), origin).toBe(false)
    }
  })

  it('takes a local website on any port in a test build, and only over http', () => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:4321', 'http://localhost']) {
      expect(isTheWebsite(origin, testBuild), origin).toBe(true)
    }
    for (const origin of ['https://localhost:3000', 'http://localhost.example.com:3000']) {
      expect(isTheWebsite(origin, testBuild), origin).toBe(false)
    }
  })
})

describe('answerWebsite', () => {
  it("signs in with the code the website hands over, and answers the website's ask", async () => {
    const { send, signInFromWebsite } = listening()
    await expect(send(handedOver, 'https://zenbujapanese.com')).resolves.toEqual({
      keeps: true,
      reply: { signedIn: true }
    })
    expect(signInFromWebsite).toHaveBeenCalledWith('website-code')
  })

  it('leaves every message from another origin, and every other message, unanswered', async () => {
    const { send, signInFromWebsite } = listening()
    for (const origin of [undefined, 'https://www.youtube.com', 'https://zenbujapanese.com.evil']) {
      await expect(send(handedOver, origin)).resolves.toEqual({ keeps: false, reply: undefined })
    }
    for (const message of [
      undefined,
      'website-code',
      { code: 'website-code' },
      { type: 'sign-out', code: 'website-code' },
      { type: 'sign-in', code: '' },
      { type: 'sign-in', code: 7 },
      { type: 'sign-in', code: 'c'.repeat(201) },
      { target: 'service-worker', account: { account: 'read' } }
    ]) {
      await expect(send(message, 'https://zenbujapanese.com')).resolves.toEqual({
        keeps: false,
        reply: undefined
      })
    }
    expect(signInFromWebsite).not.toHaveBeenCalled()
  })

  it('reports a failed sign-in by its code alone, and answers Try again', async () => {
    const { send, reportFailure } = listening(Promise.reject(new Error('website-code')))
    await expect(send(handedOver, 'https://zenbujapanese.com')).resolves.toEqual({
      keeps: true,
      reply: { signedIn: false, refusal: 'try-again' }
    })
    expect(reportFailure.mock.calls).toEqual([['account-answer']])
  })
})

describe("the account's sign-in from the website", () => {
  it('redeems the code as the extension and keeps the session as every other sign-in does', async () => {
    const world = accountWorld({
      [redeem]: () => signedInAnswer('session-website'),
      'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
      'GET /v1/me/subscription': () => json(200, subscription)
    })
    await expect(world.account.signInFromWebsite('website-code')).resolves.toEqual({
      signedIn: true
    })
    expect(world.asked[0]?.body).toEqual({ code: 'website-code' })
    expect(world.asked[0]?.headers.get('x-zenbu-client')).toBe('zenbu-extension')
    expect(world.asked[0]?.headers.get('authorization')).toBeNull()
    expect(world.local.items.get(sessionTokenKey)).toBe('session-website')
    expect(world.local.items.get(accountKey)).toMatchObject({ user })
    expect(world.session.items.get(accessTokenKey)).toMatchObject({ token: 'access-1' })
    await expect(world.account.answer({ account: 'read' })).resolves.toEqual({
      type: 'account',
      account: { signedIn: true, email: user.email, subscription }
    })
  })

  it('keeps the session it has when it is signed in already, and redeems nothing', async () => {
    const world = await signedInWorld({ [redeem]: () => signedInAnswer('session-website') })
    await expect(world.account.signInFromWebsite('website-code')).resolves.toEqual({
      signedIn: false,
      refusal: 'signed-in-already'
    })
    expect(world.routes()).toEqual([])
    expect(world.local.items.get(sessionTokenKey)).toBe('session-earlier')
  })

  it('answers Wait when signing in is limited, and Try again when the code is spent, run out, or refused', async () => {
    const answers = [
      refusal(429, 'rate_limited', { 'retry-after': '30' }),
      refusal(401, 'invalid_code'),
      refusal(401, 'code_expired'),
      refusal(403, 'client_mismatch'),
      new Response('down', { status: 503 })
    ]
    const world = accountWorld({ [redeem]: () => answers.shift() ?? json(500, {}) })
    const replies = []
    for (let each = 0; each < 5; each++) {
      replies.push(await world.account.signInFromWebsite('website-code'))
    }
    expect(replies).toEqual([
      { signedIn: false, refusal: 'wait' },
      ...Array(4).fill({ signedIn: false, refusal: 'try-again' })
    ])
    expect(world.local.items.size).toBe(0)
  })
})
