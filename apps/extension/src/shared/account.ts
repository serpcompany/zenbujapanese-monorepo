import { websiteOrigin } from './hosts'
import { type Failure, failure, fields } from './messages'

type CloudAccess = 'subscribed' | 'free' | 'subscription_required'

type ManagedIn = 'app_store' | 'website'

export type RunningSubscription = {
  managedIn: ManagedIn
  status: string
  expiresAt: string | null
  willRenew: boolean | null
}

export type KeptSubscription = {
  status: string
  active: boolean
  managedIn: ManagedIn | null
  expiresAt: string | null
  willRenew: boolean | null
  running: RunningSubscription[]
  canSubscribe: boolean
  cloudAccess: CloudAccess
}

export type Account =
  | { signedIn: false }
  | { signedIn: true; email: string; subscription: KeptSubscription | null }

export type SignInWay =
  | { way: 'code'; email: string; code: string }
  | { way: 'google' }
  | { way: 'apple' }

export type AccountRequest =
  | { account: 'read' }
  | { account: 'opened' }
  | { account: 'send-code'; email: string }
  | { account: 'sign-in'; with: SignInWay }
  | { account: 'sign-out' }
  | { account: 'delete'; with: SignInWay }
  | { account: 'delete-with-apple' }
  | { account: 'went-to-subscribe' }

export type Refusal =
  | 'wrong-code'
  | 'new-code'
  | 'other-way'
  | 'no-email'
  | 'wait'
  | 'cancelled'
  | 'other-account'
  | 'apple-again'
  | 'sign-in-again'
  | 'cannot'
  | 'try-again'

export type Refused = { type: 'refused'; refusal: Refusal; retryAfter: number | null }

export type AccountAnswer =
  | { type: 'account'; account: Account }
  | { type: 'code-sent' }
  | { type: 'deleted'; appStoreSubscriptionContinues: boolean }
  | { type: 'apple-needed' }
  | Refused
  | Failure

export type AccountEnvelope = { target: 'service-worker'; account: AccountRequest }

export const accountKey = 'account'

export const accountPage = `${websiteOrigin}/account/`

export const refused = (refusal: Refusal, retryAfter: number | null = null): Refused => ({
  type: 'refused',
  refusal,
  retryAfter
})

export function isAccountEnvelope(message: unknown): message is AccountEnvelope {
  const envelope = fields(message)
  return (
    envelope?.target === 'service-worker' && typeof fields(envelope.account)?.account === 'string'
  )
}

type Sender = { sendMessage(message: AccountEnvelope): Promise<unknown> }

export function askAccount(request: AccountRequest, sender?: Sender): Promise<AccountAnswer> {
  return Promise.resolve()
    .then(() =>
      (sender ?? chrome.runtime).sendMessage({ target: 'service-worker', account: request })
    )
    .then(answer =>
      typeof fields(answer)?.type === 'string'
        ? (answer as AccountAnswer)
        : failure(new Error('The service worker answered without the account.'))
    )
    .catch((error: unknown) => failure(error))
}

type Changes = Record<string, unknown>

type ChangeEvents = {
  addListener(listener: (changes: Changes) => void): void
  removeListener(listener: (changes: Changes) => void): void
}

const keptAccountChanges = (): ChangeEvents | null =>
  typeof chrome === 'undefined' ? null : chrome.storage.local.onChanged

export function onAccountChanged(
  listener: () => void,
  events: ChangeEvents | null = keptAccountChanges()
): () => void {
  if (events === null) return () => undefined
  const heard = (changes: Changes) => {
    if (accountKey in changes) listener()
  }
  events.addListener(heard)
  return () => events.removeListener(heard)
}
