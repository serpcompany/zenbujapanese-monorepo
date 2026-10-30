import { type Account, accountKey, type KeptSubscription } from '../../shared/account'
import { fields } from '../../shared/messages'
import { sha256Hex } from '../../shared/sha256'
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

const markOf = (sessionToken: string) => sha256Hex(new TextEncoder().encode(sessionToken))

export function accountStore({ local, session }: AccountStorage) {
  let last: Promise<unknown> = Promise.resolve()

  const inTurn = <T>(write: () => Promise<T>): Promise<T> => {
    const turn = last.then(write)
    last = turn.catch(() => undefined)
    return turn
  }

  const keptAccount = async () => keptAccountOf((await local.get([accountKey]))[accountKey])

  const sessionToken = async () => textOf((await local.get([sessionTokenKey]))[sessionTokenKey])

  const isCurrent = async (asked: string | null) => (await sessionToken()) === asked

  const keptAccessFor = async (asked: string) => {
    const kept = fields((await session.get([accessTokenKey]))[accessTokenKey])
    return kept && kept.session === (await markOf(asked)) ? kept : null
  }

  const forgetAll = async () => {
    await local.remove([sessionTokenKey, accountKey])
    await session.remove([accessTokenKey])
  }

  const keepAccount = (asked: string, change: Partial<KeptAccount>) =>
    inTurn(async () => {
      const kept = await local.get([sessionTokenKey, accountKey])
      const account = keptAccountOf(kept[accountKey])
      if (account && kept[sessionTokenKey] === asked) {
        await local.set({ [accountKey]: { ...account, ...change } })
      }
    })

  return {
    keptAccount,
    sessionToken,
    isCurrent,
    accessToken: async (asked: string): Promise<AccessToken | null> => {
      const kept = await keptAccessFor(asked)
      const token = textOf(kept?.token)
      return token !== null && typeof kept?.expiresAt === 'number'
        ? { token, expiresAt: kept.expiresAt }
        : null
    },
    keepAccessToken: (asked: string, token: AccessToken): Promise<boolean> =>
      inTurn(async () => {
        if (!(await isCurrent(asked))) return false
        await session.set({ [accessTokenKey]: { ...token, session: await markOf(asked) } })
        return true
      }),
    forgetAccessToken: (asked: string) =>
      inTurn(async () => {
        if (await keptAccessFor(asked)) await session.remove([accessTokenKey])
      }),
    keepSignIn: (newSession: string, user: User, replacing?: string): Promise<boolean> =>
      inTurn(async () => {
        if (replacing !== undefined && !(await isCurrent(replacing))) return false
        const kept = await keptAccount()
        const subscription = kept?.user.id === user.id ? kept.subscription : null
        await local.set({
          [sessionTokenKey]: newSession,
          [accountKey]: { user, subscription, wentToSubscribe: false }
        })
        await session.remove([accessTokenKey])
        return true
      }),
    keepSubscription: (asked: string, subscription: KeptSubscription) =>
      keepAccount(asked, { subscription }),
    keepWentToSubscribe: (asked: string, wentToSubscribe: boolean) =>
      keepAccount(asked, { wentToSubscribe }),
    forgetSession: (asked: string | null) =>
      inTurn(async () => {
        if (await isCurrent(asked)) await forgetAll()
      })
  }
}

export type AccountStore = ReturnType<typeof accountStore>
