import type { Principal } from './clients'
import type { AccountStore } from './store'

const freshSignInMinutes = 10

export type AppleRevocation = 'revoked' | 'invalid' | 'unavailable'

export interface AppleRevoker {
  configured: boolean
  revoke(authorizationCode: string, clientId: string): Promise<AppleRevocation>
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
  | 'apple_unavailable'

export function accountDeleter(store: AccountStore, apple: AppleRevoker, notices: DeletionNotices) {
  return async (principal: Principal, appleAuthorizationCode?: string): Promise<Deletion> => {
    if (Date.now() - principal.signedInAt.getTime() > freshSignInMinutes * 60 * 1000) {
      return 'sign_in_again'
    }
    const profile = await store.profile(principal.userId)
    if (!profile) return 'no_account'
    const signsInWithApple = (await store.identityProviders(principal.userId)).includes('apple')
    if (signsInWithApple && apple.configured) {
      if (!appleAuthorizationCode) return 'apple_authorization_needed'
      const revoked = await apple.revoke(appleAuthorizationCode, principal.clientId)
      if (revoked === 'invalid') return 'apple_authorization_invalid'
      if (revoked === 'unavailable') return 'apple_unavailable'
    }
    await store.deleteAccount(principal.userId, profile.email)
    notices.accountDeleted(profile.email)
    return 'deleted'
  }
}

export type DeleteAccount = ReturnType<typeof accountDeleter>
