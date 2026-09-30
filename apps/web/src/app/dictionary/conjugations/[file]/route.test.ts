import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getConjugationExamples, type PageExample } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ getConjugationExamples: vi.fn() }))

const example = { position: 0, text: '食べた。', tokens: [] } as unknown as PageExample

const get = (file: string) =>
  GET(new NextRequest(`https://zenbujapanese.com/dictionary/conjugations/${file}`))

describe('GET /dictionary/conjugations/<form>.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns every one of a form's examples at once", async () => {
    vi.mocked(getConjugationExamples).mockResolvedValue([example])
    const response = await get(`${encodeURIComponent('食べた')}.json`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ examples: [example] })
    expect(getConjugationExamples).toHaveBeenCalledWith('食べた')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    // It names no build, so it's kept only an hour.
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  test('a form no sentence uses has no examples', async () => {
    vi.mocked(getConjugationExamples).mockResolvedValue([])
    expect(await (await get(`${encodeURIComponent('食べさせられる')}.json`)).json()).toEqual({
      examples: []
    })
  })

  test('reads the form as written, not normalized', async () => {
    // The app's form screen searches Ｈした normalized but matches it as written.
    vi.mocked(getConjugationExamples).mockResolvedValue([])
    await get(`${encodeURIComponent('Ｈした')}.json`)
    expect(getConjugationExamples).toHaveBeenCalledWith('Ｈした')
  })

  test.each([
    ['a file that is not JSON', encodeURIComponent('食べた')],
    ['an empty form', '.json']
  ])('is not found for %s', async (_, file) => {
    expect((await get(file)).status).toBe(404)
    expect(getConjugationExamples).not.toHaveBeenCalled()
  })
})
