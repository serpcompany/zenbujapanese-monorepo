import { type AccountAnswer, isAccountEnvelope } from '../../shared/account'
import { apiOrigin, appleServicesId, googleClientId, signInWebsites } from '../../shared/hosts'
import { failure } from '../../shared/messages'
import { type AccountService, accountService, type WebsiteReply } from './account-service'
import { accountApi, type Send } from './api'
import type { Identity } from './identity'
import { signIns } from './sign-in'
import { type AccountStorage, accountStore } from './store'
import { accessTokens } from './tokens'
import { answerWebsite } from './website-sign-in'

type Events = { addListener(listener: () => void): void }

type Sender = { origin?: string }

type Messages<Answer> = {
  addListener(
    listener: (message: unknown, sender: Sender, respond: (answer: Answer) => void) => boolean
  ): void
}

type Parts = {
  storage: AccountStorage & {
    local: { setAccessLevel(details: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void> }
  }
  identity: Identity
  extensionId: string
  onMessage: Messages<AccountAnswer>
  onMessageExternal: Messages<WebsiteReply>
  onStartup: Events
  send?: Send
  reportFailure(code: 'account-answer' | 'account-storage'): void
}

const accessOnly = (answer: AccountAnswer): AccountAnswer =>
  answer.type === 'account'
    ? {
        type: 'access',
        signedIn: answer.account.signedIn,
        cloudAccess: answer.account.signedIn
          ? (answer.account.subscription?.cloudAccess ?? null)
          : null
      }
    : answer

export function answerAccount(
  service: Pick<AccountService, 'answer'>,
  reportFailure: Parts['reportFailure'],
  pagesOrigin: string
) {
  return (message: unknown, sender: Sender, respond: (answer: AccountAnswer) => void): boolean => {
    if (!isAccountEnvelope(message)) return false
    const fromPages = sender.origin === pagesOrigin
    if (!fromPages && message.account.account !== 'read') return false
    service.answer(message.account).then(
      answer => respond(fromPages ? answer : accessOnly(answer)),
      (error: unknown) => {
        reportFailure('account-answer')
        respond(failure(error))
      }
    )
    return true
  }
}

export function startAccount(parts: Parts): void {
  parts.storage.local
    .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(() => parts.reportFailure('account-storage'))
  const api = accountApi(apiOrigin, parts.send)
  const store = accountStore(parts.storage)
  const service = accountService({
    api,
    store,
    tokens: accessTokens(api, store),
    signIns: signIns(api, parts.identity, {
      apiOrigin,
      googleClientId,
      appleServicesId,
      extensionId: parts.extensionId
    })
  })
  parts.onMessage.addListener(
    answerAccount(service, parts.reportFailure, `chrome-extension://${parts.extensionId}`)
  )
  parts.onMessageExternal.addListener(answerWebsite(service, signInWebsites, parts.reportFailure))
  parts.onStartup.addListener(() => void service.readSubscription().catch(() => undefined))
}
