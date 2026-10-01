import { describe, expect, test } from 'vitest'
import { movedPageResponse } from './moved-pages'

describe('movedPageResponse', () => {
  test.each([
    ['https://zenbujapanese.com/privacy', 'https://zenbujapanese.com/legal/privacy/'],
    ['https://zenbujapanese.com/privacy/', 'https://zenbujapanese.com/legal/privacy/'],
    [
      'https://staging.zenbujapanese.com/privacy?from=app',
      'https://staging.zenbujapanese.com/legal/privacy/?from=app'
    ]
  ])('sends %s to %s in one 308', (from, to) => {
    const response = movedPageResponse(new URL(from))
    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe(to)
  })

  test.each([
    'https://zenbujapanese.com/',
    'https://zenbujapanese.com/legal/privacy/',
    'https://zenbujapanese.com/privacy-policy/',
    'https://zenbujapanese.com/support'
  ])('leaves %s to the site', url => {
    expect(movedPageResponse(new URL(url))).toBeNull()
  })
})
