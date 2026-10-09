export const scopes = [
  'account',
  'account:delete',
  'profile',
  'lists:read',
  'lists:write',
  'known:read',
  'known:write',
  'known:mark',
  'watch:read',
  'watch:write',
  'translations:read',
  'translations:write',
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

const studyData: readonly Scope[] = [
  'account',
  'account:delete',
  'profile',
  'lists:read',
  'lists:write',
  'known:read',
  'known:write'
]

const appOnly: readonly Scope[] = [
  'watch:read',
  'watch:write',
  'translations:read',
  'translations:write'
]

export const clients: readonly Client[] = [
  {
    id: 'zenbu-ios',
    name: 'Zenbu Japanese for iOS',
    scopes: [...studyData, ...appOnly],
    appleBundleIds: ['com.zenbujapanese.dictionary'],
    signsInOnTheWeb: false,
    requestsPerMinute: 30_000
  },
  {
    id: 'zenbu-web',
    name: 'zenbujapanese.com',
    scopes: studyData,
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
