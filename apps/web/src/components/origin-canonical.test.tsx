import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { OriginCanonical } from './origin-canonical'

afterEach(() => {
  vi.unstubAllEnvs()
})

test.each([
  ['production', 'https://zenbujapanese.com'],
  ['staging', 'https://staging.zenbujapanese.com'],
  ['', 'https://zenbujapanese.com']
])('with SITE_ENV=%j, the homepage is canonical at %s, with no slash', (env, origin) => {
  vi.stubEnv('SITE_ENV', env)
  expect(renderToStaticMarkup(<OriginCanonical />)).toBe(
    `<link rel="canonical" href="${origin}"/><meta property="og:url" content="${origin}"/>`
  )
})
