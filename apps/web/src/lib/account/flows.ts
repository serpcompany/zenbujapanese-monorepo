import type { AccessTokens } from './access-tokens'
import type { AccountSession } from './answers'
import type { AppleCode } from './apple'
import type { AccountApi, Failure } from './client'
import { isSignedOut, needsFreshSignIn } from './messages'

export async function afterSigningInAgain(
  api: AccountApi,
  tokens: AccessTokens,
  previous: AccountSession
): Promise<AccountSession | null> {
  tokens.forget()
  const session = await api.session()
  if (!session.ok || session.value === null) return null
  if (session.value.token !== previous.token && session.value.userId === previous.userId) {
    await api.revokeSession(previous.token)
  }
  return session.value
}

export type Deletion =
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
