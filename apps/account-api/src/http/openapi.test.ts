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
      "Accounts, profiles, and sync for every Zenbu app (ADR 0011). Sign-in is under /v1/auth, Better Auth's routes, listed in docs/agents/account-api.md. Every error is the Error schema."
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

  test('covers every route the apps call besides sign-in', () => {
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(['/v1/health', '/v1/me', '/v1/sync'])
    expect(Object.keys(document.paths?.['/v1/me'] ?? {}).sort()).toEqual(['get', 'patch'])
  })
})
