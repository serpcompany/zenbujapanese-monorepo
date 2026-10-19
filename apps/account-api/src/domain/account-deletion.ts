import { emailLanguage, type Language } from '../language'
import type { Principal } from './clients'
import type { AccountStore } from './store'

const freshSignInMinutes = 10

export type AppleRevocation = 'revoked' | 'invalid' | 'other_apple_id' | 'unavailable'

export interface AppleAuthorization {
  code?: string
  redirectUri?: string
}

export interface AppleRevoker {
  configured: boolean
  revoke(
    authorization: { code: string; redirectUri?: string },
    clientId: string,
    appleUserIds: readonly string[],
    inUse: (appleUserId: string) => Promise<boolean>
  ): Promise<AppleRevocation>
}

export interface DeletionNotices {
  accountDeleted(email: string, language: Language): void
}

export interface SubscriptionEnder {
  canEndSubscriptions(userId: string, now: Date): Promise<boolean>
  endSubscriptions(
    userId: string,
    now: Date
  ): Promise<{ status: 'ended' | 'unavailable'; appStoreSubscriptionContinues: boolean }>
}

type Deletion =
  | 'deleted'
  | 'no_account'
  | 'sign_in_again'
  | 'apple_authorization_needed'
  | 'apple_authorization_invalid'
  | 'apple_account_mismatch'
  | 'apple_unavailable'
  | 'billing_unavailable'

export interface DeletionResult {
  status: Deletion
  appStoreSubscriptionContinues: boolean
}

const refused = (status: Deletion): DeletionResult => ({
  status,
  appStoreSubscriptionContinues: false
})

export function accountDeleter(
  store: AccountStore,
  apple: AppleRevoker,
  notices: DeletionNotices,
  subscriptions: SubscriptionEnder
) {
  return async (
    principal: Principal,
    authorization: AppleAuthorization = {},
    requestedLanguage: Language | null = null
  ): Promise<DeletionResult> => {
    if (Date.now() - principal.signedInAt.getTime() > freshSignInMinutes * 60 * 1000) {
      return refused('sign_in_again')
    }
    const profile = await store.profile(principal.userId)
    if (!profile) return refused('no_account')
    const appleUserIds = (await store.identities(principal.userId))
      .filter(identity => identity.provider === 'apple')
      .map(identity => identity.subject)
    const revokesApple = appleUserIds.length > 0 && apple.configured
    if (revokesApple && !authorization.code) return refused('apple_authorization_needed')
    if (!(await subscriptions.canEndSubscriptions(principal.userId, new Date()))) {
      return refused('billing_unavailable')
    }
    if (revokesApple && authorization.code) {
      const revoked = await apple.revoke(
        { code: authorization.code, redirectUri: authorization.redirectUri },
        principal.clientId,
        appleUserIds,
        subject => store.identityInUse('apple', subject)
      )
      if (revoked === 'invalid') return refused('apple_authorization_invalid')
      if (revoked === 'other_apple_id') return refused('apple_account_mismatch')
      if (revoked === 'unavailable') return refused('apple_unavailable')
    }
    const ended = await subscriptions.endSubscriptions(principal.userId, new Date())
    if (ended.status === 'unavailable') return refused('billing_unavailable')
    const language = emailLanguage(requestedLanguage, await store.language(principal.userId))
    await store.deleteAccount(principal.userId, profile.email)
    notices.accountDeleted(profile.email, language)
    return {
      status: 'deleted',
      appStoreSubscriptionContinues: ended.appStoreSubscriptionContinues
    }
  }
}

export type DeleteAccount = ReturnType<typeof accountDeleter>
