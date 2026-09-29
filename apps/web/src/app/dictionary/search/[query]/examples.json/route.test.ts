import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSearchExamples, type PageExample, type SearchExamplesData } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getSearchExamples: vi.fn() }))

const example = { position: 25, text: '食べる。', tokens: [] } as unknown as PageExample
const found: SearchExamplesData = {
  query: '食べる',
  examples: [example],
  listed: 100,
  truncated: true,
  examplesPath: '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%82%8B/examples.json?build=b1'
}

/** A request for `segment`'s examples, the segment as the browser sends it. */
function get(segment: string, query = '') {
  return GET(
    new NextRequest(`https://zenbujapanese.com/dictionary/search/${segment}/examples.json${query}`)
  )
}

describe('GET /dictionary/search/<query>/examples.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns the next 25 of a search's examples, for the page's build", async () => {
    vi.mocked(getSearchExamples).mockResolvedValue(found)
    const response = await get(encodeURIComponent('食べる'), '?build=b1&from=25')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ examples: [example] })
    expect(getSearchExamples).toHaveBeenCalledWith('食べる', 25, 'b1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('reads a query with a dot or a slash from its encoded segment', async () => {
    vi.mocked(getSearchExamples).mockResolvedValue(found)
    await get('3%2E14', '?build=b1&from=25')
    await get('a%2Fb', '?build=b1&from=25')
    expect(vi.mocked(getSearchExamples).mock.calls.map(([query]) => query)).toEqual(['3.14', 'a/b'])
  })

  test.each([
    ['a query not in its normal form', 'Eat', '?from=25'],
    ['a position between pages', 'eat', '?from=30'],
    ['a position past the app’s 100', 'eat', '?from=100'],
    ['a position that is no number', 'eat', '?from=x']
  ])('is not found for %s', async (_, segment, query) => {
    const response = await get(segment, query)
    expect(response.status).toBe(404)
    expect(getSearchExamples).not.toHaveBeenCalled()
  })

  test('is not found for a search without examples, or another build', async () => {
    vi.mocked(getSearchExamples).mockResolvedValue(null)
    expect((await get('eat', '?build=b0&from=25')).status).toBe(404)
  })
})
