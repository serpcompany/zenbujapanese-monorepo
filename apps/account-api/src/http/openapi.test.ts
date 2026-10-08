import { describe, expect, test } from 'vitest'
import { standIns } from '../test/app'
import { createApp } from './app'

const app = createApp(standIns)

const document = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: {
    title: 'Zenbu account service',
    version: '1',
    description:
      "Accounts, sign-in, profiles, and sync for every Zenbu app (ADR 0012). Sign-in is Better Auth's, under /v1/auth; a test holds each of its answers to this contract. Every error is the Error schema."
  },
  servers: [
    { url: 'https://api.zenbujapanese.com', description: 'Production' },
    { url: 'https://api-staging.zenbujapanese.com', description: 'Staging' }
  ]
})

describe('the OpenAPI contract', () => {
  test('is apps/account-api/openapi.json, written from the routes themselves', async () => {
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../../openapi.json')
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
