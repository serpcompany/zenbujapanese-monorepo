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

  test('documents exactly the app routes the service answers', () => {
    const answered = app()
      .routes.filter(route => route.method === 'GET' && route.path.startsWith('/v1/apps/'))
      .map(route => route.path)
    expect(Object.keys(document.paths ?? {}).sort()).toEqual([...new Set(answered)].sort())
  })

  test.each<[string, string, () => Promise<Response>]>([
    ['no token', 'unauthorized', async () => app().request('/v1/apps/word-cards?ids=x')],
    [
      'a token without the scope',
      'insufficient_scope',
      async () =>
        app().request('/v1/apps/word-cards?ids=x', {
          headers: { authorization: `Bearer ${await keys.accessToken({ scope: 'lists:read' })}` }
        })
    ],
    [
      'a malformed ID',
      'bad_request',
      async () =>
        app().request('/v1/apps/word-cards?ids=x', {
          headers: { authorization: `Bearer ${await keys.accessToken()}` }
        })
    ],
    [
      'an account over its limit',
      'rate_limited',
      async () =>
        app({ access: keys.access({ limit: 0 }) }).request('/v1/apps/word-cards?ids=x', {
          headers: { authorization: `Bearer ${await keys.accessToken()}` }
        })
    ],
    [
      'no account settings',
      'unavailable',
      async () => app({ access: null }).request('/v1/apps/word-cards?ids=x')
    ],
    [
      'a dictionary still loading',
      'starting',
      async () =>
        app({ ready: false }).request('/v1/apps/word-cards?ids=x', {
          headers: { authorization: `Bearer ${await keys.accessToken()}` }
        })
    ],
    [
      'a failing dictionary',
      'internal',
      async () =>
        app({ failing: true }).request(`/v1/apps/word-cards?ids=${'a'.repeat(32)}`, {
          headers: { authorization: `Bearer ${await keys.accessToken()}` }
        })
    ]
  ])('declares the code it answers %s with', async (_, code, request) => {
    const response = await request()
    expect(await answered(response)).toBe(code)
    expect(declaredCodes('/v1/apps/word-cards', response.status)).toContain(code)
  })
})
