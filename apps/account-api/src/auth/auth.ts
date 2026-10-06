import { log } from '@zenbu/node-service/log'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, emailOTP, jwt } from 'better-auth/plugins'
import type { AuthConfig } from '../config'
import type { Drizzle } from '../db/database'
import { authSchema } from '../db/schema'
import type { Mailer } from '../email/mailer'
import { codeMinutes, signInCodeMessage } from '../email/sign-in-code'
import { failureFields } from '../failure'
import { appleClientSecret } from './apple'
import { signInGuards } from './guards'
import { identityHooks } from './identities'
import { signInNonce } from './nonce'
import { authPath, route } from './routes'

export interface AuthOptions {
  config: AuthConfig
  db: Drizzle
  mailer: Mailer
}

const day = 60 * 60 * 24

async function socialProviders(config: AuthConfig) {
  const apple = config.apple
  const google = config.google
  return {
    ...(apple && {
      apple: {
        clientId: apple.servicesIds,
        clientSecret:
          apple.signingKey && apple.servicesIds.length > 0
            ? await appleClientSecret(apple.signingKey, apple.servicesIds[0])
            : '',
        appBundleIdentifier: apple.appBundleIdentifier,
        audience: [
          ...apple.servicesIds,
          ...(apple.appBundleIdentifier ? [apple.appBundleIdentifier] : [])
        ]
      }
    }),
    ...(google && { google: { clientId: google.clientIds, clientSecret: google.clientSecret } })
  }
}

export async function createAuth({ config, db, mailer }: AuthOptions) {
  return betterAuth({
    appName: 'Zenbu Japanese',
    baseURL: config.publicUrl,
    basePath: authPath,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    session: { expiresIn: 60 * day, updateAge: day },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true }
    },
    socialProviders: await socialProviders(config),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: codeMinutes * 60,
        allowedAttempts: 5,
        storeOTP: 'encrypted',
        async sendVerificationOTP({ email, otp }) {
          void mailer.send(signInCodeMessage(email, otp))
        }
      }),
      jwt({ jwt: { expirationTime: '15m', definePayload: () => ({}) } }),
      bearer({ requireSignature: true }),
      signInNonce(),
      signInGuards(mailer)
    ],
    databaseHooks: identityHooks(mailer),
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        [route.sendCode]: { window: 10 * 60, max: 5 },
        [route.signInWithCode]: { window: 10 * 60, max: 10 },
        [route.signInWithProvider]: { window: 60, max: 20 },
        [route.nonce]: { window: 60, max: 30 }
      }
    },
    advanced: {
      cookiePrefix: config.cookiePrefix,
      useSecureCookies: config.publicUrl.startsWith('https://'),
      ...(config.cookieDomain && {
        crossSubDomainCookies: { enabled: true, domain: config.cookieDomain }
      }),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }
    },
    logger: {
      level: 'warn',
      log: (level, message, ...details) => {
        const error = details.find(detail => detail instanceof Error)
        log(
          level === 'error' ? 'error' : 'warn',
          `auth: ${message}`,
          error ? failureFields(error) : {}
        )
      }
    }
  })
}
