import type { AccessTokens } from './access-tokens'
import type { AccountSession } from './answers'
import type { AppleCode } from './apple'
import type { AccountApi, Failure } from './client'
import { confirmingFrom, forgetConfirming } from './confirming'
import { isSignedOut, needsFreshSignIn } from './messages'

type Earlier = Pick<AccountSession, 'userId' | 'token'>

const isEarlierSessionOf = (earlier: Earlier, current: AccountSession) =>
  earlier.userId === current.userId && earlier.token !== current.token

export async function signOutOfThisBrowser(api: AccountApi): Promise<Failure | null> {
  const signedOut = await api.signOut()
  return signedOut.ok || isSignedOut(signedOut.failure) ? null : signedOut.failure
}

export async function afterSigningInAgain(
  api: AccountApi,
  tokens: AccessTokens,
  previous: AccountSession
): Promise<AccountSession | null> {
  tokens.forget()
  const session = await api.session()
  if (!session.ok || session.value === null) return null
  if (isEarlierSessionOf(previous, session.value)) await api.revokeSession(previous.token)
  return session.value
}

export async function signedInAs(
  api: AccountApi,
  userId: string
): Promise<
  { kind: 'this-account' } | { kind: 'elsewhere' } | { kind: 'failed'; failure: Failure }
> {
  const session = await api.session()
  if (!session.ok) return { kind: 'failed', failure: session.failure }
  return session.value?.userId === userId ? { kind: 'this-account' } : { kind: 'elsewhere' }
}

export function afterGoogleConfirmation(
  api: AccountApi,
  session: AccountSession
): 'none' | 'this-account' | 'another-account' {
  const earlier = confirmingFrom()
  forgetConfirming()
  if (earlier === null) return 'none'
  if (earlier.userId !== session.userId) return 'another-account'
  if (!isEarlierSessionOf(earlier, session)) return 'none'
  void api.revokeSession(earlier.token)
  return 'this-account'
}

type Deletion =
  | { kind: 'deleted' }
  | { kind: 'signed-out' }
  | { kind: 'confirm-first'; failure: Failure }
  | { kind: 'refused'; failure: Failure; byApple: boolean }

export async function deleteTheAccount(
  api: AccountApi,
  tokens: AccessTokens,
  apple: AppleCode | null
): Promise<Deletion> {
  const deleted = await tokens.use(token =>
    api.deleteAccount(
      token,
      apple ? { appleAuthorizationCode: apple.code, appleRedirectUri: apple.returnUrl } : null
    )
  )
  if (deleted.ok) {
    tokens.forget()
    await api.signOut()
    return { kind: 'deleted' }
  }
  const { failure } = deleted
  if (isSignedOut(failure)) return { kind: 'signed-out' }
  if (needsFreshSignIn(failure)) return { kind: 'confirm-first', failure }
  const byApple = failure.kind === 'refused' && failure.code.startsWith('apple_')
  return { kind: 'refused', failure, byApple }
}
