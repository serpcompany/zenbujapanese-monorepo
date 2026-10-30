import {
  type AccountAnswer,
  type AccountRequest,
  type KeptSubscription,
  refused,
  type SignInWay
} from '../../shared/account'
import { fields } from '../../shared/messages'
import type { Answered, Api } from './api'
import type { SignInResult, SignIns } from './sign-in'
import { refusedFor } from './sign-in'
import { type AccountStore, accountOf } from './store'
import type { AccessTokens } from './tokens'

type Parts = { api: Api; store: AccountStore; tokens: AccessTokens; signIns: SignIns }

export type WebsiteReply =
  | { signedIn: true }
  | { signedIn: false; refusal: 'signed-in-already' | 'wait' | 'try-again' }

const subscriptionOf = (value: Record<string, unknown>): KeptSubscription => ({
  status: String(value.status),
  active: value.active === true,
  managedIn: (value.managedIn as KeptSubscription['managedIn']) ?? null,
  expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
  willRenew: typeof value.willRenew === 'boolean' ? value.willRenew : null,
  running: (Array.isArray(value.running) ? value.running : []).flatMap(each => {
    const running = fields(each)
    return running
      ? [
          {
            managedIn: running.managedIn as KeptSubscription['running'][number]['managedIn'],
            status: String(running.status),
            expiresAt: typeof running.expiresAt === 'string' ? running.expiresAt : null,
            willRenew: typeof running.willRenew === 'boolean' ? running.willRenew : null
          }
        ]
      : []
  }),
  canSubscribe: value.canSubscribe === true,
  cloudAccess: value.cloudAccess as KeptSubscription['cloudAccess']
})

export function accountService({ api, store, tokens, signIns }: Parts) {
  const read = async (): Promise<AccountAnswer> => ({
    type: 'account',
    account: accountOf(await store.keptAccount())
  })

  async function readSubscription(): Promise<boolean> {
    const sessionToken = await store.sessionToken()
    if (sessionToken === null || (await store.keptAccount()) === null) return false
    const answer = await tokens.withAccess(sessionToken, {
      method: 'GET',
      path: '/v1/me/subscription'
    })
    if (!answer.ok) return false
    await store.keepSubscription(sessionToken, subscriptionOf(answer.value))
    return true
  }

  async function endSession(sessionToken: string): Promise<Answered> {
    return api({ method: 'POST', path: '/v1/auth/sign-out', bearer: sessionToken, body: {} })
  }

  async function keep(signedIn: SignInResult): Promise<AccountAnswer> {
    if (!signedIn.ok) return signedIn.refused
    await store.keepSignIn(signedIn.sessionToken, signedIn.user)
    await readSubscription()
    return read()
  }

  const signIn = async (way: SignInWay) => keep(await signIns.signIn(way))

  async function signInFromWebsite(code: string, readFailed: () => void): Promise<WebsiteReply> {
    if ((await store.sessionToken()) !== null) {
      return { signedIn: false, refusal: 'signed-in-already' }
    }
    const signedIn = await signIns.withWebsiteCode(code)
    if (!signedIn.ok) {
      return {
        signedIn: false,
        refusal: signedIn.refused.refusal === 'wait' ? 'wait' : 'try-again'
      }
    }
    await store.keepSignIn(signedIn.sessionToken, signedIn.user)
    await readSubscription().catch(readFailed)
    return { signedIn: true }
  }

  async function signOut(): Promise<AccountAnswer> {
    const sessionToken = await store.sessionToken()
    if (sessionToken === null) {
      await store.forgetSession(null)
      return read()
    }
    await endSession(sessionToken)
    await store.forgetSession(sessionToken)
    return read()
  }

  async function deleteNow(
    sessionToken: string,
    appleAuthorizationCode: string | null
  ): Promise<AccountAnswer> {
    const answer = await tokens.withAccess(sessionToken, {
      method: 'DELETE',
      path: '/v1/me',
      body: { confirm: true, ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}) }
    })
    if (answer.ok) {
      await store.forgetSession(sessionToken)
      return {
        type: 'deleted',
        appStoreSubscriptionContinues: answer.value.appStoreSubscriptionContinues === true
      }
    }
    if (answer.code === 'apple_authorization_needed') return { type: 'apple-needed' }
    return refusedFor(answer)
  }

  async function keptSessionEnded(): Promise<boolean> {
    const sessionToken = await store.sessionToken()
    if (sessionToken === null || (await store.keptAccount()) === null) return true
    const checked = await tokens.newAccessToken(sessionToken)
    return typeof checked !== 'string' && !checked.ok && checked.status === 401
  }

  async function deleteAfterSignIn(way: SignInWay): Promise<AccountAnswer> {
    if (await keptSessionEnded()) return read()
    const kept = await store.keptAccount()
    const earlier = await store.sessionToken()
    if (kept === null || earlier === null) return read()
    const fresh = await signIns.signIn(way)
    if (!fresh.ok) return fresh.refused
    const refusal =
      way.way === 'apple' && fresh.appleCode === null
        ? refused('apple-again')
        : fresh.user.id !== kept.user.id
          ? refused('other-account')
          : null
    if (refusal !== null || !(await store.keepSignIn(fresh.sessionToken, fresh.user, earlier))) {
      await endSession(fresh.sessionToken)
      return refusal ?? read()
    }
    await endSession(earlier)
    return deleteNow(fresh.sessionToken, fresh.appleCode)
  }

  async function opened(): Promise<AccountAnswer> {
    const kept = await store.keptAccount()
    const sessionToken = await store.sessionToken()
    if (kept === null || sessionToken === null) return read()
    if (kept.wentToSubscribe) {
      if (await readSubscription()) await store.keepWentToSubscribe(sessionToken, false)
    } else {
      await tokens.checkSession(sessionToken)
    }
    return read()
  }

  async function answer(request: AccountRequest): Promise<AccountAnswer> {
    switch (request.account) {
      case 'read':
        return read()
      case 'opened':
        return opened()
      case 'send-code': {
        if (request.deleting === true && (await keptSessionEnded())) return read()
        const refusal = await signIns.sendCode(request.email)
        return refusal ?? { type: 'code-sent' }
      }
      case 'sign-in':
        return signIn(request.with)
      case 'sign-out':
        return signOut()
      case 'delete':
        return deleteAfterSignIn(request.with)
      case 'went-to-subscribe': {
        const sessionToken = await store.sessionToken()
        if (sessionToken !== null) await store.keepWentToSubscribe(sessionToken, true)
        return read()
      }
    }
  }

  return { answer, readSubscription, signInFromWebsite }
}

export type AccountService = ReturnType<typeof accountService>
