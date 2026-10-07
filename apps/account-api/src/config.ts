import { fileURLToPath } from 'node:url'
import { readPort } from '@zenbu/node-service/config'

export interface AppleSigningKey {
  teamId: string
  keyId: string
  privateKey: string
}

interface AppleConfig {
  servicesIds: string[]
  appBundleIdentifier: string | undefined
  signingKey: AppleSigningKey | null
}

interface GoogleConfig {
  clientIds: string[]
  clientSecret: string
}

export type EmailProvider =
  | { kind: 'cloudflare'; accountId: string; token: string }
  | { kind: 'usesend'; apiKey: string }
  | { kind: 'dev-mailbox' }

export interface EmailConfig {
  from: string
  provider: EmailProvider | null
  allowedRecipients: string[] | null
}

export interface AuthConfig {
  publicUrl: string
  secret: string
  trustedOrigins: string[]
  cookieDomain: string | undefined
  cookiePrefix: string
  apple: AppleConfig | null
  google: GoogleConfig | null
}

export interface Config {
  port: number
  databaseUrl: string
  migrations: string
  release: string
  auth: AuthConfig
  email: EmailConfig
}

const supportAddress = 'support@zenbujapanese.com'
const defaultSender = `Zenbu Japanese <${supportAddress}>`
const everyone = 'everyone'
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function required(env: NodeJS.ProcessEnv, name: string, why: string): string {
  const value = env[name]?.trim() ?? ''
  if (value === '') throw new Error(`${name} must be set: ${why}`)
  return value
}

function readAppleKey(env: NodeJS.ProcessEnv): AppleSigningKey | null {
  const teamId = env.APPLE_TEAM_ID?.trim() ?? ''
  const keyId = env.APPLE_KEY_ID?.trim() ?? ''
  const privateKey = (env.APPLE_PRIVATE_KEY ?? '').replaceAll('\\n', '\n').trim()
  if (teamId === '' && keyId === '' && privateKey === '') return null
  if (teamId === '' || keyId === '' || !privateKey.includes('PRIVATE KEY')) {
    throw new Error(
      "APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY (the .p8 key) are set together, to make Apple's client secret"
    )
  }
  return { teamId, keyId, privateKey }
}

function readApple(env: NodeJS.ProcessEnv, local: boolean): AppleConfig | null {
  const servicesIds = list(env.APPLE_SERVICES_IDS)
  const appBundleIdentifier = env.APPLE_APP_BUNDLE_IDENTIFIER?.trim() || undefined
  const signingKey = readAppleKey(env)
  if (servicesIds.length === 0 && appBundleIdentifier === undefined) return null
  if (!local && signingKey === null) {
    throw new Error(
      'Signing in with Apple needs APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY: deleting an account revokes its Apple sign-in with the key, as App Review requires. Only a run at localhost may leave them out.'
    )
  }
  if (servicesIds.length > 0 && signingKey === null) {
    throw new Error(
      'APPLE_SERVICES_IDS needs APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY: signing in on the web makes a client secret from the key'
    )
  }
  return { servicesIds, appBundleIdentifier, signingKey }
}

function readGoogle(env: NodeJS.ProcessEnv): GoogleConfig | null {
  const clientIds = list(env.GOOGLE_CLIENT_IDS)
  if (clientIds.length === 0) return null
  return { clientIds, clientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? '' }
}

function readSender(env: NodeJS.ProcessEnv): string {
  const from = env.EMAIL_FROM?.trim() || defaultSender
  const address = /<([^>]+)>\s*$/.exec(from)?.[1] ?? from
  if (address.toLowerCase() !== supportAddress) {
    throw new Error(
      `EMAIL_FROM must send from ${supportAddress}, the one address the standard allows`
    )
  }
  return from
}

function readRecipients(env: NodeJS.ProcessEnv, provider: EmailProvider | null): string[] | null {
  const value = env.EMAIL_ALLOWED_RECIPIENTS?.trim() ?? ''
  if (value === everyone) return null
  if (value !== '') return list(value)
  if (provider === null || provider.kind === 'dev-mailbox') return null
  throw new Error(
    `EMAIL_ALLOWED_RECIPIENTS must name staging's test recipients, or be ${everyone} in production, before email is sent`
  )
}

function readEmailProvider(env: NodeJS.ProcessEnv): EmailProvider | null {
  const kind = env.ACCOUNT_API_EMAIL?.trim() ?? ''
  if (kind === '') return null
  if (kind === 'cloudflare') {
    return {
      kind,
      accountId: required(env, 'CLOUDFLARE_ACCOUNT_ID', 'Email Service sends from this account'),
      token: required(env, 'CLOUDFLARE_EMAIL_TOKEN', 'an API token that may only send email')
    }
  }
  if (kind === 'usesend') {
    return { kind, apiKey: required(env, 'USESEND_API_KEY', 'useSend sends the codes') }
  }
  if (kind === 'dev-mailbox') {
    if (env.NODE_ENV === 'production') {
      throw new Error('ACCOUNT_API_EMAIL=dev-mailbox is for local runs; the image never uses it')
    }
    return { kind }
  }
  throw new Error(`ACCOUNT_API_EMAIL is ${kind}; it can be cloudflare, usesend, or dev-mailbox`)
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL ?? ''
  if (!/^postgres(ql)?:\/\/./.test(databaseUrl)) {
    throw new Error(
      'DATABASE_URL must be set to the Postgres database the service owns (postgres://user:password@host/database)'
    )
  }
  const publicUrl = required(
    env,
    'ACCOUNT_API_URL',
    "the service's own URL, which signs its tokens"
  )
  if (!/^https?:\/\/[^/]+$/.test(publicUrl)) {
    throw new Error(`ACCOUNT_API_URL must be an origin with no path, such as https://example.com`)
  }
  const secret = required(env, 'ACCOUNT_API_SECRET', 'it signs sessions and encrypts keys')
  if (secret.length < 32) throw new Error('ACCOUNT_API_SECRET must be at least 32 characters')
  return {
    port: readPort(env.PORT, 8789),
    databaseUrl,
    migrations: migrationsFolder,
    release: env.ACCOUNT_API_RELEASE ?? 'local',
    auth: {
      publicUrl,
      secret,
      trustedOrigins: list(env.ACCOUNT_API_TRUSTED_ORIGINS),
      cookieDomain: env.ACCOUNT_API_COOKIE_DOMAIN?.trim() || undefined,
      cookiePrefix: env.ACCOUNT_API_COOKIE_PREFIX?.trim() || 'zenbu',
      apple: readApple(env, /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(publicUrl)),
      google: readGoogle(env)
    },
    email: readEmail(env)
  }
}

function readEmail(env: NodeJS.ProcessEnv): EmailConfig {
  const provider = readEmailProvider(env)
  return { from: readSender(env), provider, allowedRecipients: readRecipients(env, provider) }
}
