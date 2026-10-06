import type { BetterAuthOptions } from 'better-auth'
import { APIError } from 'better-auth/api'
import { isRejection, normalizeName } from '../domain/profile'
import type { Mailer } from '../email/mailer'
import { signInAddedMessage } from '../email/sign-in-added'

export const emailProvider = 'email'

const providerTokens = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  scope: null
}

const profileName = (raw: unknown) => {
  const name = normalizeName(raw)
  return isRejection(name) ? '' : name
}

export function identityHooks(mailer: Mailer) {
  return {
    user: {
      create: {
        async before(user) {
          if (!user.emailVerified) {
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_VERIFIED',
              message:
                "That Apple or Google account's email isn't verified, so it can't make an account."
            })
          }
          return { data: { ...user, name: profileName(user.name) } }
        }
      }
    },
    account: {
      create: {
        async before(account) {
          return { data: { ...account, ...providerTokens } }
        },
        async after(account, context) {
          const adapter = context?.context.internalAdapter
          if (!adapter) return
          const identities = await adapter.findAccounts(account.userId)
          if (identities.length < 2) return
          const user = await adapter.findUserById(account.userId)
          if (user) void mailer.send(signInAddedMessage(user.email, account.providerId))
        }
      },
      update: {
        async before(account) {
          return { data: { ...account, ...providerTokens } }
        }
      }
    }
  } satisfies BetterAuthOptions['databaseHooks']
}
