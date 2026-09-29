import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getWordExamples, isDictionaryAvailable, type PageExample } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({
  getWordExamples: vi.fn(),
  isDictionaryAvailable: vi.fn(() => true)
}))

const example = { position: 25, text: '見る。', tokens: [] } as unknown as PageExample

function get(file: string, query = '') {
  return GET(new NextRequest(`https://zenbujapanese.com/dictionary/examples/${file}${query}`), {
    params: Promise.resolve({ file })
  })
}

describe('GET /dictionary/examples/<ent_seq>.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns the next 25 of a word's examples", async () => {
    vi.mocked(getWordExamples).mockResolvedValue([example])
    const response = await get('1259290.json', '?build=b1&from=25')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ examples: [example] })
    expect(getWordExamples).toHaveBeenCalledWith(1259290, 25, 'b1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test.each([
    ['a file that is no word number', '見る.json', '?from=25'],
    ['a position between pages', '1259290.json', '?from=30'],
    ['a position past the app’s 100', '1259290.json', '?from=100'],
    ['a negative position', '1259290.json', '?from=-25'],
    ['a position that is no number', '1259290.json', '?from=x']
  ])('is not found for %s', async (_, file, query) => {
    const response = await get(file, query)
    expect(response.status).toBe(404)
    expect(getWordExamples).not.toHaveBeenCalled()
  })

  test('is not found for an unknown word or another build', async () => {
    vi.mocked(getWordExamples).mockResolvedValue(null)
    expect((await get('1.json', '?from=25')).status).toBe(404)
  })

  test('is not found where the dictionary is unavailable (production for now)', async () => {
    vi.mocked(isDictionaryAvailable).mockReturnValueOnce(false)
    expect((await get('1259290.json', '?from=25')).status).toBe(404)
  })
})
