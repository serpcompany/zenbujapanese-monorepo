import { type AccountAnswer, isAccountEnvelope } from '../../shared/account'
import { apiOrigin, appleServicesId, googleClientId, signInWebsites } from '../../shared/hosts'
import { failure } from '../../shared/messages'
import type { SettingsStore } from '../../shared/settings'
import { answerCopy, tellKnown } from '../copy/copy-channel'
import { accountCopy } from '../copy/copy-service'
import type { CopyStorage } from '../copy/kept'
import type { CopyFailure } from '../copy/sync'
import { isSyncedSetting } from '../copy/synced-settings'
import {
  type AccountService,
  accountService,
  readSubscription,
  type WebsiteReply
} from './account-service'
import { accountApi, type Send } from './api'
import type { Identity } from './identity'
import { signIns } from './sign-in'
import { type AccountStorage, accountStore } from './store'
import { accessTokens } from './tokens'
import { answerWebsite } from './website-sign-in'

type Events = { addListener(listener: () => void): void }

type Sender = { origin?: string }

type CopyParts = {
  storage: CopyStorage
  settings: SettingsStore
  tabs: Parameters<typeof tellKnown>[0]
  pages: Parameters<typeof tellKnown>[1]
}

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
  onMessage: Messages<unknown>
  onMessageExternal: Messages<WebsiteReply>
  onStartup: Events
  send?: Send
  copy: CopyParts
  reportFailure(code: 'account-answer' | 'account-storage' | CopyFailure, status?: number): void
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
  const tokens = accessTokens(api, store)
  const copy = accountCopy({
    storage: parts.copy.storage,
    store,
    tokens,
    readSubscription: () => readSubscription(store, tokens),
    settings: parts.copy.settings,
    tell: tellKnown(parts.copy.tabs, parts.copy.pages),
    reportFailure: parts.reportFailure
  })
  const service = accountService({
    api,
    store,
    tokens,
    signIns: signIns(api, parts.identity, {
      apiOrigin,
      googleClientId,
      appleServicesId,
      extensionId: parts.extensionId
    }),
    copy
  })
  const pagesOrigin = `chrome-extension://${parts.extensionId}`
  parts.onMessage.addListener(answerAccount(service, parts.reportFailure, pagesOrigin))
  parts.onMessage.addListener(answerCopy(copy, parts.reportFailure, pagesOrigin))
  parts.copy.settings.onChanged.addListener(changes => {
    if (!Object.keys(changes).some(isSyncedSetting)) return
    void copy.settingsChanged().catch(() => parts.reportFailure('account-copy'))
  })
  parts.onStartup.addListener(() => {
    void readSubscription(store, tokens)
      .catch(() => undefined)
      .then(() => copy.chance('startup'))
  })
  parts.onMessageExternal.addListener(answerWebsite(service, signInWebsites, parts.reportFailure))
}
