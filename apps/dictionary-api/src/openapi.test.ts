import type { z } from '@hono/zod-openapi'
import type { LanguageDataVersion } from '@zenbu/dictionary-core/artifact/word-cards'
import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import type { WordCardSource } from '@zenbu/dictionary-core/cards/sources'
import { type ApiDocument, apiReference } from '@zenbu/node-service/api-reference'
import { beforeAll, describe, expect, expectTypeOf, test, vi } from 'vitest'
import { createApp } from './app'
import type { AppAccess } from './app-routes'
import { type TestAccountKeys, testAccountKeys } from './conformance/account-keys'
import {
  appRoutesDocument,
  type LanguageDataSchema,
  type SegmentedTokenSchema,
  type WordCardSchema,
  type WordCardSourceSchema
} from './conformance/app-contract'
import { fakeService } from './conformance/fake-service'

const document = appRoutesDocument()

type Declared = {
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>
}
type Schema = { properties?: Record<string, Schema>; enum?: string[] }

let keys: TestAccountKeys

beforeAll(async () => {
  keys = await testAccountKeys()
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

function app(options: { access?: AppAccess | null; ready?: boolean; failing?: boolean } = {}) {
  return createApp({
    service: fakeService({
      wordCards: async () => {
        if (options.failing) throw new Error('the worker exited')
        return []
      }
    }),
    token: 'service-token-0123456789',
    ready: () => options.ready ?? true,
    access: options.access === undefined ? keys.access() : options.access
  })
}

const declaredCodes = (path: string, status: number) =>
  (document.paths?.[path] as { get: Declared }).get.responses[status]?.content?.['application/json']
    ?.schema.properties?.error?.properties?.code?.enum ?? []

async function answered(response: Response) {
  const body = (await response.json()) as { error: { code: string } }
  return body.error.code
}

describe("the app routes' OpenAPI contract", () => {
  test('is apps/dictionary-api/openapi.json', async () => {
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../openapi.json')
  })

  test('is docs/api/dictionary-api.md, written from the contract for people', async () => {
    const reference = apiReference(document as ApiDocument, {
      document: 'apps/dictionary-api/openapi.json',
      regenerate: 'apps/dictionary-api',
      contract: 'apps/dictionary-api/src/conformance/app-contract.ts',
      guide: { title: 'client guide', path: '../agents/account-clients.md#word-cards' }
    })
    await expect(reference).toMatchFileSnapshot('../../../docs/api/dictionary-api.md')
  })

  test("describes the core's own types, field for field", () => {
    expectTypeOf<z.infer<typeof WordCardSchema>>().toEqualTypeOf<WordCard>()
    expectTypeOf<z.infer<typeof SegmentedTokenSchema>>().toEqualTypeOf<SegmentedToken>()
    expectTypeOf<z.infer<typeof WordCardSourceSchema>>().toEqualTypeOf<WordCardSource>()
    expectTypeOf<z.infer<typeof LanguageDataSchema>>().toEqualTypeOf<LanguageDataVersion>()
  })

  test('documents exactly the app routes the service answers, with their methods', () => {
    const answered = app()
      .routes.filter(route => route.method !== 'ALL' && route.path.startsWith('/v1/apps/'))
      .map(route => `${route.method} ${route.path}`)
    const documented = Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
      Object.keys(item ?? {}).map(method => `${method.toUpperCase()} ${path}`)
    )
    expect(documented.sort()).toEqual([...new Set(answered)].sort())
  })

  const cards = '/v1/apps/word-cards?ids=x'
  test.each<{
    name: string
    code: string
    path: string
    token?: Record<string, unknown> | null
    options?: () => Parameters<typeof app>[0]
  }>([
    { name: 'no token', code: 'unauthorized', path: cards, token: null },
    {
      name: 'a token without the scope',
      code: 'insufficient_scope',
      path: cards,
      token: { scope: 'lists:read' }
    },
    { name: 'a malformed ID', code: 'bad_request', path: cards },
    {
      name: 'a blank text to segment',
      code: 'bad_request',
      path: '/v1/apps/segmentation?text=%20'
    },
    {
      name: 'an account over its limit',
      code: 'rate_limited',
      path: cards,
      options: () => ({ access: keys.access({ limit: 0 }) })
    },
    {
      name: 'no account settings',
      code: 'unavailable',
      path: cards,
      options: () => ({ access: null })
    },
    {
      name: 'a dictionary still loading',
      code: 'starting',
      path: cards,
      options: () => ({ ready: false })
    },
    {
      name: 'a failing dictionary',
      code: 'internal',
      path: `/v1/apps/word-cards?ids=${'a'.repeat(32)}`,
      options: () => ({ failing: true })
    }
  ])('declares the code it answers $name with', async ({ code, path, token = {}, options }) => {
    const headers: Record<string, string> =
      token === null ? {} : { authorization: `Bearer ${await keys.accessToken(token)}` }
    const response = await app(options?.()).request(path, { headers })
    expect(await answered(response)).toBe(code)
    expect(declaredCodes(new URL(path, 'http://localhost').pathname, response.status)).toContain(
      code
    )
  })
})
