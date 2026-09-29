import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSearchRows, type SearchWord } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getSearchRows: vi.fn() }))

const row = { id: 'x', entSeq: 1546640, headword: '要る' } as unknown as SearchWord

function get(segment: string, query = '') {
  return GET(
    new NextRequest(`https://zenbujapanese.com/dictionary/search/${segment}/results.json${query}`),
    { params: Promise.resolve({ query: segment }) }
  )
}

describe('GET /dictionary/search/<query>/results.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns the next 25 of a search's words", async () => {
    vi.mocked(getSearchRows).mockResolvedValue([row])
    const response = await get('%E3%81%84', '?build=b1&from=25')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rows: [row] })
    expect(getSearchRows).toHaveBeenCalledWith('い', 25, 'b1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test.each([
    ['the first page, which the page renders', 'iru', '?from=0'],
    ['a position between pages', 'iru', '?from=30'],
    ['a position past the app’s 60', 'iru', '?from=75'],
    ['a position that is no number', 'iru', '?from=x'],
    ['a query that isn’t normalized', 'IRU', '?from=25']
  ])('is not found for %s', async (_, segment, query) => {
    const response = await get(segment, query)
    expect(response.status).toBe(404)
    expect(getSearchRows).not.toHaveBeenCalled()
  })

  test('is not found for another build', async () => {
    vi.mocked(getSearchRows).mockResolvedValue(null)
    expect((await get('iru', '?build=old&from=25')).status).toBe(404)
  })
})
