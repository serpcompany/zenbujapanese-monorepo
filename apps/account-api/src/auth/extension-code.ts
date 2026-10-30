import { createHash, randomBytes } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { parseUserOutput } from 'better-auth/db'
import { z } from 'zod'
import { webClient } from '../domain/clients'
import { sessionClient, signInClient } from './clients'
import { type TakeVerification, unexpired } from './nonce'
import { route } from './routes'

const codeMinutes = 5
const handedTo = 'zenbu-extension'

const identifierOf = (code: string) =>
  `extension-code:${createHash('sha256').update(code).digest('hex')}`

const HandedSchema = z.object({
  userId: z.string(),
  clientId: z.string(),
  signedInAt: z.iso.datetime()
})

function handedOver(value: string) {
  try {
    return HandedSchema.safeParse(JSON.parse(value)).data ?? null
  } catch {
    return null
  }
}

const invalidCode = () =>
  new APIError('UNAUTHORIZED', {
    code: 'INVALID_CODE',
    message: 'That code is unknown or was used. Ask the website for a new one.'
  })

export const extensionCode = (trustedOrigins: readonly string[], take: TakeVerification) =>
  ({
    id: 'zenbu-extension-code',
    endpoints: {
      createExtensionCode: createAuthEndpoint(
        route.extensionCode,
        { method: 'POST', use: [sessionMiddleware] },
        async context => {
          const { session } = context.context.session
          if (sessionClient(session)?.id !== webClient?.id) {
            throw new APIError('FORBIDDEN', {
              code: 'WEBSITE_ONLY',
              message: 'Only a session on the website hands the extension a code.'
            })
          }
          const code = randomBytes(32).toString('base64url')
          await context.context.internalAdapter.createVerificationValue({
            identifier: identifierOf(code),
            value: JSON.stringify({
              userId: session.userId,
              clientId: handedTo,
              signedInAt: new Date(session.createdAt).toISOString()
            }),
            expiresAt: new Date(Date.now() + codeMinutes * 60 * 1000)
          })
          return context.json({ code, expiresIn: codeMinutes * 60 })
        }
      ),
      signInWithExtensionCode: createAuthEndpoint(
        route.signInWithExtensionCode,
        { method: 'POST', body: z.object({ code: z.string().min(1).max(200) }) },
        async context => {
          const taken = await take(identifierOf(context.body.code))
          if (taken && !unexpired(taken)) {
            throw new APIError('UNAUTHORIZED', {
              code: 'CODE_EXPIRED',
              message: `That code is over ${codeMinutes} minutes old. Ask the website for a new one.`
            })
          }
          const handed = taken && handedOver(taken.value)
          if (!handed) throw invalidCode()
          const client = signInClient(context.headers, context.path, trustedOrigins)
          if (client?.id !== handed.clientId) {
            throw new APIError('FORBIDDEN', {
              code: 'CLIENT_MISMATCH',
              message: 'That code signs in only the browser extension.'
            })
          }
          const adapter = context.context.internalAdapter
          const user = await adapter.findUserById(handed.userId)
          if (!user) throw invalidCode()
          const session = await adapter.createSession(
            user.id,
            false,
            { createdAt: new Date(handed.signedInAt) },
            true
          )
          await setSessionCookie(context, { session, user })
          return context.json({
            token: session.token,
            user: parseUserOutput(context.context.options, user)
          })
        }
      )
    }
  }) satisfies BetterAuthPlugin
