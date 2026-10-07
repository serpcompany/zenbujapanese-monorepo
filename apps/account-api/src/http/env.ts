import type { Scope } from '../domain/clients'

export type AccountEnv = {
  Variables: { userId: string; clientId: string; scopes: ReadonlySet<Scope> }
}
