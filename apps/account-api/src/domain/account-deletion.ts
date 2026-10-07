import type { Principal } from './clients'
import type { AccountStore } from './store'

const freshSignInMinutes = 10

export type AppleRevocation = 'revoked' | 'invalid' | 'other_apple_id' | 'unavailable'

export interface AppleRevoker {
  configured: boolean
  revoke(
    authorizationCode: string,
    clientId: string,
    appleUserIds: readonly string[]
  ): Promise<AppleRevocation>
}

export interface DeletionNotices {
  accountDeleted(email: string): void
}

export type Deletion =
  | 'deleted'
  | 'no_account'
  | 'sign_in_again'
  | 'apple_authorization_needed'
  | 'apple_authorization_invalid'
  | 'apple_account_mismatch'
  | 'apple_unavailable'

export function accountDeleter(store: AccountStore, apple: AppleRevoker, notices: DeletionNotices) {
  return async (principal: Principal, appleAuthorizationCode?: string): Promise<Deletion> => {
    if (Date.now() - principal.signedInAt.getTime() > freshSignInMinutes * 60 * 1000) {
      return 'sign_in_again'
    }
    const profile = await store.profile(principal.userId)
    if (!profile) return 'no_account'
    const appleUserIds = (await store.identities(principal.userId))
      .filter(identity => identity.provider === 'apple')
      .map(identity => identity.subject)
    if (appleUserIds.length > 0 && apple.configured) {
      if (!appleAuthorizationCode) return 'apple_authorization_needed'
      const revoked = await apple.revoke(appleAuthorizationCode, principal.clientId, appleUserIds)
      if (revoked === 'invalid') return 'apple_authorization_invalid'
      if (revoked === 'other_apple_id') return 'apple_account_mismatch'
      if (revoked === 'unavailable') return 'apple_unavailable'
    }
    await store.deleteAccount(principal.userId, profile.email)
    notices.accountDeleted(profile.email)
    return 'deleted'
  }
}

export type DeleteAccount = ReturnType<typeof accountDeleter>
