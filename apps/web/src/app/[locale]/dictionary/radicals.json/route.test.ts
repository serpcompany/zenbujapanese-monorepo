import { fixtureRadicals } from '@zenbu/dictionary-core/fixtures'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getRadicals } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getRadicals: vi.fn() }))

const get = (locale = 'en') =>
  GET(new Request(`https://zenbujapanese.com/dictionary/radicals.json`), {
    params: Promise.resolve({ locale })
  })

describe('GET /dictionary/radicals.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('answers the radical file the panel reads, kept an hour and never indexed', async () => {
    vi.mocked(getRadicals).mockResolvedValue(fixtureRadicals)
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(fixtureRadicals)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  test('is not found while the dictionary service has no radicals', async () => {
    vi.mocked(getRadicals).mockResolvedValue(null)
    const response = await get()
    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  test('is not found under another language, since files are never prefixed', async () => {
    expect((await get('ja')).status).toBe(404)
    expect(getRadicals).not.toHaveBeenCalled()
  })
})
