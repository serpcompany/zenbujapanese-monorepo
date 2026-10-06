import { log } from '@zenbu/node-service/log'
import type { EmailConfig } from '../config'
import type { DevMailbox, Message } from './mailbox'

type Outcome = 'sent' | 'captured' | 'skipped' | 'failed'

export interface Mailer {
  readonly available: boolean
  send(message: Message): Promise<Outcome>
}

type Fetch = typeof fetch

const cloudflareApi = 'https://api.cloudflare.com/client/v4'
const usesendApi = 'https://app.usesend.com/api/v1/emails'

function allowed(recipient: string, allowedRecipients: string[] | null): boolean {
  if (allowedRecipients === null) return true
  const address = recipient.toLowerCase()
  return allowedRecipients.some(entry => {
    const rule = entry.toLowerCase()
    return rule.startsWith('@') ? address.endsWith(rule) : address === rule
  })
}

async function post(fetchImpl: Fetch, url: string, token: string, body: unknown) {
  return fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export function createMailer(
  config: EmailConfig,
  mailbox: DevMailbox | null,
  fetchImpl: Fetch = fetch
): Mailer {
  const provider = config.provider
  const deliver = async (message: Message): Promise<Response | null> => {
    if (provider === null) return null
    if (provider.kind === 'cloudflare') {
      return post(
        fetchImpl,
        `${cloudflareApi}/accounts/${provider.accountId}/email/sending/send`,
        provider.token,
        { from: config.from, to: [message.to], subject: message.subject, text: message.text }
      )
    }
    if (provider.kind === 'usesend') {
      return post(fetchImpl, usesendApi, provider.apiKey, {
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text
      })
    }
    mailbox?.add(message)
    return null
  }

  return {
    available: provider !== null,
    async send(message) {
      const via = provider?.kind ?? 'none'
      if (provider === null) {
        log('warn', 'email skipped', { via, reason: 'no sender is configured' })
        return 'skipped'
      }
      if (!allowed(message.to, config.allowedRecipients)) {
        log('info', 'email skipped', { via, reason: 'the recipient is not a test recipient' })
        return 'skipped'
      }
      try {
        const response = await deliver(message)
        if (response === null) {
          log('info', 'email captured', { via })
          return 'captured'
        }
        if (!response.ok) {
          log('error', 'email failed', { via, status: response.status })
          return 'failed'
        }
        log('info', 'email sent', { via })
        return 'sent'
      } catch (error) {
        log('error', 'email failed', {
          via,
          kind: error instanceof Error ? error.name : 'unknown'
        })
        return 'failed'
      }
    }
  }
}
