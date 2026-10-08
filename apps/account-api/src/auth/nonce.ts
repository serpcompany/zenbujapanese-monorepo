import { randomBytes } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint } from 'better-auth/api'
import { route } from './routes'

const nonceMinutes = 10
const nonceIdentifier = (nonce: string) => `sign-in-nonce:${nonce}`

export type TakeVerification = (identifier: string) => Promise<Date | null>

export async function consumeNonce(take: TakeVerification, nonce: string): Promise<boolean> {
  const expiresAt = await take(nonceIdentifier(nonce))
  return expiresAt !== null && new Date(expiresAt) > new Date()
}

export const signInNonce = () =>
  ({
    id: 'sign-in-nonce',
    endpoints: {
      createSignInNonce: createAuthEndpoint(route.nonce, { method: 'POST' }, async context => {
        const nonce = randomBytes(32).toString('base64url')
        await context.context.internalAdapter.createVerificationValue({
          identifier: nonceIdentifier(nonce),
          value: 'unused',
          expiresAt: new Date(Date.now() + nonceMinutes * 60 * 1000)
        })
        return context.json({ nonce, expiresIn: nonceMinutes * 60 })
      })
    }
  }) satisfies BetterAuthPlugin
