import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, vi } from 'vitest'
import { claims, type IdentityProvider, standInForProviders } from './identity-provider'
import { type Service, startService, websiteOrigin } from './service'

type Provider = 'apple' | 'google'
type Answer = Awaited<ReturnType<Service['call']>>

export const sessionToken = (answer: Answer) => answer.headers.get('set-auth-token') ?? ''
export const websiteCookie = 'zenbu-test.session_token'

export function setCookie(headers: Headers, name: string) {
  const line = headers.getSetCookie().find(each => each.startsWith(`${name}=`))
  if (!line) return null
  const [pair = '', ...attributes] = line.split(';').map(part => part.trim())
  return { value: pair.slice(name.length + 1), attributes: attributes.map(a => a.toLowerCase()) }
}

export const websiteSession = (answer: Answer) =>
  setCookie(answer.headers, websiteCookie)?.value ?? ''

export const fromTheWebsite = (session?: string) => ({
  client: null,
  headers: { origin: websiteOrigin, ...(session ? { cookie: `${websiteCookie}=${session}` } : {}) }
})
export const userIdOf = (answer: Answer) => String((answer.body?.user as { id?: string })?.id)
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function signIn(service: Service) {
  const lastMessageTo = async (email: string, before: number) => {
    await vi.waitFor(() => expect(service.mailbox.messages().length).toBeGreaterThan(before))
    const message = service.mailbox.messages().find(each => each.to === email)
    expect(message).toBeDefined()
    return message as { to: string; subject: string; text: string }
  }

  const emailCode = async (email: string) => {
    const before = service.mailbox.messages().length
    const sent = await service.call('/v1/auth/email-otp/send-verification-otp', {
      body: { email, type: 'sign-in' }
    })
    expect(sent).toMatchObject({ status: 200, body: { success: true } })
    const code = /code is (\d{6})/.exec((await lastMessageTo(email, before)).text)?.[1]
    expect(code).toBeDefined()
    return code as string
  }

  const withCode = async (
    email: string,
    {
      session,
      client,
      headers
    }: { session?: string; client?: string | null; headers?: Record<string, string> } = {}
  ) =>
    service.call('/v1/auth/sign-in/email-otp', {
      body: { email, otp: await emailCode(email) },
      token: session,
      client,
      headers
    })

  const nonce = async () => {
    const answer = await service.call('/v1/auth/sign-in/nonce', { body: {} })
    expect(answer.status).toBe(200)
    return String(answer.body?.nonce)
  }

  const idToken = (
    issuer: IdentityProvider,
    audience: string,
    subject: string,
    email: string,
    tokenNonce: string
  ) => issuer.sign(claims(issuer, audience, subject, { email, nonce: tokenNonce }))

  const withIdToken = (provider: Provider, token: string, presented?: string) =>
    service.call('/v1/auth/sign-in/social', {
      body: {
        provider,
        idToken: { token, ...(presented === undefined ? {} : { nonce: presented }) }
      }
    })

  const link = (session: string, provider: Provider, token: string, presented: string) =>
    service.call('/v1/auth/link-social', {
      token: session,
      body: { provider, idToken: { token, nonce: presented } }
    })

  const identitiesOf = (userId: string) =>
    service.rows(
      `select provider, subject from user_identities where user_id = '${userId}' order by provider, subject`
    )

  const users = async (email: string) =>
    (await service.rows(`select count(*)::int as n from users where email = '${email}'`))[0]?.n

  const ageSession = (session: string, minutes: number) =>
    service.rows(
      `update sessions set created_at = now() - interval '${minutes} minutes' where token = '${session.split('.')[0]}'`
    )

  return {
    emailCode,
    withCode,
    nonce,
    idToken,
    withIdToken,
    link,
    identitiesOf,
    users,
    ageSession,
    lastMessageTo
  }
}

export function useSignInService(
  options: { emailSender?: boolean; providers?: boolean; appleKey?: boolean } = {}
) {
  const running = {} as {
    service: Service
    as: ReturnType<typeof signIn>
    apple: IdentityProvider
    google: IdentityProvider
    appleRevoked: string[]
    appleExchanges: { clientId: string | null; redirectUri: string | null }[]
  }
  beforeAll(async () => {
    if (options.providers) Object.assign(running, await standInForProviders())
    running.service = await startService(options)
    running.as = signIn(running.service)
  })
  afterAll(async () => {
    await running.service.close()
    vi.restoreAllMocks()
  })
  return running
}
