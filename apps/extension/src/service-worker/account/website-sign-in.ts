import { fields } from '../../shared/messages'
import type { AccountService, WebsiteReply } from './account-service'

type Sender = { origin?: string }

const longestCode = 200

export function isTheWebsite(origin: string | undefined, websites: readonly string[]): boolean {
  if (origin === undefined) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.origin !== origin) return false
  return (
    websites.includes(origin) ||
    (url.protocol === 'http:' && websites.includes(`${url.protocol}//${url.hostname}`))
  )
}

function codeOf(message: unknown): string | null {
  const sent = fields(message)
  const code = sent?.type === 'sign-in' ? sent.code : null
  return typeof code === 'string' && code.length > 0 && code.length <= longestCode ? code : null
}

export function answerWebsite(
  service: Pick<AccountService, 'signInFromWebsite'>,
  websites: readonly string[],
  reportFailure: (code: 'account-answer') => void
) {
  return (message: unknown, sender: Sender, respond: (reply: WebsiteReply) => void): boolean => {
    if (!isTheWebsite(sender.origin, websites)) return false
    const code = codeOf(message)
    if (code === null) return false
    service.signInFromWebsite(code).then(respond, () => {
      reportFailure('account-answer')
      respond({ signedIn: false, refusal: 'try-again' })
    })
    return true
  }
}
