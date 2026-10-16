import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { OriginCanonical } from './origin-canonical'

afterEach(() => {
  vi.unstubAllEnvs()
})

const alternates = (origin: string) =>
  `<link rel="alternate" hrefLang="en" href="${origin}"/><link rel="alternate" hrefLang="ja" href="${origin}/ja/"/><link rel="alternate" hrefLang="x-default" href="${origin}"/>`

test.each([
  ['production', 'https://zenbujapanese.com'],
  ['staging', 'https://staging.zenbujapanese.com'],
  ['', 'https://zenbujapanese.com']
])('with SITE_ENV=%j, the homepage is canonical at %s, with no slash, and names its Japanese version', (env, origin) => {
  vi.stubEnv('SITE_ENV', env)
  expect(renderToStaticMarkup(<OriginCanonical locale="en" />)).toBe(
    `<link rel="canonical" href="${origin}"/><meta property="og:url" content="${origin}"/>${alternates(origin)}`
  )
})

test('the Japanese homepage is canonical at /ja/, with its slash, and names the English one', () => {
  vi.stubEnv('SITE_ENV', 'production')
  const origin = 'https://zenbujapanese.com'
  expect(renderToStaticMarkup(<OriginCanonical locale="ja" />)).toBe(
    `<link rel="canonical" href="${origin}/ja/"/><meta property="og:url" content="${origin}/ja/"/>${alternates(origin)}`
  )
})
