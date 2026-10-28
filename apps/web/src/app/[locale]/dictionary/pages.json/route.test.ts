import { NextRequest } from 'next/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { dictionaryService } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ dictionaryService: vi.fn() }))

const iru = 'd12d09f1107aef0f7d43b54b62f0b7e1'
const dropped = 'f'.repeat(32)

const get = (query: string, locale = 'en') =>
  GET(new NextRequest(`https://zenbujapanese.com/dictionary/pages.json?${query}`), {
    params: Promise.resolve({ locale })
  })

const asking = (query: Record<string, string>) => new URLSearchParams(query).toString()

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('GET /dictionary/pages.json', () => {
  test('answers the path of each word and kanji the service has a page for, kept an hour and never indexed', async () => {
    const pages = vi.fn(async () => ({
      build: 'b',
      data: { words: [{ languageReferenceID: iru, entSeq: 1546640, slug: '要る' }], kanji: ['日'] }
    }))
    vi.mocked(dictionaryService).mockResolvedValue({ pages } as never)
    const response = await get(asking({ words: `${iru},${dropped}`, kanji: '日,丢' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(await response.json()).toEqual({
      words: { [iru]: '/dictionary/要る-1546640/' },
      kanji: { 日: '/dictionary/search/%E6%97%A5/' }
    })
    expect(pages).toHaveBeenCalledWith({ words: [iru, dropped], kanji: ['日', '丢'] })
  })

  test('reads the fixtures without a service', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    const response = await get(asking({ words: `${iru},${dropped}`, kanji: '要,丢' }))
    expect(await response.json()).toEqual({
      words: { [iru]: '/dictionary/要る-1546640/' },
      kanji: { 要: '/dictionary/search/%E8%A6%81/' }
    })
  })

  test('says the service didn’t answer when it fails, so the page keeps its search links', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.mocked(dictionaryService).mockResolvedValue({
      pages: async () => {
        throw new Error('down')
      }
    } as never)
    expect((await get(asking({ words: iru }))).status).toBe(502)
  })

  test.each([
    ['nothing', ''],
    ['a word that is no Language Reference ID', asking({ words: 'taberu' })],
    ['two characters as one kanji', asking({ kanji: '日本' })]
  ])('refuses %s without asking the service', async (_, query) => {
    const response = await get(query)
    expect(response.status).toBe(400)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(dictionaryService).not.toHaveBeenCalled()
  })

  test('is not found under another language, since files are never prefixed', async () => {
    expect((await get(asking({ words: iru }), 'ja')).status).toBe(404)
    expect(dictionaryService).not.toHaveBeenCalled()
  })
})
