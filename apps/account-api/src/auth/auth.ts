import { log } from '@zenbu/node-service/log'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, emailOTP, jwt } from 'better-auth/plugins'
import type { AuthConfig } from '../config'
import type { Drizzle } from '../db/database'
import { authSchema } from '../db/schema'
import type { Mailer } from '../email/mailer'
import { codeMinutes, signInCodeMessage } from '../email/sign-in-code'

export interface AuthOptions {
  config: AuthConfig
  db: Drizzle
  mailer: Mailer
}

const day = 60 * 60 * 24
const authPath = '/v1/auth'
const accessTokenLifetime = '15m'
const emailProvider = 'email'
const emailCodeSignIn = '/sign-in/email-otp'

function socialProviders(config: AuthConfig) {
  return {
    ...(config.apple && {
      apple: {
        clientId: config.apple.clientIds,
        clientSecret: config.apple.clientSecret,
        appBundleIdentifier: config.apple.appBundleIdentifier,
        audience: [
          ...config.apple.clientIds,
          ...(config.apple.appBundleIdentifier ? [config.apple.appBundleIdentifier] : [])
        ]
      }
    }),
    ...(config.google && {
      google: { clientId: config.google.clientIds, clientSecret: config.google.clientSecret }
    })
  }
}

export function createAuth({ config, db, mailer }: AuthOptions) {
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
    socialProviders: socialProviders(config),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: codeMinutes * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }) {
          void mailer.send(signInCodeMessage(email, otp))
        }
      }),
      jwt({ jwt: { expirationTime: accessTokenLifetime, definePayload: () => ({}) } }),
      bearer()
    ],
    databaseHooks: {
      session: {
        create: {
          async after(session, context) {
            if (context?.path !== emailCodeSignIn) return
            const adapter = context.context.internalAdapter
            const identities = await adapter.findAccounts(session.userId)
            if (identities.some(identity => identity.providerId === emailProvider)) return
            const user = await adapter.findUserById(session.userId)
            if (!user) return
            await adapter.linkAccount({
              userId: user.id,
              providerId: emailProvider,
              accountId: user.email
            })
          }
        }
      }
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/email-otp/send-verification-otp': { window: 10 * 60, max: 5 },
        '/sign-in/email-otp': { window: 10 * 60, max: 10 },
        '/sign-in/social': { window: 60, max: 20 }
      }
    },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: config.publicUrl.startsWith('https://'),
      ...(config.cookieDomain && {
        crossSubDomainCookies: { enabled: true, domain: config.cookieDomain }
      }),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }
    },
    logger: {
      level: 'warn',
      log: (level, message) => log(level === 'error' ? 'error' : 'warn', `auth: ${message}`)
    }
  })
}
