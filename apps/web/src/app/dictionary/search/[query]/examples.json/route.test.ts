import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getMoreSearchExamples, type PageExample } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getMoreSearchExamples: vi.fn() }))

const example = { position: 25, text: '見る。', tokens: [] } as unknown as PageExample

function get(segment: string, query = '') {
  return GET(
    new NextRequest(`https://zenbujapanese.com/dictionary/search/${segment}/examples.json${query}`),
    { params: Promise.resolve({ query: segment }) }
  )
}

describe('GET /dictionary/search/<query>/examples.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns the next 25 of a search's example sentences", async () => {
    vi.mocked(getMoreSearchExamples).mockResolvedValue([example])
    const response = await get('%E8%A6%8B%E3%82%8B', '?build=b1&from=25')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ examples: [example] })
    expect(getMoreSearchExamples).toHaveBeenCalledWith('見る', 25, 'b1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test.each([
    ['the first page, which the page renders', 'eat', '?from=0'],
    ['a position between pages', 'eat', '?from=30'],
    ['a position past the app’s 100', 'eat', '?from=100'],
    ['a position that is no number', 'eat', '?from=x'],
    ['a query that isn’t normalized', 'EAT', '?from=25']
  ])('is not found for %s', async (_, segment, query) => {
    const response = await get(segment, query)
    expect(response.status).toBe(404)
    expect(getMoreSearchExamples).not.toHaveBeenCalled()
  })

  test('is not found for another build', async () => {
    vi.mocked(getMoreSearchExamples).mockResolvedValue(null)
    expect((await get('eat', '?build=old&from=25')).status).toBe(404)
  })
})
