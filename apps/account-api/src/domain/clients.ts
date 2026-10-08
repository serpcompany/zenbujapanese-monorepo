export const scopes = [
  'account',
  'account:delete',
  'profile',
  'lists:read',
  'lists:write',
  'known:read',
  'known:write',
  'known:mark',
  'dictionary:read'
] as const

export type Scope = (typeof scopes)[number]

export interface Client {
  id: string
  name: string
  scopes: readonly Scope[]
  appleBundleIds: readonly string[]
  signsInOnTheWeb: boolean
  requestsPerMinute: number
}

const everythingZenbu: readonly Scope[] = [
  'account',
  'account:delete',
  'profile',
  'lists:read',
  'lists:write',
  'known:read',
  'known:write'
]

export const clients: readonly Client[] = [
  {
    id: 'zenbu-ios',
    name: 'Zenbu Japanese for iOS',
    scopes: everythingZenbu,
    appleBundleIds: ['com.zenbujapanese.app'],
    signsInOnTheWeb: false,
    requestsPerMinute: 30_000
  },
  {
    id: 'zenbu-web',
    name: 'zenbujapanese.com',
    scopes: everythingZenbu,
    appleBundleIds: [],
    signsInOnTheWeb: true,
    requestsPerMinute: 30_000
  },
  {
    id: 'tomodachi',
    name: 'Tomodachi',
    scopes: ['account:delete', 'lists:read', 'known:read', 'known:mark', 'dictionary:read'],
    appleBundleIds: ['com.zenbujapanese.tomodachi'],
    signsInOnTheWeb: false,
    requestsPerMinute: 30_000
  }
]

export const clientById = (id: string | null | undefined) =>
  clients.find(client => client.id === id) ?? null

export const webClient = clients.find(client => client.signsInOnTheWeb) ?? null

export interface Principal {
  userId: string
  clientId: string
  scopes: ReadonlySet<Scope>
  signedInAt: Date
}

export function principalOf(userId: string, claims: Record<string, unknown>): Principal | null {
  const client = clientById(typeof claims.azp === 'string' ? claims.azp : null)
  if (!client || typeof claims.scope !== 'string') return null
  const claimed = new Set(claims.scope.split(' '))
  return {
    userId,
    clientId: client.id,
    scopes: new Set(client.scopes.filter(scope => claimed.has(scope))),
    signedInAt: new Date(typeof claims.auth_time === 'number' ? claims.auth_time * 1000 : 0)
  }
}
