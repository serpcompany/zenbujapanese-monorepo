import { type Account, accountKey, type KeptSubscription } from '../../shared/account'
import { fields } from '../../shared/messages'

export type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string[]): Promise<void>
}

export type AccountStorage = { local: StorageArea; session: StorageArea }

export type User = { id: string; email: string }

export type KeptAccount = {
  user: User
  subscription: KeptSubscription | null
  wentToSubscribe: boolean
}

export type AccessToken = { token: string; expiresAt: number }

export const sessionTokenKey = 'account.sessionToken'

export const accessTokenKey = 'account.accessToken'

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function keptAccountOf(value: unknown): KeptAccount | null {
  const kept = fields(value)
  const user = fields(kept?.user)
  const id = textOf(user?.id)
  const email = textOf(user?.email)
  if (!kept || id === null || email === null) return null
  return {
    user: { id, email },
    subscription: (fields(kept.subscription) as KeptSubscription | undefined) ?? null,
    wentToSubscribe: kept.wentToSubscribe === true
  }
}

export const accountOf = (kept: KeptAccount | null): Account =>
  kept
    ? { signedIn: true, email: kept.user.email, subscription: kept.subscription }
    : { signedIn: false }

export function accountStore({ local, session }: AccountStorage) {
  const keptAccount = async () => keptAccountOf((await local.get([accountKey]))[accountKey])

  const update = async (change: Partial<KeptAccount>) => {
    const kept = await keptAccount()
    if (kept) await local.set({ [accountKey]: { ...kept, ...change } })
  }

  return {
    keptAccount,
    sessionToken: async () => textOf((await local.get([sessionTokenKey]))[sessionTokenKey]),
    accessToken: async (): Promise<AccessToken | null> => {
      const kept = fields((await session.get([accessTokenKey]))[accessTokenKey])
      const token = textOf(kept?.token)
      return token !== null && typeof kept?.expiresAt === 'number'
        ? { token, expiresAt: kept.expiresAt }
        : null
    },
    keepAccessToken: (token: AccessToken) => session.set({ [accessTokenKey]: token }),
    forgetAccessToken: () => session.remove([accessTokenKey]),
    keepSignIn: async (sessionToken: string, user: User) => {
      await session.remove([accessTokenKey])
      await local.set({
        [sessionTokenKey]: sessionToken,
        [accountKey]: { user, subscription: null, wentToSubscribe: false }
      })
    },
    keepSubscription: (subscription: KeptSubscription) => update({ subscription }),
    keepWentToSubscribe: (wentToSubscribe: boolean) => update({ wentToSubscribe }),
    forget: async () => {
      await session.remove([accessTokenKey])
      await local.remove([sessionTokenKey, accountKey])
    }
  }
}

export type AccountStore = ReturnType<typeof accountStore>
