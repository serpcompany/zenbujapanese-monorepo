import { randomBytes } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint } from 'better-auth/api'
import { route } from './routes'

const nonceMinutes = 10
const nonceIdentifier = (nonce: string) => `sign-in-nonce:${nonce}`

interface VerificationStore {
  createVerificationValue(data: {
    identifier: string
    value: string
    expiresAt: Date
  }): Promise<unknown>
  findVerificationValue(identifier: string): Promise<{ expiresAt: Date } | null>
  deleteVerificationByIdentifier(identifier: string): Promise<void>
}

export async function consumeNonce(store: VerificationStore, nonce: string): Promise<boolean> {
  const identifier = nonceIdentifier(nonce)
  const found = await store.findVerificationValue(identifier)
  if (!found) return false
  await store.deleteVerificationByIdentifier(identifier)
  return new Date(found.expiresAt) > new Date()
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
