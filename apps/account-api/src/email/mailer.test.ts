import { afterEach, describe, expect, test, vi } from 'vitest'
import type { EmailConfig, EmailProvider } from '../config'
import { DevMailbox } from './mailbox'
import { createMailer } from './mailer'
import { signInCodeMessage } from './sign-in-code'

const from = 'Zenbu Japanese <support@zenbujapanese.com>'
const message = signInCodeMessage('learner@example.com', '482913')
const config = (
  provider: EmailProvider | null,
  allowedRecipients: string[] | null = null
): EmailConfig => ({
  from,
  provider,
  allowedRecipients
})

function logged() {
  const lines: string[] = []
  const collect = (chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(collect)
  vi.spyOn(process.stderr, 'write').mockImplementation(collect)
  return () => lines.join('')
}

afterEach(() => vi.restoreAllMocks())

describe('the mailer', () => {
  test('sends through Cloudflare Email Service, from the support address, with no other reply-to', async () => {
    const lines = logged()
    const fetch = vi.fn(async () => Response.json({ success: true }))
    const mailer = createMailer(
      config({ kind: 'cloudflare', accountId: 'acct', token: 'send-only' }),
      null,
      fetch
    )
    expect(await mailer.send(message)).toBe('sent')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/email/sending/send')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer send-only' })
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      from,
      to: ['learner@example.com'],
      subject: message.subject,
      text: message.text
    })
    expect(body).not.toHaveProperty('reply_to')
    expect(lines()).not.toMatch(/learner@example\.com|482913/)
  })

  test('sends through useSend when it is configured instead', async () => {
    const fetch = vi.fn(async () => Response.json({ emailId: 'e1' }))
    const mailer = createMailer(config({ kind: 'usesend', apiKey: 'key' }), null, fetch)
    expect(await mailer.send(message)).toBe('sent')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.usesend.com/api/v1/emails')
    expect(JSON.parse(String(init.body))).toEqual({
      from,
      to: 'learner@example.com',
      subject: message.subject,
      text: message.text
    })
  })

  test('captures the message in the dev mailbox on a local run, and sends nothing', async () => {
    const fetch = vi.fn()
    const mailbox = new DevMailbox()
    const mailer = createMailer(config({ kind: 'dev-mailbox' }), mailbox, fetch)
    expect(await mailer.send(message)).toBe('captured')
    expect(mailbox.messages()[0]).toMatchObject(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sends nothing without a sender, and is marked unavailable', async () => {
    const mailer = createMailer(config(null), null, vi.fn())
    expect(mailer.available).toBe(false)
    expect(await mailer.send(message)).toBe('skipped')
  })

  test('sends staging only to its test recipients, by address or domain', async () => {
    const fetch = vi.fn(async () => Response.json({ success: true }))
    const provider: EmailProvider = { kind: 'cloudflare', accountId: 'acct', token: 't' }
    const mailer = createMailer(
      config(provider, ['tester@serp.co', '@zenbujapanese.com']),
      null,
      fetch
    )
    expect(await mailer.send(message)).toBe('skipped')
    expect(await mailer.send(signInCodeMessage('tester@serp.co', '1'))).toBe('sent')
    expect(await mailer.send(signInCodeMessage('Dev@ZenbuJapanese.com', '1'))).toBe('sent')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('reports a refused or unreachable send by its status or kind, never its recipient or code', async () => {
    const lines = logged()
    const provider: EmailProvider = { kind: 'cloudflare', accountId: 'acct', token: 't' }
    const refused = createMailer(
      config(provider),
      null,
      vi.fn(async () => new Response('no', { status: 403 }))
    )
    expect(await refused.send(message)).toBe('failed')
    const offline = createMailer(
      config(provider),
      null,
      vi.fn(async () => Promise.reject(new TypeError('fetch failed')))
    )
    expect(await offline.send(message)).toBe('failed')
    expect(lines()).toContain('"status":403')
    expect(lines()).toContain('"kind":"TypeError"')
    expect(lines()).not.toMatch(/learner@example\.com|482913/)
  })
})
