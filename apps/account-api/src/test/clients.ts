import { afterAll, beforeAll } from 'vitest'
import { clients, type Scope } from '../domain/clients'

export function withoutScopes(clientId: string, ...taken: Scope[]) {
  const client = clients.find(each => each.id === clientId)
  if (!client) throw new Error(`No app is listed as ${clientId}`)
  const listed = client.scopes
  beforeAll(() => {
    client.scopes = listed.filter(scope => !taken.includes(scope))
  })
  afterAll(() => {
    client.scopes = listed
  })
}
