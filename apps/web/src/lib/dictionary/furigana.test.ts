import { afterEach, describe, expect, test, vi } from 'vitest'
import { dictionaryService } from './data'
import { furiganaAnswer } from './furigana'

vi.mock('./data', () => ({ dictionaryService: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
})

function serviceSegmenting(segmentation: (text: string) => Promise<unknown>) {
  const segment = vi.fn(segmentation)
  vi.mocked(dictionaryService).mockResolvedValue({ segmentation: segment } as never)
  return segment
}

describe('the furigana route', () => {
  test('answers the service’s segmentation as furigana over each word’s kanji, kept an hour and unindexed', async () => {
    const segment = serviceSegmenting(async () => ({
      build: 'build-1',
      data: {
        tokens: [
          { text: '今日', reading: 'きょう' },
          { text: 'は' },
          { text: '食べる', reading: 'たべる' }
        ]
      }
    }))
    const response = await furiganaAnswer('今日は食べる')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(await response.json()).toEqual({
      furigana: [
        { text: '今日', reading: 'きょう' },
        { text: 'は' },
        { text: '食', reading: 'た' },
        { text: 'べる' }
      ]
    })
    expect(segment).toHaveBeenCalledWith('今日は食べる')
  })

  test('asks for the text in its composed form', async () => {
    const segment = serviceSegmenting(async () => ({ build: 'b', data: { tokens: [] } }))
    await furiganaAnswer('カ\u{3099}ッコウ')
    expect(segment).toHaveBeenCalledWith('ガッコウ')
  })

  test('reads the fixtures without a service, and has nothing for a text they don’t hold', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    const response = await furiganaAnswer('大人')
    expect(await response.json()).toEqual({ furigana: [{ text: '大人', reading: 'おとな' }] })
    expect((await furiganaAnswer('知らない文章')).status).toBe(404)
  })

  test.each([
    ['no text', ''],
    ['a blank text', '  \n'],
    ['a text past the service’s 200 characters', 'あ'.repeat(201)]
  ])('refuses %s without asking the service', async (_, text) => {
    const segment = serviceSegmenting(async () => ({ build: 'b', data: { tokens: [] } }))
    const response = await furiganaAnswer(text)
    expect(response.status).toBe(400)
    expect(segment).not.toHaveBeenCalled()
  })

  test('answers 502 when the service fails, and logs it without the text', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    serviceSegmenting(async () => {
      throw new Error('The dictionary service answered 500 for /v1/segmentation/秘密の文')
    })
    const response = await furiganaAnswer('秘密の文')
    expect(response.status).toBe(502)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('furigana_unavailable'))
    expect(logged.mock.calls.flat().join('')).not.toContain('秘密')
  })
})
