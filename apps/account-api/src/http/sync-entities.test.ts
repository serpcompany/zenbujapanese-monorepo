import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { EntityType } from '../domain/store'
import { syncedEntities } from '../domain/sync'
import { useAccountService } from '../test/accounts'
import { syncEntitiesExtension, syncEntityRules } from './sync-entities'

const accounts = useAccountService()

type Example = Record<string, unknown> & { operation: string; baseVersion?: number }

const operations = Object.values(syncEntitiesExtension).flatMap(entity =>
  Object.values(entity.operations)
)
const deletesLast = (examples: Example[]) => [
  ...examples.filter(example => example.operation !== 'delete'),
  ...examples.filter(example => example.operation === 'delete')
]

async function sendAs(email: string, examples: Example[]) {
  const learner = await accounts.learner(email)
  const answer = await accounts.sync(learner.token, {
    mutations: examples.map(example => ({ ...example, id: randomUUID() }))
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return (answer.body as unknown as { results: { status: string; error?: { code: string } }[] })
    .results
}

describe("sync's documented entities", () => {
  test('are every entity the service syncs, with exactly its operations', () => {
    expect(Object.keys(syncEntityRules).sort()).toEqual(Object.keys(syncedEntities).sort())
    for (const [entity, rule] of Object.entries(syncEntityRules)) {
      const syncs = syncedEntities[entity as EntityType].operations
      expect(Object.keys(rule.operations).sort(), entity).toEqual(Object.keys(syncs).sort())
    }
  })

  test('apply each example as written, sending baseVersion only where it is read', async () => {
    const examples = deletesLast(operations.map(operation => operation.example as Example))
    const results = await sendAs('sync-examples@example.com', examples)
    expect(results.map(result => result.error?.code ?? result.status)).toEqual(
      examples.map(() => 'applied')
    )
    for (const operation of operations) {
      expect(operation.example.baseVersion !== undefined, operation.example.operation).toBe(
        operation.baseVersion
      )
    }
  })

  test('refuse an operation that reads baseVersion without it', async () => {
    const examples = operations
      .filter(operation => operation.baseVersion)
      .map(({ example: { baseVersion: _, ...rest } }) => rest as Example)
    const results = await sendAs('sync-no-base@example.com', examples)
    expect(results.map(result => result.error?.code)).toEqual(
      examples.map(() => 'invalid_mutation')
    )
  })
})
