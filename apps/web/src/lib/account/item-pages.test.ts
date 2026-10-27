import { describe, expect, test, vi } from 'vitest'
import { readItemPages } from './item-pages'

const word = (n: number) => n.toString(16).padStart(32, '0')

function dictionaryWith(pages: Record<string, string>) {
  const asked: URLSearchParams[] = []
  const fetcher = vi.fn(async (url: string) => {
    const query = new URL(url, 'https://zenbujapanese.com').searchParams
    asked.push(query)
    const having = (listed: string | null, key: (each: string) => string) =>
      Object.fromEntries(
        (listed ?? '')
          .split(',')
          .filter(each => pages[key(each)] !== undefined)
          .map(each => [each, pages[key(each)]])
      )
    return Response.json({
      words: having(query.get('words'), each => each),
      kanji: having(query.get('kanji'), each => `kanji:${each}`)
    })
  })
  return { fetcher, asked }
}

describe('the pages of saved words and kanji', () => {
  test('finds the page of each word and kanji the dictionary has, and which it has none for', async () => {
    const { fetcher, asked } = dictionaryWith({
      [word(1)]: '/dictionary/要る-1546640/',
      'kanji:要': '/dictionary/search/%E8%A6%81/'
    })
    const pages = await readItemPages(
      [word(1), word(2), word(1), 'kanji:要', 'kanji:丢', `wn1:${'a'.repeat(64)}`],
      fetcher
    )
    expect(Object.fromEntries(pages.paths)).toEqual({
      [word(1)]: '/dictionary/要る-1546640/',
      'kanji:要': '/dictionary/search/%E8%A6%81/'
    })
    expect([...pages.missing].sort()).toEqual([word(2), 'kanji:丢'])
    expect(asked.map(String)).toEqual([
      `words=${word(1)}%2C${word(2)}&kanji=${encodeURIComponent('要,丢')}`
    ])
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/^\/dictionary\/pages\.json\?/)
  })

  test('asks for 100 words at a time', async () => {
    const { fetcher, asked } = dictionaryWith({ [word(250)]: '/dictionary/x-1/' })
    const pages = await readItemPages(
      Array.from({ length: 250 }, (_, n) => word(n + 1)),
      fetcher
    )
    expect(asked.map(query => query.get('words')?.split(',').length)).toEqual([100, 100, 50])
    expect(pages.paths.get(word(250))).toBe('/dictionary/x-1/')
    expect(pages.missing.size).toBe(249)
  })

  test('asks nothing when no word or kanji is shown', async () => {
    const { fetcher } = dictionaryWith({})
    expect(await readItemPages([], fetcher)).toEqual({ paths: new Map(), missing: new Set() })
    expect(await readItemPages([`wn1:${'a'.repeat(64)}`, 'kanji:日本'], fetcher)).toEqual({
      paths: new Map(),
      missing: new Set()
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('counts no word as missing from an answer it didn’t get, so a note stays on its word', async () => {
    const failing = vi.fn(async () => new Response('down', { status: 502 }))
    expect(await readItemPages([word(1)], failing)).toEqual({
      paths: new Map(),
      missing: new Set()
    })
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await readItemPages([word(1)], offline)).toEqual({
      paths: new Map(),
      missing: new Set()
    })
  })
})
