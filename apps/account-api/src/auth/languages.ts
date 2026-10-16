import type { BetterAuthPlugin } from 'better-auth'
import { addOAuthServerContext, createAuthMiddleware, getOAuthState } from 'better-auth/api'
import { emailLanguage, type Language, languageHeader, languageOf } from '../domain/language'
import { route } from './routes'

interface Sent {
  headers?: Headers
  request?: Request
}

const providerRoutes: ReadonlySet<string> = new Set([route.signInWithProvider, route.linkProvider])

const fromHeader = (sent: Sent | null | undefined) =>
  languageOf(sent?.request?.headers.get(languageHeader) ?? sent?.headers?.get(languageHeader))

async function throughProvider(): Promise<Language | null> {
  const state = await getOAuthState().catch(() => null)
  return languageOf(state?.serverContext?.language)
}

export async function requestedLanguage(sent: Sent | null | undefined): Promise<Language | null> {
  return fromHeader(sent) ?? (await throughProvider())
}

export const storedLanguage = (user: object | null | undefined): unknown =>
  user && 'language' in user ? user.language : null

export async function languageFor(
  sent: Sent | null | undefined,
  stored: () => Promise<unknown>
): Promise<Language> {
  return (await requestedLanguage(sent)) ?? emailLanguage(null, await stored().catch(() => null))
}

export const keepLanguageThroughProviders = () =>
  ({
    id: 'zenbu-email-language',
    hooks: {
      before: [
        {
          matcher: context => providerRoutes.has(context.path ?? ''),
          handler: createAuthMiddleware(async context => {
            const language = fromHeader(context)
            if (language) await addOAuthServerContext({ language })
          })
        }
      ]
    }
  }) satisfies BetterAuthPlugin
