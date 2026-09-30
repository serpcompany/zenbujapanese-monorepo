import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getFormExamples, type PageExample } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getFormExamples: vi.fn() }))

const example = { position: 25, text: '見たか？', tokens: [] } as unknown as PageExample
const mita = encodeURIComponent('見た')

function get(file: string, query = '') {
  return GET(new NextRequest(`https://zenbujapanese.com/dictionary/examples/forms/${file}${query}`))
}

describe('GET /dictionary/examples/forms/<form>.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns the next 25 of a form's examples, by its spelling", async () => {
    vi.mocked(getFormExamples).mockResolvedValue([example])
    const response = await get(`${mita}.json`, '?build=b1&from=25')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ examples: [example] })
    expect(getFormExamples).toHaveBeenCalledWith('見た', 25, 'b1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('reads the form as written, not normalized', async () => {
    vi.mocked(getFormExamples).mockResolvedValue([])
    await get(`${encodeURIComponent('Ｈした')}.json`, '?build=b1&from=25')
    expect(getFormExamples).toHaveBeenCalledWith('Ｈした', 25, 'b1')
  })

  test.each([
    ['a file that is not JSON', mita, '?from=25'],
    ['a position between pages', `${mita}.json`, '?from=30'],
    ['a position past the app’s 100', `${mita}.json`, '?from=100'],
    ['a negative position', `${mita}.json`, '?from=-25'],
    ['a position that is no number', `${mita}.json`, '?from=x']
  ])('is not found for %s', async (_, file, query) => {
    const response = await get(file, query)
    expect(response.status).toBe(404)
    expect(getFormExamples).not.toHaveBeenCalled()
  })

  test('is not found for another build', async () => {
    vi.mocked(getFormExamples).mockResolvedValue(null)
    expect((await get(`${mita}.json`, '?from=25')).status).toBe(404)
  })
})
