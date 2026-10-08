import { type ApiDocument, apiReference } from '@zenbu/node-service/api-reference'
import { describe, expect, test } from 'vitest'
import type { Scope } from '../domain/clients'
import { standIns } from '../test/app'
import { createApp } from './app'

const app = createApp(standIns)

const document = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: {
    title: 'Zenbu account service',
    version: '1',
    description: [
      "Accounts, sign-in, profiles, and sync for every Zenbu app (ADR 0013). Sign-in is Better Auth's, under /v1/auth; a test holds each of its answers to this contract.",
      '',
      '- **Errors.** Every error is `{ "error": { "code": "...", "message": "..." } }`. Branch on `code`, which is stable; `message` is for people and may change. A route may answer a code it doesn\'t list here, such as one from a Better Auth upgrade: handle it by its status.',
      "- **Apps.** A sign-in names its app in `X-Zenbu-Client`, unless it comes from one of the website's origins; the app decides the scopes its tokens carry.",
      '- **Bodies** are JSON, at most 64 KB (`413 too_large`).',
      "- **Rate limits** answer `429 too_many_requests` with `Retry-After`, in seconds (Better Auth's also with `X-Retry-After`).",
      "- **Browsers** may call the service only from the website's origins, with credentials; CORS lets the page read `Retry-After` and `X-Retry-After`."
    ].join('\n')
  },
  servers: [
    { url: 'https://api.zenbujapanese.com', description: 'Production' },
    { url: 'https://api-staging.zenbujapanese.com', description: 'Staging' }
  ]
})

type Operation = { security?: Record<string, string[]>[] }

const accessTokenRoutes = Object.entries(document.paths ?? {})
  .filter(([path]) => !path.startsWith('/v1/auth/'))
  .flatMap(([path, item]) =>
    Object.entries(item as Record<string, Operation>)
      .filter(([, operation]) => operation.security?.some(each => 'accessToken' in each))
      .map(([method, operation]) => ({
        path,
        method: method.toUpperCase(),
        scopes: operation.security?.flatMap(each => each.accessToken ?? []) ?? []
      }))
  )

function callWith(scopes: readonly string[], path: string, method: string) {
  const scoped = createApp({
    ...standIns,
    verifyAccessToken: async () => ({
      userId: 'someone',
      clientId: 'zenbu-ios',
      scopes: new Set(scopes as Scope[]),
      signedInAt: new Date()
    })
  })
  return scoped.request(path, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : '{}'
  })
}

function references(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(references)
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) =>
    key === '$ref' && typeof value === 'string' ? [value] : references(value)
  )
}

describe('the OpenAPI contract', () => {
  test('is apps/account-api/openapi.json, written from the routes themselves', async () => {
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../../openapi.json')
  })

  test('is docs/api/account-api.md, written from the contract for people', async () => {
    const reference = apiReference(document as ApiDocument, {
      document: 'apps/account-api/openapi.json',
      regenerate: 'apps/account-api',
      guide: { title: 'client guide', path: '../agents/account-clients.md' }
    })
    await expect(reference).toMatchFileSnapshot('../../../../docs/api/account-api.md')
  })

  test('refers only to schemas it holds', () => {
    const held = new Set(Object.keys(document.components?.schemas ?? {}))
    const missing = references(document).filter(
      ref => !held.has(ref.replace('#/components/schemas/', ''))
    )
    expect(missing).toEqual([])
  })

  test('covers every route the apps call, sign-in too', () => {
    const paths = Object.keys(document.paths ?? {})
    expect(paths.filter(path => !path.startsWith('/v1/auth/')).sort()).toEqual([
      '/v1/health',
      '/v1/me',
      '/v1/sync'
    ])
    expect(paths.filter(path => path.startsWith('/v1/auth/'))).toHaveLength(16)
    expect(Object.keys(document.paths?.['/v1/me'] ?? {}).sort()).toEqual(['delete', 'get', 'patch'])
  })

  test.each(
    accessTokenRoutes
  )('$method $path needs exactly the scopes it declares', async route => {
    const without = await callWith([], route.path, route.method)
    if (route.scopes.length === 0) {
      expect(without.status).not.toBe(403)
      return
    }
    expect(without.status).toBe(403)
    expect(await without.json()).toMatchObject({ error: { code: 'insufficient_scope' } })
    expect(without.headers.get('www-authenticate')).toContain(`scope="${route.scopes[0]}"`)
    expect((await callWith(route.scopes, route.path, route.method)).status).not.toBe(403)
  })

  test("gives patterns a client's validator can use, which accept what the service does", () => {
    const patterns = new Map<string, string>()
    const collect = (node: unknown, at: string) => {
      if (Array.isArray(node)) {
        for (const [index, item] of node.entries()) collect(item, `${at}/${index}`)
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'pattern' && typeof value === 'string') patterns.set(at, value)
          else collect(value, `${at}/${key}`)
        }
      }
    }
    collect(document, '')
    expect(patterns.size).toBeGreaterThan(0)
    for (const [at, pattern] of patterns) expect(() => new RegExp(pattern, 'u'), at).not.toThrow()
    const entityId = [...patterns].find(([at]) => at.endsWith('/entityId'))?.[1] ?? ''
    for (const id of [
      '0123456789abcdef0123456789abcdef',
      'kanji:見',
      `${'A'.repeat(36)}/kanji:見`
    ]) {
      expect(new RegExp(entityId, 'u').test(id), id).toBe(true)
    }
    expect(new RegExp(entityId, 'u').test('has space')).toBe(false)
  })
})
