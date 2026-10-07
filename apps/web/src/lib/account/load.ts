import type { AccessTokens } from './access-tokens'
import type { AccountSession, Identity, Profile, Provider } from './answers'
import type { AccountApi, Failure, Result } from './client'
import { isSignedOut } from './messages'

export interface SignedInAccount {
  session: AccountSession
  profile: Profile
  identities: Identity[]
}

export type LoadedAccount =
  | { kind: 'signed-in'; account: SignedInAccount }
  | { kind: 'signed-out' }
  | { kind: 'failed'; failure: Failure }

const freshForMs = 9 * 60_000

const notLoaded = (result: Result<unknown> & { ok: false }): LoadedAccount =>
  isSignedOut(result.failure) ? { kind: 'signed-out' } : { kind: 'failed', failure: result.failure }

export async function loadAccount(api: AccountApi, tokens: AccessTokens): Promise<LoadedAccount> {
  const session = await api.session()
  if (!session.ok) return notLoaded(session)
  if (session.value === null) return { kind: 'signed-out' }
  tokens.belongTo(session.value.userId)
  const [profile, identities] = await Promise.all([
    tokens.use(token => api.profile(token)),
    api.identities()
  ])
  if (!profile.ok) return notLoaded(profile)
  if (!identities.ok) return notLoaded(identities)
  return {
    kind: 'signed-in',
    account: { session: session.value, profile: profile.value, identities: identities.value }
  }
}

export const signsInWith = (account: SignedInAccount, provider: Provider) =>
  account.identities.some(identity => identity.provider === provider)

export const appleUsersOf = (account: SignedInAccount) =>
  account.identities
    .filter(identity => identity.provider === 'apple')
    .map(identity => identity.subject)

export const isFresh = (account: SignedInAccount, now = Date.now()) =>
  now - account.session.signedInAt < freshForMs
