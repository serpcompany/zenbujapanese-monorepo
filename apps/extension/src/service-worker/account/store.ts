import { type Account, accountKey, type KeptSubscription } from '../../shared/account'
import { fields } from '../../shared/messages'
import { accessTokenKey, sessionTokenKey } from './token-keys'

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

  const sessionToken = async () => textOf((await local.get([sessionTokenKey]))[sessionTokenKey])

  const isCurrent = async (asked: string) => (await sessionToken()) === asked

  const forgetAll = async () => {
    await local.remove([sessionTokenKey, accountKey])
    await session.remove([accessTokenKey])
  }

  return {
    keptAccount,
    sessionToken,
    isCurrent,
    accessToken: async (): Promise<AccessToken | null> => {
      const kept = fields((await session.get([accessTokenKey]))[accessTokenKey])
      const token = textOf(kept?.token)
      return token !== null && typeof kept?.expiresAt === 'number'
        ? { token, expiresAt: kept.expiresAt }
        : null
    },
    keepAccessToken: async (asked: string, token: AccessToken): Promise<boolean> => {
      if (!(await isCurrent(asked))) return false
      await session.set({ [accessTokenKey]: token })
      return true
    },
    forgetAccessToken: () => session.remove([accessTokenKey]),
    keepSignIn: async (newSession: string, user: User) => {
      const kept = await keptAccount()
      const subscription = kept?.user.id === user.id ? kept.subscription : null
      await local.set({
        [sessionTokenKey]: newSession,
        [accountKey]: { user, subscription, wentToSubscribe: false }
      })
      await session.remove([accessTokenKey])
    },
    keepSubscription: async (asked: string, subscription: KeptSubscription) => {
      const kept = await local.get([sessionTokenKey, accountKey])
      const account = keptAccountOf(kept[accountKey])
      if (account && kept[sessionTokenKey] === asked) {
        await local.set({ [accountKey]: { ...account, subscription } })
      }
    },
    keepWentToSubscribe: async (wentToSubscribe: boolean) => {
      const kept = await keptAccount()
      if (kept) await local.set({ [accountKey]: { ...kept, wentToSubscribe } })
    },
    forget: forgetAll,
    forgetSession: async (asked: string) => {
      if (await isCurrent(asked)) await forgetAll()
    }
  }
}

export type AccountStore = ReturnType<typeof accountStore>
