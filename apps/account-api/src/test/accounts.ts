import { cursorKey, cursors } from '../domain/cursor'
import { testSecret } from './service'
import { sessionToken, userIdOf, useSignInService } from './sign-in'

export interface Learner {
  userId: string
  session: string
  token: string
}

export function useAccountService() {
  const running = useSignInService()
  const call = (path: string, options: Parameters<typeof running.service.call>[1]) =>
    running.service.call(path, options)

  return {
    running,
    cursors: cursors(cursorKey(testSecret)),
    async learner(email: string): Promise<Learner> {
      const signedIn = await running.as.withCode(email)
      const session = sessionToken(signedIn)
      const issued = await call('/v1/auth/token', { token: session })
      return { userId: userIdOf(signedIn), session, token: String(issued.body?.token) }
    },
    me: (token: string) => call('/v1/me', { token }),
    changeMe: (token: string, body: Record<string, unknown>) =>
      call('/v1/me', { token, body, method: 'PATCH' }),
    sync: (token: string, body: Record<string, unknown> = {}) => call('/v1/sync', { token, body })
  }
}
